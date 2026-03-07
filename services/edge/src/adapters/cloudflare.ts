/**
 * Cloudflare Workers/Pages Adapter — Full Engine
 * 
 * Entry point for deploying the Full Edge Engine to Cloudflare Workers.
 * Serves SSR pages + automation APIs. Static assets (hydrate.js, CSS)
 * are served by Cloudflare Pages CDN.
 * 
 * CF-specific concerns (kept inline, not in shared.ts):
 *   - env bridging loop (CF passes env as 2nd arg to fetch)
 *   - ctx.waitUntil() for non-blocking startup sync
 *   - setAIBinding(env.AI) for Workers AI binding
 */

import { fullApp } from '../engine/full.js';
import { runStartupSync } from '../startup/sync.js';
import { setAIBinding } from '../routes/ai.js';
import { setPlatform } from './shared.js';

// Cloudflare Workers types (inlined to avoid @cloudflare/workers-types dependency)
interface CFExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
}

let syncStarted = false;

export default {
    async fetch(request: Request, env: Record<string, any>, ctx: CFExecutionContext): Promise<Response> {
        // CF-specific: bridge env bindings → process.env
        for (const [key, value] of Object.entries(env)) {
            if (typeof value === 'string') {
                (globalThis as any).process ??= { env: {} };
                (globalThis as any).process.env[key] = value;
            }
        }

        setPlatform('cloudflare');                         // Shared

        // CF-specific: Workers AI binding
        if (env.AI) {
            setAIBinding(env.AI);
        }

        // CF-specific: ctx.waitUntil for non-blocking startup sync
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
