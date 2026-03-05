/**
 * Null Cache Provider
 * 
 * No-op implementation for engines deployed without a cache backend.
 * Returns null/0/empty for all operations — never throws.
 * 
 * Used when FRONTBASE_CACHE_URL is not configured.
 */

import type { ICacheProvider } from './ICacheProvider.js';

export class NullCacheProvider implements ICacheProvider {
    async get<T>(_key: string): Promise<T | null> { return null; }
    async set(_key: string, _value: string) { /* no-op */ }
    async setex(_key: string, _seconds: number, _value: string) { /* no-op */ }
    async del(..._keys: string[]) { return 0; }
    async keys(_pattern: string) { return []; }
    async ping() { return 'PONG (null-cache)'; }

    // Queue ops
    async lpush(_key: string, ..._elements: string[]) { return 0; }
    async rpop(_key: string) { return null; }
    async llen(_key: string) { return 0; }

    // Rate limiting / concurrency — always allow
    async incr(_key: string) { return 1; }
    async decr(_key: string) { return 0; }
    async expire(_key: string, _seconds: number) { return 1; }

    // Sorted set (priority queue) — no-op
    async zadd(_key: string, _score: number, _member: string) { return 1; }
    async zpopmax(_key: string) { return null; }
}
