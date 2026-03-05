/**
 * Cache Provider Interface
 * 
 * Unified interface for all cache backends (Upstash, IoRedis, Null).
 * Mirrors the existing RedisClientAdapter but exported as a proper
 * provider interface for the factory pattern.
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — the cache provider is
 * the only cache access layer. No direct Redis imports outside this module.
 */

export interface ICacheProvider {
    // Core key-value
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

    // Rate limiting / concurrency
    incr(key: string): Promise<number>;
    decr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;

    // Sorted set (priority queue)
    zadd(key: string, score: number, member: string): Promise<number>;
    zpopmax(key: string): Promise<{ member: string; score: number } | null>;
}
