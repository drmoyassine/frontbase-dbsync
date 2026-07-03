/**
 * Phase 3 Part 1 — Async Scoped Accessors & Background Tier-2 Prewarm.
 *
 * Verifies the safe-core implementation of Phase 3:
 *   - getApiKeysConfigSync() returns null until the config is materialized,
 *     then the cached singleton (hot-path fast path).
 *   - getXxxConfigAsync() vault-aware accessors materialize a Tier-2 secret
 *     from the vault on demand and rebuild the cached singleton.
 *   - prewarmTier2() materializes every Tier-2 secret + resets singletons.
 *   - loadEdgeSecrets() now loads ONLY Tier-1 eagerly and DEFERS Tier-2 to the
 *     background prewarm (boot latency stays O(Tier-1)).
 *
 * Uses real SQLite + real WebCrypto + a proxied LocalSqliteProvider, mirroring
 * vaultPhase2Fixes.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalSqliteProvider } from '../storage/LocalSqliteProvider';

const TEST_KEY = 'fb_sys_phase3_async_key_0123456789abcdef';

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
vi.mock('../engine/agent/auto-register.js', () => ({ invalidateAutoToolCache: () => {} }));

import { encryptSecret } from '../config/edgeSecrets.js';
import {
    getApiKeysConfig,
    getApiKeysConfigSync,
    getApiKeysConfigAsync,
    getCacheConfig,
    getCacheConfigAsync,
    getAgentProfilesConfigAsync,
    resetConfig,
    clearLazySecretCache,
    prewarmTier2,
    TIER_1_SECRETS,
    TIER_2_SECRETS,
} from '../config/env.js';
import { loadEdgeSecrets } from '../startup/loadSecrets.js';

// The set of FRONTBASE_* env vars these tests touch — reset between tests so
// materialization state never leaks across cases.
const ENV_VARS = [
    'FRONTBASE_API_KEYS', 'FRONTBASE_AUTH', 'FRONTBASE_CACHE', 'FRONTBASE_QUEUE',
    'FRONTBASE_VECTOR', 'FRONTBASE_GPU', 'FRONTBASE_AGENT_PROFILES', 'FRONTBASE_SECURITY',
    'FRONTBASE_DATASOURCES', 'FRONTBASE_STORAGE',
];

describe('Phase 3 Part 1 — Async accessors & prewarm', () => {
    beforeEach(async () => {
        for (const k of ENV_VARS) delete process.env[k];
        process.env.PAGES_DB_URL = ':memory:';
        // Vault system key resolution reads FRONTBASE_API_KEYS.systemKey.
        process.env.FRONTBASE_API_KEYS = JSON.stringify({ systemKey: TEST_KEY });
        holder.provider = new LocalSqliteProvider();
        await holder.provider.init();
        resetConfig('all');
        clearLazySecretCache();
    });

    // -------------------------------------------------------------------------
    // getApiKeysConfigSync — hot-path fast path
    // -------------------------------------------------------------------------

    it('getApiKeysConfigSync() returns null before any materialization', () => {
        expect(getApiKeysConfigSync()).toBeNull();
    });

    it('getApiKeysConfigSync() returns the cached singleton after getApiKeysConfig()', () => {
        const cfg = getApiKeysConfig();
        expect(cfg.systemKey).toBe(TEST_KEY);
        // Now the synchronous snapshot is available for the auth hot path.
        expect(getApiKeysConfigSync()).not.toBeNull();
        expect(getApiKeysConfigSync()!.systemKey).toBe(TEST_KEY);
    });

    it('getApiKeysConfigAsync() materializes FRONTBASE_AUTH from the vault and rebuilds the singleton', async () => {
        // Seed a multi-tenant-style FRONTBASE_AUTH directly in env first to
        // confirm the async path returns it; then clear and seed the vault.
        const authBlob = JSON.stringify({ provider: 'supabase', jwtSecret: 's3cret' });
        await holder.provider.setEdgeSecret('FRONTBASE_AUTH', await encryptSecret(authBlob, TEST_KEY));

        // Not in env yet → sync getter would default. Async accessor loads it.
        expect(process.env.FRONTBASE_AUTH).toBeUndefined();
        const cfg = await getApiKeysConfigAsync();
        expect(process.env.FRONTBASE_AUTH).toBe(authBlob);
        expect(cfg.systemKey).toBe(TEST_KEY); // still resolves from FRONTBASE_API_KEYS
        // Singleton is cached → sync snapshot now populated.
        expect(getApiKeysConfigSync()).not.toBeNull();
    });

    // -------------------------------------------------------------------------
    // Async vault-aware accessors (cache)
    // -------------------------------------------------------------------------

    it('getCacheConfigAsync() loads FRONTBASE_CACHE from the vault on demand', async () => {
        const cacheBlob = JSON.stringify({ provider: 'redis', url: 'redis://x' });
        await holder.provider.setEdgeSecret('FRONTBASE_CACHE', await encryptSecret(cacheBlob, TEST_KEY));

        // Sync getter with empty env returns the default (provider: none).
        expect(getCacheConfig().provider).toBe('none');

        // Async accessor materializes from the vault and rebuilds the singleton.
        const cfg = await getCacheConfigAsync();
        expect(cfg.provider).toBe('redis');
        expect(cfg.url).toBe('redis://x');
        // And the sync singleton now reflects it (prewarm-style).
        expect(getCacheConfig().provider).toBe('redis');
    });

    it('getAgentProfilesConfigAsync() returns {} gracefully when the secret is absent', async () => {
        const cfg = await getAgentProfilesConfigAsync();
        expect(cfg).toEqual({});
    });

    // -------------------------------------------------------------------------
    // prewarmTier2 — background materialization of all Tier-2 secrets
    // -------------------------------------------------------------------------

    it('prewarmTier2() materializes every Tier-2 secret present in the vault', async () => {
        const authBlob = JSON.stringify({ provider: 'supabase' });
        const gpuBlob = JSON.stringify([{ slug: 'llama', modelId: 'llama', modelType: 'llm', provider: 'ollama' }]);
        await holder.provider.setEdgeSecret('FRONTBASE_AUTH', await encryptSecret(authBlob, TEST_KEY));
        await holder.provider.setEdgeSecret('FRONTBASE_GPU', await encryptSecret(gpuBlob, TEST_KEY));

        const { loaded, failed } = await prewarmTier2();
        // FRONTBASE_API_KEYS is in env already (set in beforeEach) so it counts
        // as materialized; FRONTBASE_AUTH + FRONTBASE_GPU come from the vault.
        expect(failed).toEqual([]);
        expect(loaded).toBeGreaterThanOrEqual(2);
        expect(process.env.FRONTBASE_AUTH).toBe(authBlob);
        expect(JSON.parse(process.env.FRONTBASE_GPU!)).toHaveLength(1);
    });

    it('prewarmTier2() never throws on a corrupt vault row (best-effort)', async () => {
        await holder.provider.setEdgeSecret('FRONTBASE_AUTH', 'not-valid-ciphertext');
        // loadLazySecret swallows decrypt errors and returns null, so a corrupt
        // row is silently skipped — prewarm completes without throwing.
        const { loaded, failed } = await prewarmTier2();
        expect(failed).toEqual([]); // no exception propagated
        expect(process.env.FRONTBASE_AUTH).toBeUndefined(); // corrupt row not materialized
        // FRONTBASE_API_KEYS is already in env (beforeEach) → still counts as loaded.
        expect(loaded).toBeGreaterThanOrEqual(1);
    });

    // -------------------------------------------------------------------------
    // loadEdgeSecrets — Tier-1 eager, Tier-2 deferred
    // -------------------------------------------------------------------------

    it('loadEdgeSecrets() loads Tier-1 eagerly but DEFERS Tier-2 to prewarm', async () => {
        const cacheBlob = JSON.stringify({ provider: 'redis' }); // Tier-1
        const authBlob = JSON.stringify({ provider: 'supabase' }); // Tier-2
        await holder.provider.setEdgeSecret('FRONTBASE_CACHE', await encryptSecret(cacheBlob, TEST_KEY));
        await holder.provider.setEdgeSecret('FRONTBASE_AUTH', await encryptSecret(authBlob, TEST_KEY));

        // FRONTBASE_API_KEYS is set in beforeEach (manual override) so it's skipped.
        // backgroundPrewarm: false — the fire-and-forget prewarm would race the
        // explicit prewarmTier2() below (concurrent reads on the same provider),
        // making the deferral assertions nondeterministic.
        await loadEdgeSecrets({ backgroundPrewarm: false });

        // Tier-1 loaded eagerly into env.
        expect(process.env.FRONTBASE_CACHE).toBe(cacheBlob);
        // Tier-2 NOT loaded eagerly — deferred to background prewarm.
        expect(process.env.FRONTBASE_AUTH).toBeUndefined();

        // After prewarm, Tier-2 is materialized.
        await prewarmTier2();
        expect(process.env.FRONTBASE_AUTH).toBe(authBlob);
    });

    it('loadEdgeSecrets() skips Tier-3 (FRONTBASE_STATE_DB) even if present in the vault', async () => {
        await holder.provider.setEdgeSecret('FRONTBASE_STATE_DB', await encryptSecret('{"provider":"local"}', TEST_KEY));
        await loadEdgeSecrets();
        expect(process.env.FRONTBASE_STATE_DB).toBeUndefined();
    });

    it('tier sets keep Tier-1 (cache/queue/datasources/storage) eager and Tier-2 lazy', () => {
        expect(TIER_1_SECRETS.has('FRONTBASE_CACHE')).toBe(true);
        expect(TIER_1_SECRETS.has('FRONTBASE_QUEUE')).toBe(true);
        expect(TIER_2_SECRETS.has('FRONTBASE_AUTH')).toBe(true);
        expect(TIER_2_SECRETS.has('FRONTBASE_AGENT_PROFILES')).toBe(true);
        // No overlap.
        const overlap = [...TIER_1_SECRETS].filter((s) => TIER_2_SECRETS.has(s));
        expect(overlap).toEqual([]);
    });
});
