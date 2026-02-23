/**
 * Cloudflare Workers/Pages Adapter
 * 
 * Entry point for deploying the Edge Engine to Cloudflare Workers.
 * Serves SSR pages and data APIs. Static assets (hydrate.js, CSS)
 * are served by Cloudflare Pages CDN.
 * 
 * Build: npm run build:cf
 * Deploy: npm run deploy:cf
 * Dev: npm run dev:cf
 * 
 * Required secrets (set via `wrangler secret put`):
 *   FRONTBASE_STATE_DB_URL   — Turso libsql:// URL
 *   FRONTBASE_STATE_DB_TOKEN — Turso auth token
 *   UPSTASH_REDIS_REST_URL   — Upstash REST URL (optional, for caching)
 *   UPSTASH_REDIS_REST_TOKEN — Upstash REST token (optional)
 */

import { createApp, wireMiddleware, wireRoutes } from './shared.js';
import type { IEdgeAdapter } from './IEdgeAdapter.js';
import { runStartupSync } from '../startup/sync.js';

// Cloudflare Workers types (inlined to avoid @cloudflare/workers-types dependency)
interface CFExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
}

// =============================================================================
// Cloudflare Adapter
// =============================================================================

const adapter: IEdgeAdapter = {
    platform: 'cloudflare',
    scope: 'pages',
};

// Create and configure the Hono app
const app = createApp();

// Wire middleware — no compress (Cloudflare handles it natively)
wireMiddleware(app, { compress: false });

// Wire routes — pages scope only (SSR + data)
wireRoutes(app, adapter.scope);

// =============================================================================
// Worker Entry Point
// =============================================================================

let syncStarted = false;

export default {
    async fetch(request: Request, env: Record<string, string>, ctx: CFExecutionContext): Promise<Response> {
        // Bridge Cloudflare env bindings → process.env for existing code compatibility
        // This runs on every request but is cheap (just object assignment)
        for (const [key, value] of Object.entries(env)) {
            if (typeof value === 'string') {
                (globalThis as any).process ??= { env: {} };
                (globalThis as any).process.env[key] = value;
            }
        }

        // Run startup sync once (non-blocking)
        if (!syncStarted) {
            syncStarted = true;
            ctx.waitUntil(
                runStartupSync().catch(err => {
                    console.error('[Startup Sync] Error:', err);
                    syncStarted = false; // Allow retry on next request
                })
            );
        }

        return app.fetch(request);
    },
};
