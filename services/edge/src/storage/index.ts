/**
 * State Provider Factory
 * 
 * Architecture:
 *   - CF Workers / Cloud: TursoHttpProvider (always)
 *   - Docker / local dev:  LocalSqliteProvider → optionally upgrade to Turso via startup sync
 * 
 * TursoHttpProvider uses lazy init (getDb()) — safe to instantiate even
 * before env vars are available (CF module evaluation).
 * 
 * LocalSqliteProvider is ONLY used in Docker. On CF builds, it's replaced
 * by an inert stub via esbuild plugin (see tsup.cloudflare-*.ts).
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
 * Create the initial state provider.
 * 
 * Cloud/CF → TursoHttpProvider (lazy, no-throw constructor)
 * Docker   → LocalSqliteProvider (immediate, file: URL)
 */
function createInitialProvider(): IStateProvider {
    if (isCloudRuntime()) {
        console.log('☁️ Using TursoHttpProvider');
        return new TursoHttpProvider();
    }

    console.log('💾 Starting with LocalSqliteProvider (may upgrade to Turso after sync)');
    return new LocalSqliteProvider();
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

/**
 * Hot-swap the state provider to Turso.
 * Called by sync.ts when Turso credentials are fetched from the backend.
 */
export async function upgradeToTurso(): Promise<IStateProvider> {
    console.log('🔄 Upgrading state provider to TursoHttpProvider...');
    const turso = new TursoHttpProvider();
    await turso.init();
    _provider = turso;
    console.log('☁️ State provider upgraded to TursoHttpProvider');
    return _provider;
}

/** 
 * Global state provider proxy.
 * Defers provider creation to method invocation (not property access)
 * so it survives CF Workers' module evaluation phase.
 */
export const stateProvider: IStateProvider = new Proxy({} as IStateProvider, {
    get(_target, prop: string) {
        return (...args: any[]) => {
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
