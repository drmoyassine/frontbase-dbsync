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
import { initRedis } from '../cache/redis.js';
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
 * Fetch Redis settings from FastAPI and initialize Redis client
 */
async function syncRedisSettingsFromFastAPI(): Promise<SyncResult> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/sync/settings/redis/`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            console.warn(`[Startup Sync] Redis settings fetch failed: ${response.status}`);
            return { status: 'error', retry: response.status >= 500 };
        }

        const settings = await response.json();

        if (settings.redis_enabled && settings.redis_url && settings.redis_token) {
            initRedis({ url: settings.redis_url, token: settings.redis_token });
            console.log('[Startup Sync] ✅ Redis initialized from settings');
            return { status: 'success' };
        } else {
            console.log('[Startup Sync] ℹ️ Redis not enabled or not configured in Settings UI');
            return { status: 'not-configured' };
        }
    } catch (error) {
        // Network error - FastAPI not ready yet
        const isConnectionError = (error as any)?.cause?.code === 'ECONNREFUSED';
        if (isConnectionError) {
            console.warn('[Startup Sync] ⏳ FastAPI not ready yet, will retry...');
        } else {
            console.warn('[Startup Sync] Redis settings sync failed:', (error as Error).message);
        }
        return { status: 'error', retry: true };
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

    // Sync settings from backend with retries (FastAPI may not be ready yet)
    console.log('[Startup Sync] Syncing settings from backend...');
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const redisResult = await syncRedisSettingsFromFastAPI();

        const allDone = (redisResult.status === 'success' || redisResult.status === 'not-configured');

        if (allDone) break;

        // At least one had a retryable error
        const needsRetry = (redisResult.status === 'error' && redisResult.retry);

        if (needsRetry && attempt < MAX_RETRIES) {
            console.log(`[Startup Sync] Attempt ${attempt}/${MAX_RETRIES}, retrying in ${RETRY_DELAY_MS / 1000}s...`);
            await sleep(RETRY_DELAY_MS);
        }
    }

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
