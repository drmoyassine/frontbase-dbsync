/**
 * Phase 2 — Vault Key Rotation & Export/Import (facade layer, real SQLite +
 * real WebCrypto). The stateProvider singleton is proxied to a real
 * LocalSqliteProvider so rotateVaultKey / verifyVaultKey / exportVault /
 * importVault run end-to-end.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalSqliteProvider } from '../storage/LocalSqliteProvider';
import { encryptSecret, decryptSecret } from '../config/edgeSecrets.js';

// Proxy stateProvider → holder.provider (a real LocalSqliteProvider).
const holder = vi.hoisted(() => ({ provider: null as any }));
vi.mock('../storage/index.js', () => ({
    stateProvider: new Proxy({}, {
        get: (_t, prop: string) => {
            const fn = holder.provider?.[prop];
            return typeof fn === 'function' ? fn.bind(holder.provider) : undefined;
        },
    }),
}));

import { rotateVaultKey, verifyVaultKey } from '../config/keyRotation.js';
import { exportVault, importVault, EXPORT_FORMAT_VERSION, sha256, canonicalSecrets } from '../config/export.js';

const OLD_KEY = 'fb_sys_old_rotation_key_0123456789ab';
const NEW_KEY = 'fb_sys_new_rotation_key_9876543210ba';

async function seed(name: string, plaintext: string, key: string) {
    const ct = await encryptSecret(plaintext, key);
    await holder.provider.setEdgeSecret(name, ct);
}

describe('Vault key rotation', () => {
    beforeEach(async () => {
        process.env.PAGES_DB_URL = ':memory:';
        process.env.FRONTBASE_API_KEYS = JSON.stringify({ systemKey: OLD_KEY });
        holder.provider = new LocalSqliteProvider();
        await holder.provider.init();
    });

    it('re-encrypts every secret under the new key and verifies round-trip', async () => {
        await seed('FRONTBASE_DATASOURCES', JSON.stringify({ type: 'redis', url: 'redis://x' }), OLD_KEY);
        await seed('FRONTBASE_CACHE', JSON.stringify({ provider: 'upstash', url: 'https://c' }), OLD_KEY);

        const result = await rotateVaultKey(OLD_KEY, NEW_KEY);

        expect(result.success).toBe(true);
        expect(result.progress.total).toBe(2);
        expect(result.progress.completed).toBe(2);
        expect(result.progress.failed).toBe(0);
        expect(result.newKeyEncryptedWithOld).toBeTruthy();

        // Both secrets now decrypt only with the NEW key.
        for (const [name, expected] of [
            ['FRONTBASE_DATASOURCES', JSON.stringify({ type: 'redis', url: 'redis://x' })],
            ['FRONTBASE_CACHE', JSON.stringify({ provider: 'upstash', url: 'https://c' })],
        ] as const) {
            const row = await holder.provider.getEdgeSecret(name);
            expect(await decryptSecret(row!.value, NEW_KEY)).toBe(expected);
            await expect(decryptSecret(row!.value, OLD_KEY)).rejects.toThrow();
        }
    });

    it('is idempotent — resuming a partially-completed rotation succeeds', async () => {
        await seed('PARTIAL_1', 'val1', OLD_KEY);
        await seed('PARTIAL_2', 'val2', OLD_KEY);
        await seed('PARTIAL_3', 'val3', OLD_KEY);

        // Simulate an interruption: rotate just PARTIAL_1 under the new key.
        const row1 = await holder.provider.getEdgeSecret('PARTIAL_1');
        const pt1 = await decryptSecret(row1!.value, OLD_KEY);
        await holder.provider.setEdgeSecret('PARTIAL_1', await encryptSecret(pt1, NEW_KEY));

        // Full rotation must complete all three (PARTIAL_1 via new-key fallback).
        const result = await rotateVaultKey(OLD_KEY, NEW_KEY);
        expect(result.success).toBe(true);
        expect(result.progress.completed).toBe(3);
        expect(result.progress.failed).toBe(0);

        for (const [name, expected] of [['PARTIAL_1', 'val1'], ['PARTIAL_2', 'val2'], ['PARTIAL_3', 'val3']] as const) {
            const row = await holder.provider.getEdgeSecret(name);
            expect(await decryptSecret(row!.value, NEW_KEY)).toBe(expected);
        }
    });

    it('rejects when old and new keys are identical', async () => {
        await expect(rotateVaultKey(OLD_KEY, OLD_KEY)).rejects.toThrow(/differ/i);
    });

    it('verifyVaultKey reports valid / corrupted correctly', async () => {
        await seed('VERIFY_A', 'a', OLD_KEY);
        await seed('VERIFY_B', 'b', OLD_KEY);

        const ok = await verifyVaultKey(OLD_KEY);
        expect(ok.valid).toBe(true);
        expect(ok.total).toBe(2);
        expect(ok.corrupted).toEqual([]);

        const bad = await verifyVaultKey(NEW_KEY);
        expect(bad.valid).toBe(false);
        expect(bad.corrupted.sort()).toEqual(['VERIFY_A', 'VERIFY_B']);
    });
});

describe('Vault export / import', () => {
    beforeEach(async () => {
        process.env.PAGES_DB_URL = ':memory:';
        process.env.FRONTBASE_API_KEYS = JSON.stringify({ systemKey: OLD_KEY });
        holder.provider = new LocalSqliteProvider();
        await holder.provider.init();
    });

    it('exports every secret with a canonical SHA-256 checksum', async () => {
        await seed('FRONTBASE_CACHE', 'cache-ct', OLD_KEY);
        await seed('FRONTBASE_QUEUE', 'queue-ct', OLD_KEY);

        const bundle = await exportVault();

        expect(bundle.formatVersion).toBe(EXPORT_FORMAT_VERSION);
        expect(bundle.secrets).toHaveLength(2);
        expect(bundle.checksum).toMatch(/^[a-f0-9]{64}$/);
        // Checksum is order-independent: recompute from a re-sorted copy.
        const recomputed = await sha256(canonicalSecrets(bundle.secrets));
        expect(recomputed).toBe(bundle.checksum);
    });

    it('throws on checksum mismatch (tamper detection)', async () => {
        await seed('FRONTBASE_CACHE', 'cache-ct', OLD_KEY);
        const bundle = await exportVault();
        bundle.checksum = 'deadbeef';
        await expect(importVault(bundle)).rejects.toThrow(/checksum/i);
    });

    it('throws on an unsupported format version', async () => {
        await expect(importVault({
            formatVersion: 999, exportedAt: 't', secrets: [], checksum: await sha256('[]'),
        } as any)).rejects.toThrow(/format version/i);
    });

    it('verifyOnly validates without writing', async () => {
        await seed('FRONTBASE_CACHE', 'cache-ct', OLD_KEY);
        const bundle = await exportVault();
        const result = await importVault(bundle, { verifyOnly: true });
        expect(result.imported).toBe(0);
        expect(result.skipped).toBe(bundle.secrets.length);
    });

    it('skips existing secrets unless force=true', async () => {
        await seed('FRONTBASE_CACHE', 'original-ct', OLD_KEY);
        const bundle = await exportVault();

        const skipped = await importVault(bundle); // already exists → skip
        expect(skipped.imported).toBe(0);
        expect(skipped.skipped).toBe(1);

        const forced = await importVault(bundle, { force: true });
        expect(forced.imported).toBe(1);
    });

    it('imports ciphertext that decrypts with the original key', async () => {
        // Build a bundle by hand (encrypted with OLD_KEY, matching the system key set in beforeEach)
        // and import into empty vault.
        const ciphertext = await encryptSecret('imported-value', OLD_KEY);
        const secrets = [{
            name: 'FRONTBASE_IMPORT_TEST', version: 1, ciphertext,
            createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        }];
        const bundle = {
            formatVersion: EXPORT_FORMAT_VERSION,
            exportedAt: '2026-01-01T00:00:00.000Z',
            secrets,
            checksum: await sha256(canonicalSecrets(secrets)),
        };

        const result = await importVault(bundle);
        expect(result.success).toBe(true);
        expect(result.imported).toBe(1);

        const row = await holder.provider.getEdgeSecret('FRONTBASE_IMPORT_TEST');
        expect(await decryptSecret(row!.value, OLD_KEY)).toBe('imported-value');
    });
});
