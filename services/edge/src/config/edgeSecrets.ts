/**
 * Edge Secrets — Local Vault crypto utilities (standalone/self-hosted engines).
 *
 * The local vault stores engine-level infrastructure credentials (datasources,
 * cache, queue, …) as AES-256-GCM ciphertext in the engine's own state-DB
 * (`edge_secrets` table). This eliminates manual `.env` juggling for BYO-
 * infrastructure deployments: the user configures `FRONTBASE_SYSTEM_KEY` once
 * and the control plane pushes everything else through POST /api/config/secrets.
 *
 * Key separation: the vault key is derived from the same `FRONTBASE_SYSTEM_KEY`
 * the engine already holds for M2M auth, but through a *distinct* HKDF `info`
 * label so it can never be confused with the auth key or the per-tenant
 * secrets key (`tenant_secrets`). See the "Key Hierarchy" appendix in
 * docs/edge-local-vault.md.
 *
 *   FRONTBASE_SYSTEM_KEY
 *     ├─ HKDF(info="edge-secrets-encryption")  → THIS vault key
 *     └─ HKDF(info="aes-256-gcm")              → tenant_secrets key (existing)
 *
 * Cipher format (mirrors the FastAPI control plane + tenantSecrets.ts):
 *   base64( nonce(12 bytes) || ciphertext || GCM-tag(16 bytes) )
 *
 * Security model (docs/edge-local-vault.md §Deployment Paradigms): in self-hosted
 * single-tenant deployments the infrastructure owner already holds
 * FRONTBASE_SYSTEM_KEY, so encryption here is defense-in-depth against disk
 * theft / backup exposure — not against the owner.
 */

import { getApiKeysConfig } from './env.js';

// =============================================================================
// Domain-separation constants
// =============================================================================

/**
 * MUST differ from tenantSecrets.ts (`'aes-256-gcm'`) so the two key purposes
 * never collide even though both derive from FRONTBASE_SYSTEM_KEY.
 */
const HKDF_SALT = 'frontbase-secrets-v2';
const HKDF_INFO = 'edge-secrets-encryption';
const NONCE_LENGTH = 12; // AES-GCM standard nonce

// =============================================================================
// Base64 helpers (standard alphabet — chunked to avoid call-stack overflow on
// large blobs; the naive `String.fromCharCode(...arr)` throws on big arrays)
// =============================================================================

/** Decode a standard base64 string to a Uint8Array backed by a real ArrayBuffer. */
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

/** Encode a Uint8Array to standard base64 (chunked to dodge stack limits). */
function bytesToBase64(bytes: Uint8Array): string {
    const CHUNK = 0x8000; // 32 KB
    let bin = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

// =============================================================================
// HKDF key derivation — RFC 5869
// =============================================================================

/**
 * Derive a 256-bit AES-GCM CryptoKey from the engine's system key.
 * Deterministic: the same system key always yields the same CryptoKey, so the
 * POST endpoint (encrypt) and the boot loader (decrypt) agree without any
 * shared stored secret.
 */
async function deriveVaultKey(systemKey: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(systemKey),
        'HKDF',
        false,
        ['deriveKey'],
    );

    return crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: encoder.encode(HKDF_SALT),
            info: encoder.encode(HKDF_INFO),
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Resolve the engine's system key (the single user-managed secret). Returns
 * null when none is configured — callers should treat the vault as disabled.
 */
export function getVaultSystemKey(): string | null {
    return getApiKeysConfig().systemKey || null;
}

/**
 * Encrypt a plaintext secret string into the vault cipher format.
 * Returns base64(nonce || ciphertext || GCM-tag).
 */
export async function encryptSecret(plaintext: string, systemKey: string): Promise<string> {
    const key = await deriveVaultKey(systemKey);
    const encoder = new TextEncoder();

    // Fresh random nonce per encryption — critical for GCM security.
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce },
        key,
        encoder.encode(plaintext),
    );

    const ctBytes = new Uint8Array(ciphertext);
    const combined = new Uint8Array(nonce.length + ctBytes.length);
    combined.set(nonce, 0);
    combined.set(ctBytes, nonce.length);

    return bytesToBase64(combined);
}

/**
 * Decrypt a vault cipher string back to plaintext. Throws on wrong key / tamper
 * (GCM auth-tag failure) — callers should catch and treat as a load failure.
 */
export async function decryptSecret(ciphertextB64: string, systemKey: string): Promise<string> {
    if (ciphertextB64.length < 16) {
        throw new Error('ciphertext too short');
    }

    const key = await deriveVaultKey(systemKey);
    const raw = base64ToBytes(ciphertextB64);

    const nonce = raw.subarray(0, NONCE_LENGTH);
    const encrypted = raw.subarray(NONCE_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce },
        key,
        encrypted,
    );

    return new TextDecoder().decode(decrypted);
}
