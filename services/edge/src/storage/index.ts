/**
 * State Provider Factory
 * 
 * Architecture:
 *   - Provider dispatched by FRONTBASE_STATE_DB_PROVIDER env var:
 *     - 'turso'     → TursoHttpProvider (default for cloud/BYOE)
 *     - 'cloudflare'→ CfD1HttpProvider (D1 via HTTP API)
 *     - 'neon'      → NeonHttpProvider (PG via @neondatabase/serverless)
 *     - 'supabase'  → NeonHttpProvider (Supabase pooler, same PG adapter)
 *   - Fallback (no provider set):
 *     - Cloud/CF Workers → TursoHttpProvider
 *     - Docker/local dev → LocalSqliteProvider
 * 
 * TursoHttpProvider uses lazy init (getDb()) — safe to instantiate even
 * before env vars are available (CF module evaluation).
 * 
 * LocalSqliteProvider is ONLY used in Docker. On CF builds, it's replaced
 * by an inert stub via esbuild plugin (see tsup.cloudflare-*.ts).
 *
 * NOTE: Turso/edge DB credentials are now managed via EdgeDatabase table +
 * connected accounts. The secrets_builder pushes FRONTBASE_STATE_DB_URL and
 * FRONTBASE_STATE_DB_TOKEN as env vars during deploy.
 */

import type { IStateProvider } from './IStateProvider';
import { TursoHttpProvider } from './TursoHttpProvider';
import { LocalSqliteProvider } from './LocalSqliteProvider';
import { getStateDbConfig } from '../config/env.js';
import { recordStateDbOp, registerDowngraders } from '../resilience.js';

// =============================================================================
// Mutable Singleton (supports hot-swap after startup sync)
// =============================================================================

let _provider: IStateProvider | null = null;

/**
 * Detect if we're running on CF Workers (adapter platform) or cloud mode.
 * On CF, LocalSqliteProvider is never used — Turso is the only option.
 */
function isCloudRuntime(): boolean {
    const cfg = getStateDbConfig();
    return (
        process.env.FRONTBASE_ADAPTER_PLATFORM === 'cloudflare' ||
        process.env.FRONTBASE_DEPLOYMENT_MODE === 'cloud' ||
        !['local', 'sqlite'].includes(cfg.provider) ||
        !!cfg.url
    );
}

/**
 * Create the initial state provider based on FRONTBASE_STATE_DB_PROVIDER.
 * 
 * Provider dispatch:
 *   turso      → TursoHttpProvider (libsql over HTTP)
 *   cloudflare → CfD1HttpProvider (D1 via CF HTTP API)
 *   neon       → NeonHttpProvider (@neondatabase/serverless)
 *   supabase   → NeonHttpProvider (Supabase pooler, same PG adapter)
 *   (unset)    → Auto-detect: cloud → Turso, docker → LocalSqlite
 */
function createInitialProvider(): IStateProvider {
    const provider = getStateDbConfig().provider?.toLowerCase();

    switch (provider) {
        case 'turso':
            console.log('☁️ Using TursoHttpProvider (explicit)');
            return new TursoHttpProvider();

        case 'sqlite':
            console.log('💾 Using LocalSqliteProvider (explicit sqlite)');
            return new LocalSqliteProvider();

        case 'cloudflare':
        case 'cloudflare_d1':
        case 'd1': {
            // Lazy import to avoid loading in non-CF builds
            const { CfD1HttpProvider } = require('./CfD1HttpProvider');
            console.log('🔶 Using CfD1HttpProvider (D1 via HTTP)');
            return new CfD1HttpProvider();
        }

        case 'neon': {
            const { NeonHttpProvider } = require('./NeonHttpProvider');
            console.log(`🐘 Using NeonHttpProvider (${provider})`);
            return new NeonHttpProvider();
        }

        case 'supabase': {
            const { SupabaseRestProvider } = require('./SupabaseRestProvider');
            console.log(`🐘 Using SupabaseRestProvider (PostgREST)`);
            return new SupabaseRestProvider();
        }

        default:
            // Legacy auto-detect fallback
            if (isCloudRuntime()) {
                if (!getStateDbConfig().url && !getStateDbConfig().cfAccountId) {
                    throw new Error(
                        `Edge Engine is deployed in the cloud but no remote State Database was configured. ` +
                        `Please attach a cloud database (Turso, Supabase, Neon, or D1) to this Edge Engine in the Frontbase dashboard and redeploy.`
                    );
                }
                console.log('☁️ Using TursoHttpProvider (auto-detect fallback)');
                return new TursoHttpProvider();
            }
            console.log('💾 Using LocalSqliteProvider');
            return new LocalSqliteProvider();
    }
}

