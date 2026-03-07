/**
 * IoRedis Adapter — Node.js / Docker only.
 * 
 * Separated from redis.ts so edge bundles (Supabase, Netlify, Deno Deploy)
 * never transitively import ioredis and its Node.js built-in dependencies
 * (net, tls, events, stream, etc.).
 * 
 * This file is only loaded via dynamic import() in initRedisAsync().
 */

import type { ICacheProvider } from './ICacheProvider.js';

export class IoRedisAdapter implements ICacheProvider {
    private client: any;
    private initialized: Promise<void>;

    constructor(url: string) {
        this.initialized = this.initClient(url);
    }

    private async initClient(url: string) {
        try {
            // Dynamic import to keep ioredis out of static analysis
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

    async decr(key: string) {
        await this.ensureClient();
        return this.client.decr(key);
    }

    async zadd(key: string, score: number, member: string) {
        await this.ensureClient();
        return this.client.zadd(key, score, member);
    }

    async zpopmax(key: string): Promise<{ member: string; score: number } | null> {
        await this.ensureClient();
        // ioredis zpopmax returns [member, score] or empty array
        const result = await this.client.zpopmax(key, 1);
        if (!result || result.length < 2) return null;
        return { member: result[0], score: parseFloat(result[1]) };
    }
}
