/**
 * Health Check Route
 * 
 * Returns service health, version, and provider info.
 * The `provider` field is used by the future LB orchestrator to identify
 * which platform each deployment runs on.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getPlatform } from '../adapters/shared.js';

const startedAt = Date.now();
const healthRoute = new OpenAPIHono();

const route = createRoute({
    method: 'get',
    path: '/',
    tags: ['System'],
    summary: 'Health check',
    description: 'Returns service health status, version, and provider info',
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
                        uptime_seconds: z.number(),
                        timestamp: z.string(),
                    }),
                },
            },
        },
    },
});

healthRoute.openapi(route, (c) => {
    return c.json({
        status: 'ok',
        service: 'frontbase-edge',
        version: '0.1.0',
        provider: getPlatform(),
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
    });
});

export { healthRoute };

