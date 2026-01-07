/**
 * Health Check Route
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

const healthRoute = new OpenAPIHono();

const route = createRoute({
    method: 'get',
    path: '/',
    tags: ['System'],
    summary: 'Health check',
    description: 'Returns service health status and version info',
    responses: {
        200: {
            description: 'Service is healthy',
            content: {
                'application/json': {
                    schema: z.object({
                        status: z.string(),
                        service: z.string(),
                        version: z.string(),
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
        service: 'frontbase-actions',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
    });
});

export { healthRoute };
