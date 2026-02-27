/**
 * Cloudflare Workers/Pages Adapter — Full Engine
 * 
 * Entry point for deploying the Full Edge Engine to Cloudflare Workers.
 * Serves SSR pages + automation APIs. Static assets (hydrate.js, CSS)
 * are served by Cloudflare Pages CDN.
 * 
 * Build: npm run build:cf
 * Deploy: npm run deploy:cf
 * 
 * Required secrets (set via `wrangler secret put`):
 *   FRONTBASE_STATE_DB_URL   — Turso libsql:// URL
 *   FRONTBASE_STATE_DB_TOKEN — Turso auth token
 *   FRONTBASE_CACHE_URL         — Cache REST URL (optional, for caching)
 *   FRONTBASE_CACHE_TOKEN       — Cache REST token (optional)
 */

import { fullApp } from '../engine/full.js';
import { runStartupSync } from '../startup/sync.js';

// Cloudflare Workers types (inlined to avoid @cloudflare/workers-types dependency)
interface CFExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
}

// =============================================================================
// Worker Entry Point
// =============================================================================

let syncStarted = false;

export default {
    async fetch(request: Request, env: Record<string, string>, ctx: CFExecutionContext): Promise<Response> {
        // Bridge Cloudflare env bindings → process.env
        for (const [key, value] of Object.entries(env)) {
            if (typeof value === 'string') {
                (globalThis as any).process ??= { env: {} };
                (globalThis as any).process.env[key] = value;
            }
        }

        (globalThis as any).process.env.FRONTBASE_ADAPTER_PLATFORM = 'cloudflare';

        // Run startup sync once (non-blocking)
        if (!syncStarted) {
            syncStarted = true;
            ctx.waitUntil(
                runStartupSync().catch(err => {
                    console.error('[Startup Sync] Error:', err);
                    syncStarted = false;
                })
            );
        }

        return fullApp.fetch(request);
    },
};
