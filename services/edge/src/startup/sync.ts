/**
 * Startup Sync - Settings + Homepage Sync on Edge Boot
 * 
 * On startup, Edge syncs settings (Redis, Turso, Supabase JWT) from FastAPI,
 * optionally upgrades from local SQLite to Turso, and syncs the homepage.
 * Includes retry logic to wait for FastAPI to be ready.
 */

import { stateProvider } from '../storage/index.js';
import { upgradeToTurso } from '../storage/index.js';
import { initRedis } from '../cache/redis.js';

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
 * Fetch Supabase JWT secret from FastAPI settings and store in process.env
 * so auth.ts middleware can use it.
 */
async function syncSupabaseJwtFromFastAPI(): Promise<SyncResult> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/settings/supabase/`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            console.warn(`[Startup Sync] Supabase settings fetch failed: ${response.status}`);
            return { status: 'error', retry: response.status >= 500 };
        }

        const settings = await response.json();

        if (settings.supabase_jwt_secret) {
            // Store in process.env so auth.ts picks it up
            process.env.SUPABASE_JWT_SECRET = settings.supabase_jwt_secret;
            console.log('[Startup Sync] ✅ Supabase JWT secret synced from backend');
            return { status: 'success' };
        } else {
            console.log('[Startup Sync] ℹ️ No Supabase JWT secret configured');
            return { status: 'not-configured' };
        }
    } catch (error) {
        const isConnectionError = (error as any)?.cause?.code === 'ECONNREFUSED';
        if (!isConnectionError) {
            console.warn('[Startup Sync] Supabase JWT sync failed:', (error as Error).message);
        }
        return { status: 'error', retry: true };
    }
}

/**
 * Fetch Turso settings from FastAPI and upgrade state provider if enabled.
 * This allows Turso to be configured via the Settings UI instead of env vars.
 * Only upgrades if not already in cloud mode (standalone edge uses env vars).
 */
async function syncTursoSettingsFromFastAPI(): Promise<SyncResult> {
    // Skip if already in cloud mode (standalone edge with env vars)
    if (process.env.FRONTBASE_DEPLOYMENT_MODE === 'cloud') {
        console.log('[Startup Sync] ℹ️ Already in cloud mode — Turso sync skipped');
        return { status: 'success' };
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/settings/turso/`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            console.warn(`[Startup Sync] Turso settings fetch failed: ${response.status}`);
            return { status: 'error', retry: response.status >= 500 };
        }

        const settings = await response.json();

        if (settings.turso_enabled && settings.turso_url && settings.turso_token) {
            // Set env vars so TursoHttpProvider picks them up
            process.env.FRONTBASE_STATE_DB_URL = settings.turso_url;
            process.env.FRONTBASE_STATE_DB_TOKEN = settings.turso_token;

            // Hot-swap from LocalSqlite to Turso
            await upgradeToTurso();
            console.log('[Startup Sync] ✅ Turso state provider activated from Settings UI');
            return { status: 'success' };
        } else {
            console.log('[Startup Sync] ℹ️ Turso not enabled in Settings UI — using local SQLite');
            return { status: 'not-configured' };
        }
    } catch (error) {
        const isConnectionError = (error as any)?.cause?.code === 'ECONNREFUSED';
        if (!isConnectionError) {
            console.warn('[Startup Sync] Turso sync failed:', (error as Error).message);
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

    // Sync all settings from backend with retries (FastAPI may not be ready yet)
    console.log('[Startup Sync] Syncing settings from backend...');
    let tursoUpgraded = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const redisResult = await syncRedisSettingsFromFastAPI();
        const supabaseResult = await syncSupabaseJwtFromFastAPI();
        const tursoResult = await syncTursoSettingsFromFastAPI();

        if (tursoResult.status === 'success' && process.env.FRONTBASE_STATE_DB_URL) {
            tursoUpgraded = true;
        }

        const allDone =
            (redisResult.status === 'success' || redisResult.status === 'not-configured') &&
            (supabaseResult.status === 'success' || supabaseResult.status === 'not-configured') &&
            (tursoResult.status === 'success' || tursoResult.status === 'not-configured');

        if (allDone) break;

        // At least one had a retryable error
        const needsRetry =
            (redisResult.status === 'error' && redisResult.retry) ||
            (supabaseResult.status === 'error' && supabaseResult.retry) ||
            (tursoResult.status === 'error' && tursoResult.retry);

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
