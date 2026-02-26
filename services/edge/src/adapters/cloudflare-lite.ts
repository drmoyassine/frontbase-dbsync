/**
 * Cloudflare Workers — Lite Adapter
 * 
 * Thin wrapper that bridges CF Worker env bindings into process.env
 * and delegates to the pre-configured Lite engine.
 * 
 * Bundle: ~200-400 KB (no React, no LiquidJS, no SSR).
 * Routes: health, deploy, execute, webhook, executions, cache, data, import.
 * 
 * Original monolithic version archived as cloudflare-lite.ts.bak
 */

import { liteApp } from '../engine/lite.js';

// Cloudflare Workers types (inlined to avoid @cloudflare/workers-types dependency)
interface CFExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
}

export default {
    async fetch(request: Request, env: Record<string, string>, ctx: CFExecutionContext): Promise<Response> {
        // Bridge Cloudflare env bindings → process.env for existing code compatibility
        for (const [key, value] of Object.entries(env)) {
            if (typeof value === 'string') {
                (globalThis as any).process ??= { env: {} };
                (globalThis as any).process.env[key] = value;
            }
        }

        // Set adapter platform for health endpoint identification
        (globalThis as any).process.env.FRONTBASE_ADAPTER_PLATFORM = 'cloudflare-lite';

        return liteApp.fetch(request);
    },
};
