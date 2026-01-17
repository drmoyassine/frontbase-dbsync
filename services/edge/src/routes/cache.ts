/**
 * Cache API Routes (OpenAPI Compliant)
 * 
 * Hono routes for cache management and testing.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { initRedis, testConnection, invalidate, invalidatePattern, getRedis } from '../cache/redis.js';

const cacheRoute = new OpenAPIHono();

// =============================================================================
// Helper: Check if Redis is initialized
// =============================================================================
function isRedisInitialized(): boolean {
    try {
        getRedis();
        return true;
    } catch {
        return false;
    }
}

function ensureRedisInitialized(): boolean {
    // Check if already initialized by startup sync
    if (isRedisInitialized()) {
        return true;
    }

    // Fallback to environment variables (for backwards compatibility / direct env config)
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        return false;
    }

    try {
        initRedis({ url, token });
        return true;
    } catch {
        return false;
    }
}

// =============================================================================
// Schema Definitions
// =============================================================================
const CacheStatusSchema = z.object({
    success: z.boolean(),
    message: z.string(),
});

const CacheStatsSchema = z.object({
    success: z.boolean(),
    configured: z.boolean(),
    connected: z.boolean().optional(),
    message: z.string(),
});

const InvalidateRequestSchema = z.object({
    key: z.string().optional().openapi({ description: 'Single cache key to invalidate' }),
    pattern: z.string().optional().openapi({ description: 'Glob pattern to match multiple keys' }),
});

const InvalidateResponseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
});

// =============================================================================
// GET /test - Test Redis connection
// =============================================================================
const testRoute = createRoute({
    method: 'get',
    path: '/test',
    tags: ['Cache'],
    summary: 'Test Redis connection',
    description: 'Tests the Redis connection and returns the status.',
    responses: {
        200: {
            description: 'Connection test result',
            content: {
                'application/json': {
                    schema: CacheStatusSchema,
                },
            },
        },
    },
});

cacheRoute.openapi(testRoute, async (c) => {
    if (!ensureRedisInitialized()) {
        return c.json({ success: false, message: 'Redis not configured' }, 200);
    }

    const result = await testConnection();
    return c.json(result, 200);
});

// =============================================================================
// POST /invalidate - Invalidate cache key(s)
// =============================================================================
const invalidateRoute = createRoute({
    method: 'post',
    path: '/invalidate',
    tags: ['Cache'],
    summary: 'Invalidate cache entries',
    description: 'Invalidates a single cache key or all keys matching a pattern.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: InvalidateRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Invalidation result',
            content: {
                'application/json': {
                    schema: InvalidateResponseSchema,
                },
            },
        },
        400: {
            description: 'Bad request',
            content: {
                'application/json': {
                    schema: InvalidateResponseSchema,
                },
            },
        },
        500: {
            description: 'Server error',
            content: {
                'application/json': {
                    schema: InvalidateResponseSchema,
                },
            },
        },
    },
});

cacheRoute.openapi(invalidateRoute, async (c) => {
    if (!ensureRedisInitialized()) {
        return c.json({ success: false, message: 'Redis not configured' }, 400);
    }

    try {
        const { key, pattern } = c.req.valid('json');

        if (key) {
            await invalidate(key);
            return c.json({ success: true, message: `Invalidated key: ${key}` }, 200);
        } else if (pattern) {
            await invalidatePattern(pattern);
            return c.json({ success: true, message: `Invalidated pattern: ${pattern}` }, 200);
        } else {
            return c.json({ success: false, message: 'Provide key or pattern' }, 400);
        }
    } catch (error) {
        return c.json({
            success: false,
            message: error instanceof Error ? error.message : 'Invalidation failed',
        }, 500);
    }
});

// =============================================================================
// GET /stats - Get cache stats
// =============================================================================
const statsRoute = createRoute({
    method: 'get',
    path: '/stats',
    tags: ['Cache'],
    summary: 'Get cache status',
    description: 'Returns the current cache configuration and connection status.',
    responses: {
        200: {
            description: 'Cache status',
            content: {
                'application/json': {
                    schema: CacheStatsSchema,
                },
            },
        },
    },
});

cacheRoute.openapi(statsRoute, async (c) => {
    const configured = ensureRedisInitialized();

    if (!configured) {
        return c.json({
            success: true,
            configured: false,
            message: 'Redis not configured. Configure via Settings > Cache & Performance.',
        }, 200);
    }

    const connectionResult = await testConnection();

    return c.json({
        success: true,
        configured: true,
        connected: connectionResult.success,
        message: connectionResult.message,
    }, 200);
});

export { cacheRoute };
