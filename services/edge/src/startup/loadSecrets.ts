/**
 * Boot-Time Secret Loader — Local Vault → process.env
 *
 * On engine startup, after the state DB is initialized, this decrypts every
 * secret in the local vault (`edge_secrets` table) into `process.env` so the
 * rest of the engine boots as if those vars had been set in `.env`.
 *
 * This is what makes the "No-Code" standalone experience work: the user sets
 * only `FRONTBASE_SYSTEM_KEY`, the control plane pushes everything else via
 * POST /api/config/secrets, and on (re)start the engine reconstructs its
 * environment from the encrypted vault.
 *
 * Precedence: a variable already present in the environment (e.g. explicitly
 * set in `.env` / docker-compose) ALWAYS wins — the vault never clobbers a
 * manual override. See docs/edge-local-vault.md §Verification (scenario 5).
 *
 * Robustness: any failure (missing key, unsupported provider, corrupt row, bad
 * key) is logged and skipped — the engine must still boot. The vault is
 * defense-in-depth, not a boot dependency.
 */

import { stateProvider } from '../storage/index.js';
import { getVaultSystemKey, decryptSecret } from '../config/edgeSecrets.js';
import { resetConfig, getSecretTier, prewarmTier2 } from '../config/env.js';

/**
 * Env vars that must NOT be sourced from the vault at boot:
 *   - FRONTBASE_STATE_DB selects the state provider, which is already
 *     initialized (and the vault read through it) by the time we run. Changing
 *     it now can't re-create the provider, so loading it is a misleading no-op.
 *     It belongs in `.env`.
 */
const BOOT_EXCLUDED = new Set<string>(['FRONTBASE_STATE_DB']);

/**
 * Load vault secrets into process.env. Call once during startup, after
 * `stateProvider.init()` has applied migrations (so the `edge_secrets` table
 * exists). Safe to call when the vault is empty or unsupported (no-op).
 *
 * Phase 3 boot strategy (see docs/plans/phase-3-async-accessors.md):
 *   - Tier-1 (boot-critical) secrets are decrypted EAGERLY (blocking). The
 *     engine cannot initialize its providers without them.
 *   - Tier-2 (operational) secrets are deferred to a background prewarm
 *     (prewarmTier2, fired below) so boot latency stays O(Tier-1) instead of
 *     O(all secrets). The async accessors (getXxxConfigAsync) and the prewarm
 *     materialize them on demand / shortly after boot.
 */
export async function loadEdgeSecrets(options?: {
    /**
     * Fire the Tier-2 background prewarm after the eager Tier-1 load
     * (default true). Tests that want to control prewarm timing themselves
     * pass false — the unawaited prewarm would otherwise race an explicit
     * prewarmTier2() call against the same state provider.
     */
    backgroundPrewarm?: boolean;
}): Promise<void> {
    const backgroundPrewarm = options?.backgroundPrewarm ?? true;
    const systemKey = getVaultSystemKey();
    if (!systemKey) {
        // No system key ⇒ vault disabled. This is normal for engines that still
        // use plain `.env`. Not an error.
        console.log('[EdgeSecrets] No FRONTBASE_SYSTEM_KEY — local vault disabled');
        return;
    }

    // Only Drizzle-backed providers (LocalSqlite, Turso) implement these.
    if (typeof stateProvider.listEdgeSecrets !== 'function') {
        console.log('[EdgeSecrets] State provider does not support the local vault — skipping');
        return;
    }

    let names: string[];
    try {
        names = (await stateProvider.listEdgeSecrets()).map((s) => s.name);
    } catch (err) {
        console.error('[EdgeSecrets] Failed to read vault index:', err);
        return;
    }

    if (names.length === 0) {
        console.log('[EdgeSecrets] Vault empty — nothing to load');
        return;
    }

    let loaded = 0;
    let skipped = 0;
    let deferred = 0;
    const failed: string[] = [];

    for (const name of names) {
        if (BOOT_EXCLUDED.has(name)) {
            skipped++;
            continue;
        }

        // Manual override precedence: never clobber a value already in the env.
        if (process.env[name] !== undefined && process.env[name] !== '') {
            skipped++;
            continue;
        }

        // Tier 3 (bootstrap / non-sensitive) should never be sourced from the
        // vault. If one is present, skip it loudly rather than silently.
        if (getSecretTier(name) === 3) {
            console.warn(`[EdgeSecrets] Tier-3 secret '${name}' found in vault — skipping (bootstrap/config only)`);
            skipped++;
            continue;
        }

        // Phase 3: defer Tier-2 (operational) secrets to the background prewarm
        // so boot does not block on their decrypts. They load on-demand via the
        // async accessors, or shortly after boot via prewarmTier2() below.
        if (getSecretTier(name) !== 1) {
            deferred++;
            continue;
        }

        try {
            const row = await stateProvider.getEdgeSecret?.(name);
            if (!row) {
                skipped++;
                continue;
            }
            const plaintext = await decryptSecret(row.value, systemKey);
            process.env[name] = plaintext;
            loaded++;
        } catch (err) {
            failed.push(name);
            console.error(`[EdgeSecrets] Failed to load '${name}':`, err);
        }
    }

    // Force every lazy config singleton to re-parse from the now-populated env.
    // Without this, getters cached before this run (e.g. getCacheConfig) would
    // keep returning the empty/none defaults.
    resetConfig('all');

    console.log(
        `[EdgeSecrets] Loaded ${loaded} Tier-1 secret(s) from vault` +
            (deferred ? `, deferred ${deferred} Tier-2 (background prewarm)` : '') +
            (skipped ? `, skipped ${skipped} (env override / excluded / tier-3)` : '') +
            (failed.length ? `, failed: ${failed.join(', ')}` : ''),
    );

    // Phase 3: background-prewarm the deferred Tier-2 secrets without blocking
    // boot. A failure here is logged inside prewarmTier2 and never fatal — the
    // async accessors can still materialize on demand later.
    if (deferred > 0 && backgroundPrewarm) {
        void prewarmTier2().catch((err) => {
            console.error('[EdgeSecrets] Tier-2 background prewarm failed:', err);
        });
    }
}
