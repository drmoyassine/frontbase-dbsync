/**
 * Null Cache Provider
 * 
 * No-op implementation for engines deployed without a cache backend.
 * Returns null/0/empty for all operations — never throws.
 * 
 * Used when neither UPSTASH_REDIS_REST_URL nor REDIS_URL is configured.
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

    // Rate limiting — always allow
    async incr(_key: string) { return 1; }
    async expire(_key: string, _seconds: number) { return 1; }
}
