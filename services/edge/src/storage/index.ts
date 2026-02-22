/**
 * State Provider Factory
 * 
 * Determines which storage provider to use:
 * 
 * Priority order:
 *   1. FRONTBASE_DEPLOYMENT_MODE=cloud env var (standalone edge node)
 *   2. Turso settings synced from backend Settings UI (at startup)
 *   3. Default: LocalSqliteProvider (self-hosted, pages.db)
 * 
 * The provider starts as local by default. If Turso credentials are
 * synced from the backend during startup, it hot-swaps to TursoHttpProvider.
 * 
 * Usage:
 *   import { stateProvider } from './storage';
 *   const page = await stateProvider.getPageBySlug('about');
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — the provider is the only
 * data access layer. No runtime calls to FastAPI.
 */

import type { IStateProvider } from './IStateProvider';
import { LocalSqliteProvider } from './LocalSqliteProvider';
import { TursoHttpProvider } from './TursoHttpProvider';

// =============================================================================
// Mutable Singleton (supports hot-swap after startup sync)
// =============================================================================

/** Internal mutable reference */
let _provider: IStateProvider | null = null;

/**
 * Create the initial state provider.
 * 
 * If FRONTBASE_DEPLOYMENT_MODE=cloud (standalone edge), use Turso immediately.
 * Otherwise, start with local SQLite — sync.ts may upgrade to Turso later.
 */
function createInitialProvider(): IStateProvider {
    const env = process.env.FRONTBASE_DEPLOYMENT_MODE || 'local';

    if (env === 'cloud') {
        console.log('☁️ FRONTBASE_DEPLOYMENT_MODE=cloud — using TursoHttpProvider');
        return new TursoHttpProvider();
    }

    console.log('💾 Starting with LocalSqliteProvider (may upgrade to Turso after sync)');
    return new LocalSqliteProvider();
}

/**
 * Get the current state provider.
 * Lazy-initializes on first access.
 */
export function getStateProvider(): IStateProvider {
    if (!_provider) {
        _provider = createInitialProvider();
    }
    return _provider;
}

/**
 * Hot-swap the state provider to Turso.
 * Called by sync.ts when Turso credentials are fetched from the backend.
 * Returns the new provider (already initialized via init()).
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
 * Global state provider accessor.
 * Use this proxy object everywhere — it delegates to the current provider,
 * so hot-swapping is transparent to callers.
 */
export const stateProvider: IStateProvider = new Proxy({} as IStateProvider, {
    get(_target, prop: string) {
        const provider = getStateProvider();
        const value = (provider as any)[prop];
        if (typeof value === 'function') {
            return value.bind(provider);
        }
        return value;
    }
});

// Re-export types for convenience
export type { IStateProvider, ProjectSettingsData, PublishedPageSummary } from './IStateProvider';
