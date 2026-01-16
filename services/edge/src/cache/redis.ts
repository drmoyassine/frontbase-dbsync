/**
 * Upstash Redis Cache Service
 * 
 * Edge-compatible caching using @upstash/redis HTTP client.
 * Works on Cloudflare Workers, Vercel Edge, and Node.js.
 */

import { Redis } from '@upstash/redis';

export interface RedisConfig {
    url: string;
    token: string;
}

let redisInstance: Redis | null = null;

/**
 * Initialize Redis client with Upstash credentials
 */
export function initRedis(config: RedisConfig): Redis {
    redisInstance = new Redis({
        url: config.url,
        token: config.token,
    });
    return redisInstance;
}

/**
 * Get the Redis instance (must be initialized first)
 */
export function getRedis(): Redis {
    if (!redisInstance) {
        throw new Error('Redis not initialized. Call initRedis() first.');
    }
    return redisInstance;
}

/**
 * Cache wrapper - fetch from cache or execute function
 */
export async function cached<T>(
    key: string,
    fn: () => Promise<T>,
    ttlSeconds: number = 60
): Promise<T> {
    const redis = getRedis();

    // Try to get from cache
    const cachedValue = await redis.get<T>(key);
    if (cachedValue !== null) {
        return cachedValue;
    }

    // Execute function and cache result
    const result = await fn();
    await redis.setex(key, ttlSeconds, JSON.stringify(result));

    return result;
}

/**
 * Invalidate a cache key
 */
export async function invalidate(key: string): Promise<void> {
    const redis = getRedis();
    await redis.del(key);
}

/**
 * Invalidate multiple cache keys by pattern
 */
export async function invalidatePattern(pattern: string): Promise<void> {
    const redis = getRedis();
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
        await redis.del(...keys);
    }
}

/**
 * Set a value with optional TTL
 */
export async function set<T>(
    key: string,
    value: T,
    ttlSeconds?: number
): Promise<void> {
    const redis = getRedis();
    if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } else {
        await redis.set(key, JSON.stringify(value));
    }
}

/**
 * Get a value
 */
export async function get<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    return redis.get<T>(key);
}

// =============================================================================
// Queue Operations (for async tasks)
// =============================================================================

/**
 * Add item to a queue (LPUSH)
 */
export async function enqueue<T>(queue: string, data: T): Promise<void> {
    const redis = getRedis();
    await redis.lpush(queue, JSON.stringify(data));
}

/**
 * Get item from a queue (RPOP)
 */
export async function dequeue<T>(queue: string): Promise<T | null> {
    const redis = getRedis();
    const item = await redis.rpop(queue);
    return item ? JSON.parse(item as string) : null;
}

/**
 * Get queue length
 */
export async function queueLength(queue: string): Promise<number> {
    const redis = getRedis();
    return redis.llen(queue);
}

// =============================================================================
// Rate Limiting
// =============================================================================

/**
 * Simple rate limiter
 */
export async function rateLimit(
    key: string,
    limit: number,
    windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
    const redis = getRedis();
    const current = await redis.incr(key);

    if (current === 1) {
        // First request, set expiry
        await redis.expire(key, windowSeconds);
    }

    return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
    };
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Test Redis connection
 */
export async function testConnection(): Promise<{ success: boolean; message: string }> {
    try {
        const redis = getRedis();
        await redis.ping();
        return { success: true, message: 'Redis connection successful' };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Connection failed'
        };
    }
}
