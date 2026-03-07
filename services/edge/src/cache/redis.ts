/**
 * Unified Redis Cache Service
 * 
 * Supports both @upstash/redis (HTTP/REST) and ioredis (TCP/Local).
 * Automatically selects the driver based on the connection URL protocol.
 */

import { Redis as UpstashRedis } from '@upstash/redis';
import type { ICacheProvider } from './ICacheProvider.js';

export interface RedisConfig {
    url: string;
    token?: string;
}

// Backward-compatible alias — ICacheProvider is the canonical interface
type RedisClientAdapter = ICacheProvider;

// Adapter for Upstash (HTTP)
export class UpstashAdapter implements ICacheProvider {
    private client: UpstashRedis;

    constructor(url: string, token: string) {
        this.client = new UpstashRedis({ url, token });
    }

    async get<T>(key: string): Promise<T | null> {
        return this.client.get<T>(key);
    }

    async set(key: string, value: string) {
        return this.client.set(key, value);
    }

    async setex(key: string, seconds: number, value: string) {
        return this.client.setex(key, seconds, value);
    }

    async del(...keys: string[]) {
        return this.client.del(...keys);
    }

    async keys(pattern: string) {
        return this.client.keys(pattern);
    }

    async ping() {
        return this.client.ping();
    }

    async lpush(key: string, ...elements: string[]) {
        return this.client.lpush(key, ...elements);
    }

    async rpop(key: string) {
        return this.client.rpop(key);
    }

    async llen(key: string) {
        return this.client.llen(key);
    }

    async incr(key: string) {
        return this.client.incr(key);
    }

    async expire(key: string, seconds: number) {
        return this.client.expire(key, seconds);
    }

    async decr(key: string) {
        return this.client.decr(key);
    }

    async zadd(key: string, score: number, member: string): Promise<number> {
        const result = await this.client.zadd(key, { score, member });
        return result ?? 0;
    }

    async zpopmax(key: string): Promise<{ member: string; score: number } | null> {
        const result = await this.client.zpopmax<string>(key, 1);
        if (!result || result.length === 0) return null;
        // Upstash returns [{member, score}] for zpopmax
        const first = result[0] as any;
        if (first && typeof first === 'object' && 'member' in first) {
            return { member: first.member, score: first.score };
        }
        return null;
    }
}

let redisInstance: RedisClientAdapter | null = null;

/**
 * Initialize Redis client with provided config (sync — HTTP/Upstash only).
 * For TCP redis:// URLs, use initRedisAsync() instead.
 */
export function initRedis(config: RedisConfig): RedisClientAdapter {
    if (config.url.startsWith('http')) {
        if (!config.token) {
            throw new Error('Redis Token is required for Upstash HTTP connection');
        }
        redisInstance = new UpstashAdapter(config.url, config.token);
    } else {
        throw new Error('TCP Redis (redis://) requires initRedisAsync(). Use initRedisAsync() for non-HTTP URLs.');
    }
    return redisInstance;
}

/**
 * Initialize Redis client (async — supports both HTTP and TCP).
 * TCP path uses dynamic import to keep ioredis out of edge bundles.
 */
export async function initRedisAsync(config: RedisConfig): Promise<RedisClientAdapter> {
    if (config.url.startsWith('http')) {
        return initRedis(config);
    }
    // Dynamic import: ioredis-adapter.ts is NOT in the static import graph
    // so edge bundles (Supabase, Netlify, Deno) never see ioredis.
    const { IoRedisAdapter } = await import('./ioredis-adapter.js');
    redisInstance = new IoRedisAdapter(config.url);
    return redisInstance;
}

/**
 * Get the Redis instance (must be initialized first)
 */
export function getRedis(): RedisClientAdapter {
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
    try {
        const redis = getRedis();

        // Try to get from cache
        const cachedValue = await redis.get<T>(key);
        if (cachedValue !== null) {
            return cachedValue as T;
        }

        // Execute function and cache result
        const result = await fn();
        await redis.setex(key, ttlSeconds, JSON.stringify(result));
        return result;
    } catch {
        // Redis not available — fall through to direct execution
        return fn();
    }
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
    const stringValue = JSON.stringify(value);

    if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, stringValue);
    } else {
        await redis.set(key, stringValue);
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
    // Adapters return string | null
    return item ? JSON.parse(item) : null;
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
        // Ping returns 'PONG' or similar string. The adapter interface defines ping(): Promise<string>.
        await redis.ping();
        return { success: true, message: 'Redis connection successful' };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Connection failed'
        };
    }
}
