/**
 * Tenant Secrets (V2) — HKDF derivation + dual-key rotation fallback.
 *
 * Verifies:
 *   - HKDF-SHA256 matches the Python control-plane interop test vector
 *   - HKDF is deterministic and varies per system_key
 *   - getTenantSecret decrypts with the active key
 *   - getTenantSecret falls back to FRONTBASE_SECRETS_KEY_OLD during rotation
 *   - getTenantSecret derives locally via HKDF when no env key is present
 *   - all-keys-fail returns null, and the in-memory cache short-circuits
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks (vi.mock factories run before imports) ────────────────────

const envState = vi.hoisted(() => ({ systemKey: undefined as string | undefined }));
const mockGetTenantSecret = vi.hoisted(() => vi.fn());

vi.mock('../config/env.js', () => ({
    getApiKeysConfig: () => ({ systemKey: envState.systemKey }),
}));

vi.mock('../storage/index.js', () => ({
    stateProvider: {
        getTenantSecret: (...args: any[]) => mockGetTenantSecret(...args),
    },
}));

import {
    getTenantSecret,
    deriveSecretsKeyFromSystemKey,
    clearAllTenantSecretsCache,
} from '../config/tenantSecrets.js';

// ── AES-256-GCM encrypt helper (mirror of the module's decrypt format) ───────

async function aesGcmEncrypt(plaintextJson: string, keyB64: string): Promise<string> {
    const keyBytes = base64ToBytes(keyB64);
    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
    );
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder().encode(plaintextJson);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cryptoKey, enc);
    const combined = new Uint8Array(nonce.length + ct.byteLength);
    combined.set(nonce, 0);
    combined.set(new Uint8Array(ct), nonce.length);
    return bytesToBase64(combined);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

// ── Test data ────────────────────────────────────────────────────────────────

const SYSTEM_KEY_A = 'fb_sys_' + 'ab'.repeat(32);
const SYSTEM_KEY_B = 'fb_sys_' + 'cd'.repeat(32);

describe('HKDF derivation (deriveSecretsKeyFromSystemKey)', () => {
    it('matches the Python control-plane interop test vector', async () => {
        // system_key = fb_sys_ + 0xAB repeated 32 times
        // derived     = g8M10/6E31wEgOUc93zaLY3+5bPJLZIZGOANyIAlfFQ=
        const derived = await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_A);
        expect(derived).toBe('g8M10/6E31wEgOUc93zaLY3+5bPJLZIZGOANyIAlfFQ=');
    });

    it('is deterministic for the same system_key', async () => {
        const a = await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_A);
        const b = await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_A);
        expect(a).toBe(b);
    });

    it('differs per system_key', async () => {
        const a = await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_A);
        const b = await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_B);
        expect(a).not.toBe(b);
    });

    it('produces a 32-byte key (standard base64)', async () => {
        const derived = await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_A);
        const raw = base64ToBytes(derived);
        expect(raw.length).toBe(32);
    });
});

describe('getTenantSecret — key resolution + rotation fallback', () => {
    const PLAINTEXT = JSON.stringify({ 'ds-1': { type: 'neon', connectionString: 'pg://...' } });

    let savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
        savedEnv = {
            FRONTBASE_SECRETS_KEY: process.env.FRONTBASE_SECRETS_KEY,
            FRONTBASE_SECRETS_KEY_OLD: process.env.FRONTBASE_SECRETS_KEY_OLD,
        };
        delete process.env.FRONTBASE_SECRETS_KEY;
        delete process.env.FRONTBASE_SECRETS_KEY_OLD;
        envState.systemKey = undefined;
        mockGetTenantSecret.mockReset();
        clearAllTenantSecretsCache();
    });

    afterEach(() => {
        process.env.FRONTBASE_SECRETS_KEY = savedEnv.FRONTBASE_SECRETS_KEY;
        process.env.FRONTBASE_SECRETS_KEY_OLD = savedEnv.FRONTBASE_SECRETS_KEY_OLD;
    });

    it('decrypts with the active FRONTBASE_SECRETS_KEY', async () => {
        const key = await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_A);
        process.env.FRONTBASE_SECRETS_KEY = key;
        const ct = await aesGcmEncrypt(PLAINTEXT, key);
        mockGetTenantSecret.mockResolvedValue(ct);

        const result = await getTenantSecret('datasources', 'acme');

        expect(result).toEqual({ 'ds-1': { type: 'neon', connectionString: 'pg://...' } });
    });

    it('falls back to FRONTBASE_SECRETS_KEY_OLD when the active key fails', async () => {
        // Active key is a fresh random one (rotation just happened); ciphertext
        // is still encrypted with the OLD key during the transition window.
        const oldKey = await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_B);
        process.env.FRONTBASE_SECRETS_KEY = await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_A);
        process.env.FRONTBASE_SECRETS_KEY_OLD = oldKey;
        const ct = await aesGcmEncrypt(PLAINTEXT, oldKey);
        mockGetTenantSecret.mockResolvedValue(ct);

        const result = await getTenantSecret('datasources', 'acme');

        expect(result).toEqual({ 'ds-1': { type: 'neon', connectionString: 'pg://...' } });
    });

    it('derives the key locally via HKDF when no env key is configured', async () => {
        envState.systemKey = SYSTEM_KEY_A; // pure HKDF mode
        const derived = await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_A);
        const ct = await aesGcmEncrypt(PLAINTEXT, derived);
        mockGetTenantSecret.mockResolvedValue(ct);

        const result = await getTenantSecret('datasources', 'acme');

        expect(result).toEqual({ 'ds-1': { type: 'neon', connectionString: 'pg://...' } });
    });

    it('returns null when every candidate key fails', async () => {
        process.env.FRONTBASE_SECRETS_KEY = await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_A);
        const ct = await aesGcmEncrypt(PLAINTEXT, await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_B));
        mockGetTenantSecret.mockResolvedValue(ct);

        const result = await getTenantSecret('datasources', 'acme');

        expect(result).toBeNull();
    });

    it('caches plaintext for the TTL window (provider hit once)', async () => {
        const key = await deriveSecretsKeyFromSystemKey(SYSTEM_KEY_A);
        process.env.FRONTBASE_SECRETS_KEY = key;
        const ct = await aesGcmEncrypt(PLAINTEXT, key);
        mockGetTenantSecret.mockResolvedValue(ct);

        await getTenantSecret('datasources', 'acme');
        await getTenantSecret('datasources', 'acme');

        expect(mockGetTenantSecret).toHaveBeenCalledTimes(1);
    });

    it('returns null for single-tenant (non-multi-tenant) slugs', async () => {
        const result1 = await getTenantSecret('datasources', undefined);
        const result2 = await getTenantSecret('datasources', '_default');
        expect(result1).toBeNull();
        expect(result2).toBeNull();
        expect(mockGetTenantSecret).not.toHaveBeenCalled();
    });
});
