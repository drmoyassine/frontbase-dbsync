/**
 * Startup Sync - Settings + Homepage Sync on Edge Boot
 * 
 * On startup, Edge syncs settings (Redis, Supabase JWT) from FastAPI
 * and syncs the homepage. Includes retry logic to wait for FastAPI to be ready.
 * 
 * NOTE: Turso / edge database credentials are now managed via the EdgeDatabase
 * table + connected accounts. The secrets_builder pushes FRONTBASE_STATE_DB_URL
 * and FRONTBASE_STATE_DB_TOKEN as env vars during deploy — no startup sync needed.
 */

import { stateProvider } from '../storage/index.js';
import { getPlatform } from '../adapters/shared.js';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000; // 3 seconds between retries

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sync result type
 */
type SyncResult = { status: 'success' } | { status: 'not-configured' } | { status: 'error'; retry: boolean };

/**
 * Initialize embedded Redis for Docker edges.
 * Docker edges run redis-server locally (see start.sh), so we just
 * init the ioredis adapter pointing at localhost — no backend call needed.
 */
async function initEmbeddedRedis(): Promise<SyncResult> {
    try {
        const { IoRedisAdapter } = await import('../cache/ioredis-adapter.js');
        const { setCacheProvider } = await import('../cache/index.js');

        const adapter = new IoRedisAdapter('redis://localhost:6379');
        // Wait for the adapter to connect (it initializes asynchronously)
        await adapter.ping();
        setCacheProvider(adapter);
        console.log('[Startup Sync] ✅ Embedded Redis initialized (localhost:6379)');
        return { status: 'success' };
    } catch (error) {
        console.warn('[Startup Sync] ⚠️ Embedded Redis not available:', (error as Error).message);
        return { status: 'not-configured' };
    }
}



export async function runStartupSync(): Promise<void> {
    console.log('[Startup Sync] 🚀 Starting Edge database initialization...');

    // Initialize state database (runs migrations including v2 for workflows/executions)
    await stateProvider.init();

    const platform = getPlatform();
    if (platform === 'docker') {
        // Docker platform: init embedded Redis (no backend call needed)
        console.log('[Startup Sync] Initializing embedded Redis...');
        await initEmbeddedRedis();
    }

    // All platforms rely on publish push (/api/import) or manual caching
    // Disabling auto-fetch on startup to prevent 15s delays and ECONNREFUSED logs
    // when backend is slow or unreachable.
    console.log('[Startup Sync] 🏁 Edge Node Ready — waiting for publish events or requests');
}
