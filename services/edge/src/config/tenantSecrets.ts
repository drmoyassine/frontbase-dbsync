/**
 * Tenant Secrets Resolver — Decrypt and cache per-tenant secrets from state-DB.
 *
 * On community/shared workers (real tenant slug), per-tenant secret blobs live
 * as AES-256-GCM ciphertext rows in the worker's own state-DB (table
 * `tenant_secrets`). This module reads a row, decrypts it with the worker's
 * FRONTBASE_SECRETS_KEY env var, and caches the plaintext briefly.
 *
 * On single-tenant engines (self-host / dedicated BYOE, slug `_default` or
 * undefined) this is a no-op — callers fall back to env-var blobs unchanged.
 *
 * Cipher format (matches the FastAPI control plane, app/services/edge_secrets_push.py):
 *   base64( nonce(12 bytes) || ciphertext || GCM-tag(16 bytes) )
 * Key: FRONTBASE_SECRETS_KEY = standard base64 of 32 raw bytes.
 *
 * AGENTS.md §2.1: Edge Self-Sufficiency — no calls to FastAPI at request time.
 */

import { isMultiTenantSlug } from '../storage/IStateProvider.js';
import { stateProvider } from '../storage/index.js';

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
// AES-256-GCM decryption (WebCrypto)
// =============================================================================

/** Decode a standard base64 string to a Uint8Array backed by a real ArrayBuffer. */
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

/**
 * Decrypt a tenant secret blob.
 * Returns the UTF-8 plaintext JSON string.
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
// Public API
// =============================================================================

/**
 * Resolve a decrypted tenant secret for the given kind.
 *
 * @returns the parsed plaintext, or null when:
 *   - the request is single-tenant (caller should use the env-var blob), or
 *   - no row exists in state-DB (caller falls back), or
 *   - decryption fails (logged; caller falls back / fails the request).
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

    const secretsKey = process.env.FRONTBASE_SECRETS_KEY;
    if (!secretsKey) {
        console.error('[TenantSecrets] FRONTBASE_SECRETS_KEY not set on shared worker');
        return null;
    }

    try {
        const plaintextJson = await decryptAesGcm(ciphertext, secretsKey);
        const plaintext = JSON.parse(plaintextJson);
        SECRET_CACHE.set(cacheKey, { plaintext, decryptedAt: Date.now() });
        return plaintext;
    } catch (error) {
        // Security: redact tenant identifier from logs in production
        console.error(`[TenantSecrets] Decryption failed for kind=${kind}:`, error);
        return null;
    }
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
