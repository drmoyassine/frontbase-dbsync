/**
 * Tenant Secrets Resolver — Decrypt and cache per-tenant secrets from state-DB.
 *
 * On community/shared workers (real tenant slug), per-tenant secret blobs live
 * as AES-256-GCM ciphertext rows in the worker's own state-DB (table
 * `tenant_secrets`). This module reads a row, decrypts it with the worker's key,
 * and caches the plaintext briefly.
 *
 * On single-tenant engines (self-host / dedicated BYOE, slug `_default` or
 * undefined) this is a no-op — callers fall back to env-var blobs unchanged.
 *
 * Cipher format (matches the FastAPI control plane, app/services/edge_secrets_push.py):
 *   base64( nonce(12 bytes) || ciphertext || GCM-tag(16 bytes) )
 *
 * Key resolution (V2: rotation + HKDF):
 *   1. FRONTBASE_SECRETS_KEY            — the active key (random or HKDF-derived)
 *   2. FRONTBASE_SECRETS_KEY_OLD        — retained old key during a rotation
 *                                         transition window (graceful fallback)
 *   3. HKDF(system_key)                 — if neither env key is present, derive
 *                                         locally from the engine's system_key
 *                                         (pure HKDF mode; self-sufficient).
 *
 * AGENTS.md §2.1: Edge Self-Sufficiency — no calls to FastAPI at request time.
 */

import { isMultiTenantSlug } from '../storage/IStateProvider.js';
import { stateProvider } from '../storage/index.js';
import { getApiKeysConfig } from './env.js';

// =============================================================================
// Tenant slug validation (security hardening)
// =============================================================================

/**
 * Validate tenant slug format to prevent cache poisoning and injection.
 *
 * Allowed format: 1-100 chars, alphanumeric plus hyphen/underscore, must start
 * with a letter. This matches the expected tenant slug format from the backend.
 * Returns false for empty, '_default', or malformed slugs.
 */
function isValidTenantSlug(slug: string): boolean {
    if (!slug || slug === '_default') return false;
    if (slug.length > 100) return false;
    // Must start with letter, contain only alphanumeric/hyphen/underscore
    return /^[a-z][a-z0-9_-]*$/i.test(slug);
}

// =============================================================================
// In-memory cache (per isolate / process)
// =============================================================================

interface CachedSecret {
    plaintext: any;
    decryptedAt: number;
}

const SECRET_CACHE = new Map<string, CachedSecret>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// Base64 helpers (standard alphabet — Python ↔ WebCrypto interop)
// =============================================================================

/** Decode a standard base64 string to a Uint8Array backed by a real ArrayBuffer. */
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

/** Encode a Uint8Array to standard base64. */
function bytesToBase64(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

// =============================================================================
// AES-256-GCM decryption (WebCrypto)
// =============================================================================

/**
 * Decrypt a tenant secret blob.
 * Returns the UTF-8 plaintext JSON string. Throws on wrong key / tamper (GCM
 * auth-tag failure) — callers try the next candidate key.
 */
async function decryptAesGcm(ciphertextB64: string, keyB64: string): Promise<string> {
    const keyData = base64ToBytes(keyB64);
    const raw = base64ToBytes(ciphertextB64);

    if (raw.length < 13) {
        throw new Error('ciphertext too short');
    }

    // nonce is the first 12 bytes; the rest is ciphertext || GCM auth tag.
    const nonce = raw.slice(0, 12);
    const encrypted = raw.slice(12);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
    );

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce },
        cryptoKey,
        encrypted,
    );

    return new TextDecoder().decode(decrypted);
}

// =============================================================================
// HKDF key derivation (V2) — RFC 5869, matches Python control plane
// =============================================================================

/**
 * Domain-separation constants. The system_key is already per-engine unique
 * (see edge_client.generate_system_key), so a fixed salt yields a per-engine
 * derived key without this worker needing to know its engine_id. MUST match
 * app/services/edge_secrets_push.py (_HKDF_SALT / _HKDF_INFO) byte-for-byte.
 */
const HKDF_SALT = 'frontbase-secrets-v2';
const HKDF_INFO = 'aes-256-gcm';

/**
 * Derive a 256-bit AES-GCM key from the engine's system_key via HKDF-SHA256.
 *
 * Deterministic: the same system_key always yields the same key, so this edge
 * worker and the control plane agree without a shared stored secret. Used as a
 * fallback when FRONTBASE_SECRETS_KEY is absent (pure HKDF mode) and for
 * cross-language interop verification.
 *
 * Exported for testing (Python ↔ WebCrypto interop vector).
 */
