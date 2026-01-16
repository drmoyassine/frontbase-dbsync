/**
 * Cache API Routes
 * 
 * Hono routes for cache management and testing.
 */

import { Hono } from 'hono';
import { initRedis, testConnection, invalidate, invalidatePattern, getRedis } from '../cache/redis';

const cacheRoute = new Hono();

// =============================================================================
// Helper: Initialize Redis from config (from database in production)
// =============================================================================
function ensureRedisInitialized(): boolean {
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
// GET /test - Test Redis connection
// =============================================================================
cacheRoute.get('/test', async (c) => {
    if (!ensureRedisInitialized()) {
        return c.json({ success: false, message: 'Redis not configured' });
    }

    const result = await testConnection();
    return c.json(result);
});

// =============================================================================
// POST /invalidate - Invalidate cache key(s)
// =============================================================================
cacheRoute.post('/invalidate', async (c) => {
    if (!ensureRedisInitialized()) {
        return c.json({ success: false, message: 'Redis not configured' }, 400);
    }

    try {
        const { key, pattern } = await c.req.json<{ key?: string; pattern?: string }>();

        if (key) {
            await invalidate(key);
            return c.json({ success: true, message: `Invalidated key: ${key}` });
        } else if (pattern) {
            await invalidatePattern(pattern);
            return c.json({ success: true, message: `Invalidated pattern: ${pattern}` });
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
cacheRoute.get('/stats', async (c) => {
    const configured = ensureRedisInitialized();

    if (!configured) {
        return c.json({
            success: true,
            configured: false,
            message: 'Redis not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
        });
    }

    const connectionResult = await testConnection();

    return c.json({
        success: true,
        configured: true,
        connected: connectionResult.success,
        message: connectionResult.message,
    });
});

export { cacheRoute };
