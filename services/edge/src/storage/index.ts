/**
 * State Provider Factory
 * 
 * Reads FRONTBASE_ENV to determine which storage provider to use:
 * - 'local' (default): LocalSqliteProvider — reads from local SQLite file
 * - 'cloud': TursoHttpProvider — reads from remote Turso DB (Phase 2)
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

/**
 * Create the appropriate state provider based on FRONTBASE_ENV.
 * Returns a singleton — call this once at startup.
 */
export function createProvider(): IStateProvider {
    const env = process.env.FRONTBASE_ENV || 'local';

    switch (env) {
        case 'cloud':
            console.log('☁️ FRONTBASE_ENV=cloud — using TursoHttpProvider');
            return new TursoHttpProvider();

        case 'local':
        default:
            console.log('💾 FRONTBASE_ENV=local — using LocalSqliteProvider');
            return new LocalSqliteProvider();
    }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/** Global state provider singleton — initialized once, used everywhere */
export const stateProvider: IStateProvider = createProvider();

// Re-export types for convenience
export type { IStateProvider, ProjectSettingsData, PublishedPageSummary } from './IStateProvider';
