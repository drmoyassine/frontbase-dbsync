/**
 * Cache Provider Factory
 * 
 * Mirrors the storage/index.ts pattern: mutable singleton with Proxy
 * for transparent hot-swap after startup sync.
 * 
 * Priority order:
 *   1. UPSTASH_REDIS_REST_URL + TOKEN → UpstashAdapter (HTTP, CF-compatible)
 *   2. REDIS_URL → IoRedisAdapter (TCP, Docker/Node.js only)
 *   3. Default: NullCacheProvider (no-op, no crash)
 * 
 * Usage:
 *   import { cacheProvider } from './cache';
 *   const page = await cacheProvider.get<string>('page:about');
 */

import type { ICacheProvider } from './ICacheProvider.js';
import { NullCacheProvider } from './NullCacheProvider.js';

// Re-export for convenience
export type { ICacheProvider } from './ICacheProvider.js';
export { NullCacheProvider } from './NullCacheProvider.js';

// =============================================================================
// Mutable Singleton
// =============================================================================

let _provider: ICacheProvider | null = null;

/**
 * Create the initial cache provider from environment variables.
 */
function createInitialProvider(): ICacheProvider {
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const redisUrl = process.env.REDIS_URL;

    if (upstashUrl && upstashToken) {
        // Lazy import to allow tree-shaking in Lite bundles
        try {
            const { initRedis } = require('./redis.js');
            console.log('🔴 Cache: Upstash HTTP provider');
            return initRedis({ url: upstashUrl, token: upstashToken });
        } catch {
            console.warn('⚠️ Failed to init Upstash adapter, falling back to NullCache');
            return new NullCacheProvider();
        }
    }

    if (redisUrl) {
        try {
            const { initRedis } = require('./redis.js');
            console.log('🔴 Cache: IoRedis TCP provider');
            return initRedis({ url: redisUrl });
        } catch {
            console.warn('⚠️ Failed to init IoRedis adapter, falling back to NullCache');
            return new NullCacheProvider();
        }
    }

    console.log('⬜ Cache: NullCacheProvider (no Redis configured)');
    return new NullCacheProvider();
}

/**
 * Get the current cache provider. Lazy-initializes on first access.
 */
export function getCacheProvider(): ICacheProvider {
    if (!_provider) {
        _provider = createInitialProvider();
    }
    return _provider;
}

/**
 * Replace the current cache provider (e.g., after startup sync fetches config).
 */
export function setCacheProvider(provider: ICacheProvider): void {
    _provider = provider;
    console.log('🔄 Cache provider updated');
}

/**
 * Global cache provider accessor.
 * Uses a Proxy so callers always get the latest provider instance
 * without needing to re-import after hot-swap.
 */
export const cacheProvider: ICacheProvider = new Proxy({} as ICacheProvider, {
    get(_target, prop: string) {
        const provider = getCacheProvider();
        const value = (provider as any)[prop];
        if (typeof value === 'function') {
            return value.bind(provider);
        }
        return value;
    }
});

// Re-export high-level helpers from redis.ts for backward compatibility
export { cached, invalidate, invalidatePattern, rateLimit, testConnection, enqueue, dequeue, queueLength } from './redis.js';
