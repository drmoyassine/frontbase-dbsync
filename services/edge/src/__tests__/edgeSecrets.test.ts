/**
 * Tests for the Edge Local Vault:
 *   - config/edgeSecrets.ts    — AES-256-GCM + HKDF crypto
 *   - startup/loadSecrets.ts   — boot-time loader into process.env
 *
 * See docs/edge-local-vault.md §Verification Plan.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encryptSecret, decryptSecret } from '../config/edgeSecrets.js';
import { resetConfig } from '../config/env.js';

const TEST_KEY = 'fb_sys_test_key_for_vault_0123456789';

// -----------------------------------------------------------------------------
// Hoisted mock for the state provider singleton consumed by the boot loader.
// -----------------------------------------------------------------------------
const { mockProvider } = vi.hoisted(() => ({
    mockProvider: {
        listEdgeSecrets: vi.fn() as any,
        getEdgeSecret: vi.fn() as any,
        setEdgeSecret: vi.fn() as any,
        deleteEdgeSecret: vi.fn() as any,
    },
}));

vi.mock('../storage/index.js', () => ({
    stateProvider: mockProvider,
}));

// loadEdgeSecrets is imported dynamically after the mock is in place.
let loadEdgeSecrets: typeof import('../startup/loadSecrets.js').loadEdgeSecrets;

beforeEach(async () => {
    // System key lands here (baked into FRONTBASE_API_KEYS as systemKey).
    process.env.FRONTBASE_API_KEYS = JSON.stringify({ systemKey: TEST_KEY });
    resetConfig('apiKeys');

    // Clean slate for vault-managed vars.
    delete process.env.FRONTBASE_DATASOURCES;
    delete process.env.FRONTBASE_CACHE;
    delete process.env.FRONTBASE_STATE_DB;

    mockProvider.listEdgeSecrets = vi.fn();
    mockProvider.getEdgeSecret = vi.fn();

    ({ loadEdgeSecrets } = await import('../startup/loadSecrets.js'));
});

afterEach(() => {
    vi.clearAllMocks();
});

// =============================================================================
// Crypto — config/edgeSecrets.ts
// =============================================================================

describe('edgeSecrets crypto (AES-256-GCM + HKDF)', () => {
    it('round-trips a plaintext secret through encrypt → decrypt', async () => {
        const plaintext = JSON.stringify({ type: 'postgres', connectionString: 'postgres://user:pass@host/db' });
        const ciphertext = await encryptSecret(plaintext, TEST_KEY);

        expect(ciphertext).not.toEqual(plaintext);
        // Ciphertext must not leak the plaintext.
        expect(ciphertext).not.toContain('postgres');
        expect(ciphertext).not.toContain('pass');

        const decrypted = await decryptSecret(ciphertext, TEST_KEY);
        expect(decrypted).toBe(plaintext);
    });

    it('produces a distinct ciphertext each call (random nonce)', async () => {
        const a = await encryptSecret('same-secret', TEST_KEY);
        const b = await encryptSecret('same-secret', TEST_KEY);
        expect(a).not.toEqual(b);
        // ...yet both decrypt to the same value.
        expect(await decryptSecret(a, TEST_KEY)).toBe('same-secret');
        expect(await decryptSecret(b, TEST_KEY)).toBe('same-secret');
    });

    it('fails decryption with the wrong system key (GCM auth-tag)', async () => {
        const ciphertext = await encryptSecret('secret-value', TEST_KEY);
        await expect(decryptSecret(ciphertext, 'fb_sys_a_completely_different_key')).rejects.toThrow();
    });

    it('rejects truncated / corrupt ciphertext', async () => {
        await expect(decryptSecret('short', TEST_KEY)).rejects.toThrow();
        await expect(decryptSecret('aGVsbG8=', TEST_KEY)).rejects.toThrow(); // valid base64, < nonce len
    });
});

// =============================================================================
// Boot loader — startup/loadSecrets.ts
// =============================================================================

describe('loadEdgeSecrets boot loader', () => {
    it('decrypts vault secrets into process.env', async () => {
        const value = JSON.stringify({ type: 'redis', url: 'redis://localhost' });
        mockProvider.listEdgeSecrets.mockResolvedValue([{ name: 'FRONTBASE_CACHE', version: 1, updatedAt: 'now' }]);
        mockProvider.getEdgeSecret.mockResolvedValue({ value: await encryptSecret(value, TEST_KEY), version: 1 });

        await loadEdgeSecrets();

        expect(process.env.FRONTBASE_CACHE).toBe(value);
        expect(mockProvider.getEdgeSecret).toHaveBeenCalledWith('FRONTBASE_CACHE');
    });

    it('respects a manual .env override (never clobbers)', async () => {
        process.env.FRONTBASE_CACHE = 'manual-from-env';
        mockProvider.listEdgeSecrets.mockResolvedValue([{ name: 'FRONTBASE_CACHE', version: 1, updatedAt: 'now' }]);
        mockProvider.getEdgeSecret.mockResolvedValue({ value: await encryptSecret('from-vault', TEST_KEY), version: 1 });

        await loadEdgeSecrets();

        expect(process.env.FRONTBASE_CACHE).toBe('manual-from-env');
        expect(mockProvider.getEdgeSecret).not.toHaveBeenCalled();
    });

    it('skips FRONTBASE_STATE_DB (bootstrap var — provider already initialized)', async () => {
        mockProvider.listEdgeSecrets.mockResolvedValue([{ name: 'FRONTBASE_STATE_DB', version: 1, updatedAt: 'now' }]);
        mockProvider.getEdgeSecret.mockResolvedValue({ value: await encryptSecret('{"provider":"turso"}', TEST_KEY), version: 1 });

        await loadEdgeSecrets();

        expect(process.env.FRONTBASE_STATE_DB).toBeUndefined();
        expect(mockProvider.getEdgeSecret).not.toHaveBeenCalled();
    });

    it('handles a corrupted secret without failing the engine', async () => {
        mockProvider.listEdgeSecrets.mockResolvedValue([
            { name: 'FRONTBASE_DATASOURCES', version: 1, updatedAt: 'now' },
            { name: 'FRONTBASE_CACHE', version: 1, updatedAt: 'now' },
        ]);
        mockProvider.getEdgeSecret.mockImplementation(async (name: string) => {
            if (name === 'FRONTBASE_DATASOURCES') {
                return { value: 'not-valid-ciphertext!!!', version: 1 };
            }
            return { value: await encryptSecret('{"provider":"none"}', TEST_KEY), version: 1 };
        });

        // Must not throw — the engine must still boot.
        await expect(loadEdgeSecrets()).resolves.toBeUndefined();

        // Corrupted one stays unset; the good one still loads.
        expect(process.env.FRONTBASE_DATASOURCES).toBeUndefined();
        expect(process.env.FRONTBASE_CACHE).toBe('{"provider":"none"}');
    });

    it('is a no-op when FRONTBASE_SYSTEM_KEY is not configured', async () => {
        delete process.env.FRONTBASE_API_KEYS;
        resetConfig('apiKeys');

        await loadEdgeSecrets();

        expect(mockProvider.listEdgeSecrets).not.toHaveBeenCalled();
    });

    it('is a no-op when the provider does not support the vault', async () => {
        const saved = mockProvider.listEdgeSecrets;
        // Simulate a provider that implements IStateProvider directly (no vault methods).
        (mockProvider as any).listEdgeSecrets = undefined;

        await loadEdgeSecrets();

        expect(process.env.FRONTBASE_CACHE).toBeUndefined();

        (mockProvider as any).listEdgeSecrets = saved;
    });

    it('is a no-op when the vault is empty', async () => {
        mockProvider.listEdgeSecrets.mockResolvedValue([]);

        await loadEdgeSecrets();

        expect(mockProvider.getEdgeSecret).not.toHaveBeenCalled();
    });
});