export function getStateProvider(): IStateProvider {
    const configProvider = getStateDbConfig().provider?.toLowerCase();
    
    // Auto-upgrade: If env vars were empty during module eval (CF Workers) 
    // and are now available via polyfillEnv(), we must recreate the provider
    // if it mismatched the actual config provider.
    if (_provider) {
        let currentType = 'local';
        if (_provider instanceof TursoHttpProvider) currentType = 'turso';
        else if (_provider.constructor.name === 'CfD1HttpProvider') currentType = 'cloudflare';
        else if (_provider.constructor.name === 'NeonHttpProvider') currentType = 'neon';
        else if (_provider.constructor.name === 'SupabaseRestProvider') currentType = 'supabase';
        else if ((_provider as any)._isStub) currentType = 'stub';

        // Map all D1 spellings to 'cloudflare' for comparison
        const targetType = (configProvider === 'cloudflare_d1' || configProvider === 'd1')
            ? 'cloudflare'
            : (configProvider || 'local');

        if (currentType !== targetType && targetType !== 'local') {
            console.log(`🔄 Env vars became available. Swapping provider from ${currentType} to ${targetType}`);
            _provider = createInitialProvider();
        }
    }

    if (!_provider) {
        _provider = createInitialProvider();
    }
    return _provider;
}

/**
 * Replace the state provider (Sprint 2D graceful downgrade). On quota exhaustion
 * or failure, the resilience module swaps to a LocalSqliteProvider on Docker so
 * the edge keeps serving; on cloud there's no filesystem, so no swap there.
 */
export function setStateProvider(provider: IStateProvider): void {
    _provider = provider;
    console.log('🔄 State provider swapped (resilience downgrade)');
}

// =============================================================================
// Init Gate — ensures migrations complete before any DB operation
// =============================================================================

let _initPromise: Promise<void> | null = null;

/**
 * Ensure the state provider is initialized (migrations applied).
 * Returns a cached promise — safe to call from multiple concurrent requests.
 */
export function ensureInitialized(): Promise<void> {
    if (!_initPromise) {
        const provider = getStateProvider();
        _initPromise = provider.init().catch((err) => {
            // Reset so next call retries
            _initPromise = null;
            throw err;
        });
    }
    return _initPromise;
}

/** 
 * Global state provider proxy.
 * Defers provider creation to method invocation (not property access)
 * so it survives CF Workers' module evaluation phase.
 * 
 * IMPORTANT: Every method call awaits ensureInitialized() first,
 * guaranteeing migrations are applied before any DB operation.
 * This prevents the CF Worker race where the first import request
 * hits Turso before runStartupSync() finishes migrations.
 */
export const stateProvider: IStateProvider = new Proxy({} as IStateProvider, {
    get(_target, prop: string) {
        // init() delegates to ensureInitialized() for dedup
        if (prop === 'init') {
            return () => ensureInitialized();
        }
        return async (...args: any[]) => {
            await ensureInitialized();
            recordStateDbOp(); // Sprint 2B: heuristic quota counter (no-op without FRONTBASE_DB_LIMITS)
            const provider = getStateProvider();
            const value = (provider as any)[prop];
            if (typeof value === 'function') {
                return value.apply(provider, args);
            }
            return value;
        };
    }
});

// Sprint 2D: register the state-DB downgrade action. On Docker (not cloud) a
// quota/ failure swaps the provider to local SQLite so the edge keeps serving.
registerDowngraders({
    stateDb: () => {
        if (!isCloudRuntime()) {
            try {
                setStateProvider(new LocalSqliteProvider());
            } catch (err) {
                console.warn('[Resilience] state-DB downgrade failed:', err);
            }
        } else {
            console.warn('[Resilience] state-DB degraded on cloud — no local fallback (read-only)');
        }
    },
});

export type { IStateProvider, ProjectSettingsData, PublishedPageSummary, WorkflowData, ExecutionData, NewExecutionData, ExecutionStats } from './IStateProvider';
