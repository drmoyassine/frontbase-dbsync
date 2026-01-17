/**
 * Startup Sync - Proactive Homepage + Redis Settings Sync on Edge Boot
 * 
 * On startup, Edge fetches the homepage and Redis settings from FastAPI and stores locally.
 * Includes retry logic to wait for FastAPI to be ready.
 */

import { initPagesDb, upsertPublishedPage, getHomepage } from '../db/pages-store.js';
import { initRedis } from '../cache/redis.js';

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000; // 3 seconds between retries

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch Redis settings from FastAPI and initialize Redis client
 */
async function syncRedisSettingsFromFastAPI(): Promise<boolean> {
    try {
        const response = await fetch(`${FASTAPI_URL}/api/sync/settings/redis/`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            console.warn(`[Startup Sync] Redis settings fetch failed: ${response.status}`);
            return false;
        }

        const settings = await response.json();

        if (settings.redis_enabled && settings.redis_url && settings.redis_token) {
            initRedis({ url: settings.redis_url, token: settings.redis_token });
            console.log('[Startup Sync] ✅ Redis initialized from settings');
            return true;
        } else {
            console.log('[Startup Sync] Redis not enabled or not configured');
            return false;
        }
    } catch (error) {
        console.warn('[Startup Sync] Redis settings sync failed:', error);
        return false;
    }
}

/**
 * Fetch homepage from FastAPI and store in local pages.db
 */
async function syncHomepageFromFastAPI(): Promise<boolean> {
    try {
        const response = await fetch(`${FASTAPI_URL}/api/pages/homepage/`, {
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

        await upsertPublishedPage(publishData);
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
    console.log('[Startup Sync] 🚀 Starting homepage + Redis sync...');

    // Initialize pages database first
    await initPagesDb();

    // Sync Redis settings with retries (FastAPI may not be ready yet)
    console.log('[Startup Sync] Syncing Redis settings...');
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const redisSuccess = await syncRedisSettingsFromFastAPI();
        if (redisSuccess) {
            break;
        }
        if (attempt < MAX_RETRIES) {
            console.log(`[Startup Sync] Redis sync attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${RETRY_DELAY_MS / 1000}s...`);
            await sleep(RETRY_DELAY_MS);
        }
    }

    // Check if we already have a homepage
    const existingHomepage = await getHomepage();
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
