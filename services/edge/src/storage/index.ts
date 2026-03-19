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

// =============================================================================
// Mutable Singleton (supports hot-swap after startup sync)
// =============================================================================

let _provider: IStateProvider | null = null;

/**
 * Detect if we're running on CF Workers (adapter platform) or cloud mode.
 * On CF, LocalSqliteProvider is never used — Turso is the only option.
 */
function isCloudRuntime(): boolean {
    return (
        process.env.FRONTBASE_ADAPTER_PLATFORM === 'cloudflare' ||
        process.env.FRONTBASE_DEPLOYMENT_MODE === 'cloud' ||
        !!process.env.FRONTBASE_STATE_DB_URL
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
    const provider = process.env.FRONTBASE_STATE_DB_PROVIDER?.toLowerCase();

    switch (provider) {
        case 'turso':
            console.log('☁️ Using TursoHttpProvider (explicit)');
            return new TursoHttpProvider();

        case 'cloudflare':
        case 'cloudflare_d1': {
            // Lazy import to avoid loading in non-CF builds
            const { CfD1HttpProvider } = require('./CfD1HttpProvider');
            console.log('🔶 Using CfD1HttpProvider (D1 via HTTP)');
            return new CfD1HttpProvider();
        }

        case 'neon':
        case 'supabase': {
            const { NeonHttpProvider } = require('./NeonHttpProvider');
            console.log(`🐘 Using NeonHttpProvider (${provider})`);
            return new NeonHttpProvider();
        }

        default:
            // Legacy auto-detect fallback
            if (isCloudRuntime()) {
                console.log('☁️ Using TursoHttpProvider (auto-detect)');
                return new TursoHttpProvider();
            }
            console.log('💾 Using LocalSqliteProvider');
            return new LocalSqliteProvider();
    }
}

export function getStateProvider(): IStateProvider {
    // Auto-upgrade: if the current provider is the inert stub from CF module
    // eval, but env vars are now available (CF fetch() bridged them), swap to Turso.
    if (_provider && (_provider as any)._isStub && isCloudRuntime()) {
        console.log('🔄 Auto-upgrading from stub to TursoHttpProvider (env vars now available)');
        _provider = new TursoHttpProvider();
    }

    if (!_provider) {
        _provider = createInitialProvider();
    }
    return _provider;
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
            const provider = getStateProvider();
            const value = (provider as any)[prop];
            if (typeof value === 'function') {
                return value.apply(provider, args);
            }
            return value;
        };
    }
});

export type { IStateProvider, ProjectSettingsData, PublishedPageSummary, WorkflowData, ExecutionData, NewExecutionData, ExecutionStats } from './IStateProvider';
