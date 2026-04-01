/**
 * Health Check Route
 * 
 * Returns service health, version, provider info, and binding status.
 * The `bindings` section shows whether stateDb, cache, and queue are
 * configured and reachable — gives operators a single-glance view of
 * whether all infrastructure is properly wired.
 * 
 * Each binding check has a 3s timeout to prevent the health endpoint
 * from hanging on slow/unreachable backends.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getPlatform } from '../adapters/shared.js';

const startedAt = Date.now();
const healthRoute = new OpenAPIHono();

// ── Helpers ─────────────────────────────────────────────────────────

type BindingStatus = { provider: string; status: 'ok' | 'error' | 'not_configured'; error?: string; schema?: string };

const PING_TIMEOUT_MS = 8000;

/** Wrap a promise with a timeout — returns 'error' status if it takes too long */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
}

// ── Binding health checks ───────────────────────────────────────────

async function checkStateDb(): Promise<BindingStatus> {
    const { getStateDbConfig } = await import('../config/env.js');
    const cfg = getStateDbConfig();

    if (cfg.provider === 'local' && !cfg.url) {
        return { provider: 'none', status: 'not_configured' };
    }

    const result: BindingStatus = {
        provider: cfg.provider || 'auto',
        status: 'ok',
    };

    if (cfg.schema) result.schema = cfg.schema;

    try {
        const { stateProvider } = await import('../storage/index.js');
        await withTimeout(stateProvider.listPages(), PING_TIMEOUT_MS);
        result.status = 'ok';
    } catch (e: any) {
        result.status = 'error';
        result.error = (e?.message || String(e)).slice(0, 120);
    }

    return result;
}

async function checkCache(): Promise<BindingStatus> {
    const { getCacheConfig } = await import('../config/env.js');
    const cfg = getCacheConfig();

    if (cfg.provider === 'none' && !cfg.url) {
        return { provider: 'none', status: 'not_configured' };
    }

    try {
        const { cacheProvider } = await import('../cache/index.js');
        await withTimeout(cacheProvider.get('__health_check__'), PING_TIMEOUT_MS);
        return { provider: cfg.provider || 'redis', status: 'ok' };
    } catch (e: any) {
        return {
            provider: cfg.provider || 'redis',
            status: 'error',
            error: (e?.message || String(e)).slice(0, 120),
        };
    }
}

async function checkQueue(): Promise<BindingStatus> {
    const { getQueueConfig } = await import('../config/env.js');
    const cfg = getQueueConfig();

    if (cfg.provider === 'none' && !cfg.token && !cfg.url) {
        return { provider: 'none', status: 'not_configured' };
    }

    // Queue health is "configured" — can't ping QStash/CF Queues without publishing
    return { provider: cfg.provider || 'qstash', status: 'ok' };
}

// ── OpenAPI Route ───────────────────────────────────────────────────

const bindingSchema = z.object({
    provider: z.string(),
    status: z.enum(['ok', 'error', 'not_configured']),
    error: z.string().optional(),
    schema: z.string().optional(),
});

const route = createRoute({
    method: 'get',
    path: '/',
    tags: ['System'],
    summary: 'Health check',
    description: 'Returns service health status, version, provider info, and binding health',
    responses: {
        200: {
            description: 'Service is healthy',
            content: {
                'application/json': {
                    schema: z.object({
                        status: z.string(),
                        service: z.string(),
                        version: z.string(),
                        provider: z.string(),
                        uptime_seconds: z.number().optional(),
                        timestamp: z.string(),
                        bindings: z.object({
                            stateDb: bindingSchema,
                            cache: bindingSchema,
                            queue: bindingSchema,
                        }),
                    }),
                },
            },
        },
    },
});

healthRoute.openapi(route, async (c) => {
    // Tiered response: minimal without system key, full diagnostics with key
    const systemKey = process.env.FRONTBASE_SYSTEM_KEY;
    const provided = c.req.header('x-system-key');
    const isAuthenticated = !systemKey || (provided === systemKey);

    if (!isAuthenticated) {
        // Minimal liveness check — no infrastructure details
        return c.json({
            status: 'ok',
            service: 'frontbase-edge',
            version: '0.1.0',
            provider: getPlatform(),
            timestamp: new Date().toISOString(),
            bindings: {
                stateDb: { provider: 'hidden', status: 'ok' as const },
                cache: { provider: 'hidden', status: 'ok' as const },
                queue: { provider: 'hidden', status: 'ok' as const },
            },
        });
    }

    // Full diagnostics — authenticated via system key
    const platform = getPlatform();
    const isServerless = platform !== 'docker';

    // Run all binding checks in parallel (each has timeout)
    const [stateDb, cache, queue] = await Promise.all([
        checkStateDb(),
        checkCache(),
        checkQueue(),
    ]);

    return c.json({
        status: 'ok',
        service: 'frontbase-edge',
        version: '0.1.0',
        provider: platform,
        ...(isServerless ? {} : { uptime_seconds: Math.floor((Date.now() - startedAt) / 1000) }),
        timestamp: new Date().toISOString(),
        bindings: { stateDb, cache, queue },
    });
});

export { healthRoute };
