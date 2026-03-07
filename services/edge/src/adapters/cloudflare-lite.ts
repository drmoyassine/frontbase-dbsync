/**
 * Cloudflare Workers — Lite Adapter
 * 
 * Thin wrapper that bridges CF Worker env bindings into process.env
 * and delegates to the pre-configured Lite engine.
 * 
 * Bundle: ~200-400 KB (no React, no LiquidJS, no SSR).
 * Routes: health, deploy, execute, webhook, executions, cache, data, import.
 * 
 * CF-specific concerns (kept inline, not in shared.ts):
 *   - env bridging loop (CF passes env as 2nd arg to fetch)
 *   - setAIBinding(env.AI) for Workers AI binding
 */

import { liteApp } from '../engine/lite.js';
import { setAIBinding } from '../routes/ai.js';
import { setPlatform } from './shared.js';

// Cloudflare Workers types (inlined to avoid @cloudflare/workers-types dependency)
interface CFExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
}

export default {
    async fetch(request: Request, env: Record<string, any>, ctx: CFExecutionContext): Promise<Response> {
        // CF-specific: bridge env bindings → process.env
        for (const [key, value] of Object.entries(env)) {
            if (typeof value === 'string') {
                (globalThis as any).process ??= { env: {} };
                (globalThis as any).process.env[key] = value;
            }
        }

        setPlatform('cloudflare-lite');                    // Shared

        // CF-specific: Workers AI binding (non-string, can't go in process.env)
        if (env.AI) {
            setAIBinding(env.AI);
        }

        return liteApp.fetch(request);
    },
};