export async function deriveSecretsKeyFromSystemKey(systemKey: string): Promise<string> {
    const ikm = new TextEncoder().encode(systemKey);
    const salt = new TextEncoder().encode(HKDF_SALT);
    const info = new TextEncoder().encode(HKDF_INFO);

    const baseKey = await crypto.subtle.importKey(
        'raw',
        ikm,
        { name: 'HKDF' },
        false,
        ['deriveBits'],
    );

    const derivedBits = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt, info },
        baseKey,
        256, // 32 bytes
    );

    return bytesToBase64(new Uint8Array(derivedBits));
}

/**
 * Collect the ordered list of candidate decryption keys for this worker.
 *
 * Order matters: the active key first (common case), then the retained old key
 * (rotation transition), then an HKDF-derived key as a last-resort local
 * derivation when no env key is configured.
 */
async function resolveCandidateKeys(): Promise<string[]> {
    const candidates: string[] = [];
    const active = process.env.FRONTBASE_SECRETS_KEY;
    if (active) candidates.push(active);
    const oldKey = process.env.FRONTBASE_SECRETS_KEY_OLD;
    if (oldKey) candidates.push(oldKey);

    // Pure HKDF mode: no env key present — derive locally from the system_key
    // this worker already holds for M2M auth.
    if (candidates.length === 0) {
        const systemKey = getApiKeysConfig().systemKey;
        if (systemKey) {
            try {
                candidates.push(await deriveSecretsKeyFromSystemKey(systemKey));
            } catch (err) {
                console.error('[TenantSecrets] HKDF local derivation failed:', err);
            }
        }
    }
    return candidates;
}

/** Try each candidate key until one decrypts the blob; return parsed plaintext. */
async function decryptWithCandidates(
    ciphertextB64: string,
    kind: string,
): Promise<any | null> {
    const candidates = await resolveCandidateKeys();
    if (candidates.length === 0) {
        console.error('[TenantSecrets] No decryption key available on shared worker');
        return null;
    }

    let lastErr: unknown = null;
    for (const key of candidates) {
        try {
            const plaintextJson = await decryptAesGcm(ciphertextB64, key);
            return JSON.parse(plaintextJson);
        } catch (err) {
            // Wrong key / tamper — remember and try the next candidate.
            lastErr = err;
        }
    }
    // All candidates failed — redact tenant identifier in production logs.
    console.error(`[TenantSecrets] Decryption failed for kind=${kind} (all keys):`, lastErr);
    return null;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Resolve a decrypted tenant secret for the given kind.
 *
 * @returns the parsed plaintext, or null when:
 *   - the request is single-tenant (caller should use the env-var blob), or
 *   - no row exists in state-DB (caller falls back), or
 *   - decryption fails under every candidate key (logged; caller falls back).
 */
export async function getTenantSecret(
    kind: string,
    tenantSlug: string | undefined,
): Promise<any> {
    if (!isMultiTenantSlug(tenantSlug)) return null;

    // Security: validate tenant slug format before use
    if (!isValidTenantSlug(tenantSlug!)) {
        console.error(`[TenantSecrets] Invalid tenant slug format`);
        return null;
    }

    const cacheKey = `${tenantSlug}:${kind}`;
    const cached = SECRET_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.decryptedAt < CACHE_TTL_MS) {
        return cached.plaintext;
    }

    const ciphertext = await stateProvider.getTenantSecret(tenantSlug!, kind);
    if (!ciphertext) return null;

    const plaintext = await decryptWithCandidates(ciphertext, kind);
    if (plaintext === null) return null;

    SECRET_CACHE.set(cacheKey, { plaintext, decryptedAt: Date.now() });
    return plaintext;
}

/** Drop a single cached entry (called when the control plane pushes a fresh row). */
export function invalidateTenantSecret(kind: string, tenantSlug: string): void {
    // Security: validate tenant slug format before use
    if (!isValidTenantSlug(tenantSlug)) {
        console.error(`[TenantSecrets] Invalid tenant slug format in invalidate`);
        return;
    }
    SECRET_CACHE.delete(`${tenantSlug}:${kind}`);
}

/** Drop all cached entries (cache flush / reconfigure). */
export function clearAllTenantSecretsCache(): void {
    SECRET_CACHE.clear();
}

