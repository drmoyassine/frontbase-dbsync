/**
 * Queue Management Route — Stats and message publishing
 *
 * Provides health/stats for the connected queue provider and an endpoint
 * to publish messages programmatically (Upstash QStash or CF Queues).
 *
 * Queue provider is auto-detected from environment variables:
 *   - FRONTBASE_QUEUE_URL + FRONTBASE_QUEUE_TOKEN → Upstash QStash
 *   - No queue configured → returns 501
 *
 * All endpoints protected by systemKeyAuth (registered in lite.ts).
 *
 * Routes:
 *   GET  /stats    — Queue health/stats
 *   POST /publish  — Publish message to queue
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { SuccessResponseSchema, ErrorResponseSchema } from '../schemas';

const queueRoute = new OpenAPIHono();

// ── Helpers ─────────────────────────────────────────────────────────────────

function getQueueConfig() {
    const url = process.env.FRONTBASE_QUEUE_URL;
    const token = process.env.FRONTBASE_QUEUE_TOKEN;
    if (!url || !token) return null;
    return { url: url.replace(/\/$/, ''), token };
}

// ── GET /stats — Queue health/stats ─────────────────────────────────────────

const statsRoute = createRoute({
    method: 'get',
    path: '/stats',
    tags: ['Queue'],
    summary: 'Get queue stats',
    description: 'Returns queue connection status and provider info',
    responses: {
        200: {
            description: 'Queue stats',
            content: {
                'application/json': {
                    schema: z.object({
                        configured: z.boolean(),
                        provider: z.string().optional(),
                        connected: z.boolean().optional(),
                        message: z.string(),
                    }),
                },
            },
        },
    },
});

queueRoute.openapi(statsRoute, async (c) => {
    const config = getQueueConfig();
    if (!config) {
        return c.json({
            configured: false,
            message: 'No queue provider configured. Set FRONTBASE_QUEUE_URL and FRONTBASE_QUEUE_TOKEN.',
        }, 200);
    }

    // Detect provider from URL
    const isQStash = config.url.includes('qstash') || config.url.includes('upstash');
    const provider = isQStash ? 'upstash-qstash' : 'generic-http';

    // Ping the queue API
    try {
        const resp = await fetch(config.url, {
            headers: { 'Authorization': `Bearer ${config.token}` },
        });
        return c.json({
            configured: true,
            provider,
            connected: resp.ok,
            message: resp.ok ? 'Queue connected' : `Queue returned HTTP ${resp.status}`,
        }, 200);
    } catch (err: any) {
        return c.json({
            configured: true,
            provider,
            connected: false,
            message: `Connection failed: ${err.message}`,
        }, 200);
    }
});

// ── POST /publish — Publish message to queue ─────────────────────────────────

const publishRoute = createRoute({
    method: 'post',
    path: '/publish',
    tags: ['Queue'],
    summary: 'Publish a message to the queue',
    description: 'Sends a message to the connected queue provider (QStash/CF Queue)',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        topic: z.string().min(1).openapi({ description: 'Queue topic/destination URL' }),
                        payload: z.record(z.unknown()).openapi({ description: 'Message body (JSON)' }),
                        delay: z.number().int().min(0).optional().openapi({
                            description: 'Delay in seconds before delivery (QStash only)',
                        }),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Message published',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema.extend({
                        messageId: z.string().optional(),
                    }),
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
        501: {
            description: 'No queue configured',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
});

queueRoute.openapi(publishRoute, async (c) => {
    const config = getQueueConfig();
    if (!config) {
        return c.json({
            error: 'NotConfigured',
            message: 'No queue provider configured',
        }, 501);
    }

    const { topic, payload, delay } = c.req.valid('json');

    try {
        // QStash publish: POST /v2/publish/{destination}
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${config.token}`,
            'Content-Type': 'application/json',
        };
        if (delay && delay > 0) {
            headers['Upstash-Delay'] = `${delay}s`;
        }

        const resp = await fetch(`${config.url}/v2/publish/${encodeURIComponent(topic)}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });

        if (!resp.ok) {
            const text = await resp.text();
            return c.json({
                error: 'PublishFailed',
                message: `Queue returned HTTP ${resp.status}: ${text.substring(0, 200)}`,
            }, 400);
        }

        const result = await resp.json() as any;
        return c.json({
            success: true as const,
            message: 'Message published',
            messageId: result.messageId || result.id || undefined,
        }, 200);
    } catch (err: any) {
        return c.json({
            error: 'PublishError',
            message: err.message || 'Failed to publish message',
        }, 400);
    }
});

export { queueRoute };
