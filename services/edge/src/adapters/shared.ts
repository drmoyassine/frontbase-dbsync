/**
 * Shared Adapter Utilities
 * 
 * Reusable helpers consumed by all platform-specific adapters.
 * Eliminates boilerplate duplication across Deno, module worker,
 * and Vercel adapters.
 * 
 * CF adapters use setPlatform() but keep CF-specific code inline
 * (env bridging loop, ctx.waitUntil, AI binding).
 */

import type { Hono } from 'hono';

// ── Core helpers ──────────────────────────────────────────────────────

/** Ensure process.env exists (serverless runtimes may not have it) */
export function ensureProcessEnv(): void {
    (globalThis as any).process ??= { env: {} };
}

/** Tag the adapter platform for /api/health identification */
export function setPlatform(platform: string): void {
    ensureProcessEnv();
    (globalThis as any).process.env.FRONTBASE_ADAPTER_PLATFORM = platform;
}

// ── Factory: Deno.serve() handler (Supabase, Netlify, Deno Deploy) ──

/**
 * Create a Deno.serve()-compatible handler for Lite or Full engine.
 * 
 * Usage:
 *   Deno.serve(createDenoHandler(liteApp, 'supabase-edge-lite'));
 *   Deno.serve(createDenoHandler(fullApp, 'supabase-edge', { runSync: runStartupSync }));
 */
export function createDenoHandler(
    app: Hono<any>,
    platform: string,
    options?: { runSync?: () => Promise<void> }
): (req: Request) => Promise<Response> {
    let syncStarted = false;
    return async (req: Request) => {
        setPlatform(platform);
        if (options?.runSync && !syncStarted) {
            syncStarted = true;
            options.runSync().catch(err => {
                console.error('[Startup Sync] Error:', err);
                syncStarted = false;
            });
        }
        return app.fetch(req);
    };
}

// ── Factory: Module worker { fetch() } (Upstash) ────────────────────

/**
 * Create a module worker handler for Lite or Full engine.
 * 
 * Usage:
 *   export default createWorkerHandler(liteApp, 'upstash-workflow-lite');
 *   export default createWorkerHandler(fullApp, 'upstash-workflow', { runSync: runStartupSync });
 */
export function createWorkerHandler(
    app: Hono<any>,
    platform: string,
    options?: { runSync?: () => Promise<void> }
): { fetch: (req: Request) => Promise<Response> } {
    let syncStarted = false;
    return {
        async fetch(request: Request): Promise<Response> {
            setPlatform(platform);
            if (options?.runSync && !syncStarted) {
                syncStarted = true;
                options.runSync().catch(err => {
                    console.error('[Startup Sync] Error:', err);
                    syncStarted = false;
                });
            }
            return app.fetch(request);
        },
    };
}
