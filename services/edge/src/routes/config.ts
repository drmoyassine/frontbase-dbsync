/**
 * Config Route — Runtime configuration hot-reload
 *
 * Allows updating edge engine configuration without redeployment.
 * Updates process.env and reinitializes affected singletons.
 *
 * All endpoints protected by systemKeyAuth (registered in lite.ts).
 *
 * Routes:
 *   GET  /  — Get current configuration (redacted secrets)
 *   POST /  — Apply configuration update
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { SuccessResponseSchema, ErrorResponseSchema } from '../schemas';

const configRoute = new OpenAPIHono();

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Redact a URL/token — show first 8 and last 4 chars */
function redact(value: string | undefined): string | null {
    if (!value) return null;
    if (value.length <= 16) return '***';
    return `${value.substring(0, 8)}...${value.substring(value.length - 4)}`;
}

// ── GET / — Get current config ──────────────────────────────────────────────

const getConfigRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['System'],
    summary: 'Get current runtime configuration',
    description: 'Returns the active database, cache, and queue settings (secrets redacted)',
    responses: {
        200: {
            description: 'Current config',
            content: {
                'application/json': {
                    schema: z.object({
                        stateDb: z.object({
                            provider: z.string().nullable(),
                            url: z.string().nullable(),
                        }),
                        cache: z.object({
                            url: z.string().nullable(),
                            configured: z.boolean(),
                        }),
                        queue: z.object({
                            url: z.string().nullable(),
                            configured: z.boolean(),
                        }),
                        engineMode: z.string().nullable(),
                    }),
                },
            },
        },
    },
});

configRoute.openapi(getConfigRoute, async (c) => {
    return c.json({
        stateDb: {
            provider: process.env.FRONTBASE_STATE_DB_PROVIDER || 'local-sqlite',
            url: redact(process.env.FRONTBASE_STATE_DB_URL),
        },
        cache: {
            url: redact(process.env.FRONTBASE_CACHE_URL),
            configured: !!(process.env.FRONTBASE_CACHE_URL && process.env.FRONTBASE_CACHE_TOKEN),
        },
        queue: {
            url: redact(process.env.FRONTBASE_QUEUE_URL),
            configured: !!(process.env.FRONTBASE_QUEUE_URL && process.env.FRONTBASE_QUEUE_TOKEN),
        },
        engineMode: process.env.FRONTBASE_ADAPTER_PLATFORM || null,
    }, 200);
});

// ── POST / — Apply config update ────────────────────────────────────────────

const updateConfigRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['System'],
    summary: 'Update runtime configuration',
    description: 'Hot-swap database, cache, or queue configuration without redeploying. Updates process.env and reinitializes affected singletons.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        cache: z.object({
                            url: z.string().min(1),
                            token: z.string().min(1),
                        }).optional().openapi({ description: 'Redis/Upstash cache credentials' }),
                        queue: z.object({
                            url: z.string().min(1),
                            token: z.string().min(1),
                        }).optional().openapi({ description: 'QStash/queue credentials' }),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Config updated',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema.extend({
                        updated: z.array(z.string()),
                    }),
                },
            },
        },
        400: {
            description: 'Invalid config',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
});

configRoute.openapi(updateConfigRoute, async (c) => {
    const body = c.req.valid('json');
    const updated: string[] = [];

    try {
        // ── Cache (Redis/Upstash) ────────────────────────────────────────
        if (body.cache) {
            process.env.FRONTBASE_CACHE_URL = body.cache.url;
            process.env.FRONTBASE_CACHE_TOKEN = body.cache.token;

            // Reinitialize Redis singleton
            try {
                const { initRedis } = await import('../cache/redis.js');
                initRedis({ url: body.cache.url, token: body.cache.token });
                updated.push('cache');
                console.log('[Config] Cache reinitialized');
            } catch (err: any) {
                console.error('[Config] Cache reinit failed:', err.message);
            }
        }

        // ── Queue ────────────────────────────────────────────────────────
        if (body.queue) {
            process.env.FRONTBASE_QUEUE_URL = body.queue.url;
            process.env.FRONTBASE_QUEUE_TOKEN = body.queue.token;
            updated.push('queue');
            console.log('[Config] Queue config updated');
        }

        return c.json({
            success: true as const,
            message: updated.length > 0
                ? `Updated: ${updated.join(', ')}`
                : 'No changes applied',
            updated,
        }, 200);
    } catch (err: any) {
        return c.json({
            error: 'ConfigError',
            message: err.message || 'Failed to apply config',
        }, 400);
    }
});

export { configRoute };
