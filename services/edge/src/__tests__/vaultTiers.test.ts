/**
 * Phase 2 — Secret tier classification + on-demand lazy loading (env.ts).
 *
 * Verifies getSecretTier bucketing and loadLazySecret's precedence
 * (env override → cache → vault) using a mocked stateProvider and the real
 * edgeSecrets crypto (system key sourced from FRONTBASE_API_KEYS).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptSecret } from '../config/edgeSecrets.js';

const TEST_KEY = 'fb_sys_tier_test_key_0123456789abcdef';

const mockGetEdgeSecret = vi.hoisted(() => vi.fn());
vi.mock('../storage/index.js', () => ({
    stateProvider: { getEdgeSecret: (...args: any[]) => mockGetEdgeSecret(...args) },
}));

import {
    getSecretTier, TIER_1_SECRETS, TIER_2_SECRETS, TIER_3_SECRETS,
    loadLazySecret, clearLazySecretCache, resetConfig,
} from '../config/env.js';

describe('Secret tier classification', () => {
    it('buckets known vars into the correct tier', () => {
        expect(getSecretTier('FRONTBASE_DATASOURCES')).toBe(1);
        expect(getSecretTier('FRONTBASE_STORAGE')).toBe(1);
        expect(getSecretTier('FRONTBASE_CACHE')).toBe(1);
        expect(getSecretTier('FRONTBASE_SECRETS_KEY')).toBe(1);

        expect(getSecretTier('FRONTBASE_AUTH')).toBe(2);
        expect(getSecretTier('FRONTBASE_API_KEYS')).toBe(2);
        expect(getSecretTier('FRONTBASE_AGENT_PROFILES')).toBe(2);

        expect(getSecretTier('FRONTBASE_STATE_DB')).toBe(3);
    });

    it('defaults unclassified FRONTBASE_* vars to Tier 2', () => {
        expect(getSecretTier('FRONTBASE_NEW_THING')).toBe(2);
    });

    it('keeps the tier sets mutually exclusive for known vars', () => {
        const all = [...TIER_1_SECRETS, ...TIER_2_SECRETS, ...TIER_3_SECRETS];
        expect(new Set(all).size).toBe(all.length); // no duplicates across tiers
    });
});

describe('loadLazySecret (on-demand vault loading)', () => {
    beforeEach(() => {
        process.env.FRONTBASE_API_KEYS = JSON.stringify({ systemKey: TEST_KEY });
        resetConfig('apiKeys');
        delete process.env.FRONTBASE_LAZY_TEST;
        mockGetEdgeSecret.mockReset();
        clearLazySecretCache();
    });

    it('returns the plaintext from the vault and decrypts it', async () => {
        const plaintext = JSON.stringify({ provider: 'redis', url: 'redis://localhost' });
        mockGetEdgeSecret.mockResolvedValue({
            value: await encryptSecret(plaintext, TEST_KEY),
            version: 1,
        });

        const result = await loadLazySecret('FRONTBASE_LAZY_TEST');
        expect(result).toBe(plaintext);
        expect(mockGetEdgeSecret).toHaveBeenCalledWith('FRONTBASE_LAZY_TEST');
    });

    it('process.env override always wins (never touches the vault)', async () => {
        process.env.FRONTBASE_LAZY_TEST = 'manual-from-env';
        mockGetEdgeSecret.mockResolvedValue({ value: await encryptSecret('from-vault', TEST_KEY), version: 1 });

        const result = await loadLazySecret('FRONTBASE_LAZY_TEST');
        expect(result).toBe('manual-from-env');
        expect(mockGetEdgeSecret).not.toHaveBeenCalled();
    });

    it('caches after the first vault hit (provider read once)', async () => {
        mockGetEdgeSecret.mockResolvedValue({
            value: await encryptSecret('cached-value', TEST_KEY),
            version: 1,
        });

        await loadLazySecret('FRONTBASE_LAZY_TEST');
        await loadLazySecret('FRONTBASE_LAZY_TEST');

        expect(mockGetEdgeSecret).toHaveBeenCalledTimes(1);
    });

    it('returns null when the vault is disabled (no system key)', async () => {
        delete process.env.FRONTBASE_API_KEYS;
        resetConfig('apiKeys');
        expect(await loadLazySecret('FRONTBASE_LAZY_TEST')).toBeNull();
        expect(mockGetEdgeSecret).not.toHaveBeenCalled();
    });

    it('returns null when the secret is absent', async () => {
        mockGetEdgeSecret.mockResolvedValue(null);
        expect(await loadLazySecret('FRONTBASE_LAZY_TEST')).toBeNull();
    });

    it('returns null on decryption failure (corrupt ciphertext) without throwing', async () => {
        mockGetEdgeSecret.mockResolvedValue({ value: 'not-valid-ciphertext!!!', version: 1 });
        await expect(loadLazySecret('FRONTBASE_LAZY_TEST')).resolves.toBeNull();
    });

    it('clearLazySecretCache forces the next read back through the vault', async () => {
        mockGetEdgeSecret.mockResolvedValue({
            value: await encryptSecret('v1', TEST_KEY), version: 1,
        });
        await loadLazySecret('FRONTBASE_LAZY_TEST');
        clearLazySecretCache();
        await loadLazySecret('FRONTBASE_LAZY_TEST');
        expect(mockGetEdgeSecret).toHaveBeenCalledTimes(2);
    });
});
