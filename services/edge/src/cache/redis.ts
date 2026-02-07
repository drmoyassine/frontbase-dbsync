/**
 * Unified Redis Cache Service
 * 
 * Supports both @upstash/redis (HTTP/REST) and ioredis (TCP/Local).
 * Automatically selects the driver based on the connection URL protocol.
 */

import { Redis as UpstashRedis } from '@upstash/redis';

export interface RedisConfig {
    url: string;
    token?: string;
}

// Unified interface for both clients
interface RedisClientAdapter {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: string): Promise<void | any>;
    setex(key: string, seconds: number, value: string): Promise<void | any>;
    del(...keys: string[]): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    ping(): Promise<string>;

    // Queue ops
    lpush(key: string, ...elements: string[]): Promise<number>;
    rpop(key: string): Promise<string | null>;
    llen(key: string): Promise<number>;

    // Rate limiting
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
}

// Adapter for Upstash (HTTP)
class UpstashAdapter implements RedisClientAdapter {
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
}

// Adapter for IORedis (TCP)
class IoRedisAdapter implements RedisClientAdapter {
    private client: any;
    private initialized: Promise<void>;

    constructor(url: string) {
        this.initialized = this.initClient(url);
    }

    private async initClient(url: string) {
        try {
            // Dynamic import to avoid bundling 'net' in Edge runtimes
            const { default: IORedis } = await import('ioredis');
            this.client = new IORedis(url, {
                connectTimeout: 1000, // 1 second timeout
                maxRetriesPerRequest: 1
            });
        } catch (error) {
            console.error('Failed to load ioredis. Ensure you are running in a Node.js environment for TCP connections.', error);
            throw error;
        }
    }

    private async ensureClient() {
        await this.initialized;
        if (!this.client) throw new Error('Redis client not initialized');
    }

    async get<T>(key: string): Promise<T | null> {
        await this.ensureClient();
        const value = await this.client.get(key);
        if (!value) return null;
        try {
            return JSON.parse(value) as T;
        } catch {
            return value as unknown as T;
        }
    }

    async set(key: string, value: string) {
        await this.ensureClient();
        return this.client.set(key, value);
    }

    async setex(key: string, seconds: number, value: string) {
        await this.ensureClient();
        return this.client.setex(key, seconds, value);
    }

    async del(...keys: string[]) {
        await this.ensureClient();
        return this.client.del(...keys);
    }

    async keys(pattern: string) {
        await this.ensureClient();
        return this.client.keys(pattern);
    }

    async ping() {
        await this.ensureClient();
        return this.client.ping();
    }

    async lpush(key: string, ...elements: string[]) {
        await this.ensureClient();
        return this.client.lpush(key, ...elements);
    }

    async rpop(key: string) {
        await this.ensureClient();
        return this.client.rpop(key);
    }

    async llen(key: string) {
        await this.ensureClient();
        return this.client.llen(key);
    }

    async incr(key: string) {
        await this.ensureClient();
        return this.client.incr(key);
    }

    async expire(key: string, seconds: number) {
        await this.ensureClient();
        return this.client.expire(key, seconds);
    }
}

let redisInstance: RedisClientAdapter | null = null;

/**
 * Initialize Redis client with provided config.
 * Selects UpstashAdapter for HTTP/HTTPS URLs.
 * Selects IoRedisAdapter for Redis/Rediss URLs.
 */
export function initRedis(config: RedisConfig): RedisClientAdapter {
    if (config.url.startsWith('http')) {
        if (!config.token) {
            throw new Error('Redis Token is required for Upstash HTTP connection');
        }
        redisInstance = new UpstashAdapter(config.url, config.token);
    } else {
        // Assume TCP (redis://)
        redisInstance = new IoRedisAdapter(config.url);
    }
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
    // TEMPORARY BYPASS: Redis is down locally, causing 5s timeout.
    if (true) {
        return fn();
    }

    const redis = getRedis();

    // Try to get from cache
    const cachedValue = await redis.get<T>(key);
    if (cachedValue !== null) {
        return cachedValue as T;
    }

    // Execute function and cache result
    const result = await fn();
    // Use JSON.stringify because our adapters expect string values for set
    // Note: Upstash adapter's underlying client might auto-serialize, but we unified to string
    // logic in get<T> to handle parsing.
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
