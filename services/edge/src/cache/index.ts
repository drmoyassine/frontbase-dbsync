/**
 * Cache Provider Factory
 * 
 * Mirrors the storage/index.ts pattern: mutable singleton with Proxy
 * for transparent hot-swap after startup sync.
 * 
 * Priority order:
 *   1. FRONTBASE_CACHE_URL (HTTP https://) + FRONTBASE_CACHE_TOKEN → HttpCacheAdapter
 *   2. FRONTBASE_CACHE_URL (TCP redis://) → IoRedisAdapter (Docker/Node.js only)
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
async function createInitialProvider(): Promise<ICacheProvider> {
    const cacheUrl = process.env.FRONTBASE_CACHE_URL;
    const cacheToken = process.env.FRONTBASE_CACHE_TOKEN;
    const cacheProvider = process.env.FRONTBASE_CACHE_PROVIDER?.toLowerCase();

    // Provider-specific dispatch (explicit FRONTBASE_CACHE_PROVIDER)
    if (cacheProvider === 'deno_kv') {
        try {
            const { DenoKvProvider } = require('./DenoKvProvider.js');
            console.log('🦕 Cache: DenoKvProvider (Deno.openKv)');
            return new DenoKvProvider();
        } catch (e: any) {
            console.warn(`⚠️ Failed to init Deno KV cache adapter: ${e.message}`);
            return new NullCacheProvider();
        }
    }

    if (cacheProvider === 'cloudflare' || cacheProvider === 'cloudflare_kv') {
        try {
            const { CfKvHttpProvider } = require('./CfKvHttpProvider.js');
            console.log('🔶 Cache: CfKvHttpProvider (KV via HTTP)');
            return new CfKvHttpProvider();
        } catch (e: any) {
            console.warn(`⚠️ Failed to init CF KV cache adapter: ${e.message}`);
            return new NullCacheProvider();
        }
    }

    if (cacheUrl && cacheUrl.startsWith('http') && cacheToken) {
        // HTTP cache (Upstash, SRH proxy, Dragonfly HTTP, etc.)
        try {
            const { initRedis } = require('./redis.js');
            console.log('🔴 Cache: HTTP provider');
            return initRedis({ url: cacheUrl, token: cacheToken });
        } catch {
            console.warn('⚠️ Failed to init HTTP cache adapter, falling back to NullCache');
            return new NullCacheProvider();
        }
    }

    if (cacheUrl && !cacheUrl.startsWith('http')) {
        // TCP cache (redis://, rediss://) — Docker/Node.js only
        try {
            const { initRedisAsync } = require('./redis.js');
            console.log('🔴 Cache: IoRedis TCP provider');
            return await initRedisAsync({ url: cacheUrl });
        } catch {
            console.warn('⚠️ Failed to init IoRedis adapter, falling back to NullCache');
            return new NullCacheProvider();
        }
    }

    console.log('⬜ Cache: NullCacheProvider (no cache configured)');
    return new NullCacheProvider();
}

let _initPromise: Promise<ICacheProvider> | null = null;

/**
 * Get the current cache provider. Lazy-initializes on first access.
 */
export function getCacheProvider(): ICacheProvider {
    if (!_provider) {
        // Start async init, return NullCacheProvider until ready
        if (!_initPromise) {
            _initPromise = createInitialProvider().then(p => {
                _provider = p;
                return p;
            });
        }
        return new NullCacheProvider(); // Temporary until async init completes
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
