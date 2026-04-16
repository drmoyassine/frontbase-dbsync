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



/**
 * Fetch homepage from FastAPI and store in local pages.db
 */
async function syncHomepageFromFastAPI(): Promise<boolean> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/pages/homepage/`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000), // 5s timeout
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.log('[Startup Sync] No homepage configured in FastAPI yet');
                return false;
            }
            console.warn(`[Startup Sync] FastAPI returned ${response.status}`);
            return false;
        }

        const result = await response.json();
        const pageData = result.data;

        if (!pageData) {
            console.warn('[Startup Sync] No page data in response');
            return false;
        }

        // Convert to publish format
        const publishData = {
            id: pageData.id,
            slug: pageData.slug,
            name: pageData.name,
            title: pageData.title || undefined,
            description: pageData.description || undefined,
            layoutData: pageData.layoutData,
            seoData: pageData.seoData || undefined,
            datasources: pageData.datasources || undefined,
            version: 1,
            publishedAt: new Date().toISOString(),
            isPublic: pageData.isPublic ?? true,
            isHomepage: true,
        };

        await stateProvider.upsertPage(publishData);
        console.log(`[Startup Sync] ✅ Homepage synced: ${pageData.slug}`);
        return true;

    } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
            console.warn('[Startup Sync] FastAPI request timed out');
        } else {
            console.warn('[Startup Sync] Failed to fetch homepage:', error);
        }
        return false;
    }
}

/**
 * Run startup sync with retries
 * Called once when Edge boots up
 */
export async function runStartupSync(): Promise<void> {
    console.log('[Startup Sync] 🚀 Starting Edge database initialization...');

    // Initialize state database (runs migrations including v2 for workflows/executions)
    await stateProvider.init();

    // Only Docker (local) engines sync with FastAPI — all cloud platforms
    // (cloudflare, supabase, vercel, netlify, deno, upstash) get their config
    // from deploy-time secrets. Skip to avoid 15s of wasted cold-start retries.
    const platform = getPlatform();
    if (platform !== 'docker') {
        console.log(`[Startup Sync] ☁️  Platform "${platform}" — skipping backend sync (secrets pushed at deploy time)`);
        return;
    }

    // Docker platform: init embedded Redis (no backend call needed)
    console.log('[Startup Sync] Initializing embedded Redis...');
    await initEmbeddedRedis();

    // Check if we already have a homepage
    const existingHomepage = await stateProvider.getHomepage();
    if (existingHomepage) {
        console.log(`[Startup Sync] Homepage already exists: ${existingHomepage.slug} (v${existingHomepage.version})`);
        return;
    }

    // No local homepage - try to sync from FastAPI with retries
    console.log('[Startup Sync] No local homepage, syncing from FastAPI...');

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        console.log(`[Startup Sync] Attempt ${attempt}/${MAX_RETRIES}...`);

        const success = await syncHomepageFromFastAPI();
        if (success) {
            return;
        }

        if (attempt < MAX_RETRIES) {
            console.log(`[Startup Sync] Waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
            await sleep(RETRY_DELAY_MS);
        }
    }

    console.warn('[Startup Sync] ⚠️ Could not sync homepage after all retries. Homepage will be pull-published on first request.');
}
