/**
 * Deno KV Cache Provider
 * 
 * Uses the built-in Deno.openKv() API available on Deno Deploy.
 * No external credentials needed — KV is automatically available
 * to every Deno Deploy app.
 * 
 * KV stores values as Uint8Array/string, so we JSON-serialize
 * all values to match the Redis-like string interface.
 */

import type { ICacheProvider } from './ICacheProvider.js';

// Deno KV types (Deno global is available at runtime on Deno Deploy)
declare const Deno: {
    openKv(): Promise<DenoKv>;
};

interface DenoKv {
    get<T = unknown>(key: string[]): Promise<{ value: T | null; versionstamp: string | null }>;
    set(key: string[], value: unknown, options?: { expireIn?: number }): Promise<void>;
    delete(key: string[]): Promise<void>;
    list<T = unknown>(options: { prefix: string[] }): AsyncIterable<{ key: string[]; value: T }>;
    atomic(): DenoKvAtomic;
    close(): void;
}

interface DenoKvAtomic {
    mutate(...ops: unknown[]): DenoKvAtomic;
    commit(): Promise<{ ok: boolean }>;
}

export class DenoKvProvider implements ICacheProvider {
    private kvPromise: Promise<DenoKv>;

    constructor() {
        this.kvPromise = Deno.openKv();
    }

    private toKey(key: string): string[] {
        return ['frontbase', 'cache', key];
    }

    async get<T>(key: string): Promise<T | null> {
        const kv = await this.kvPromise;
        const result = await kv.get<string>(this.toKey(key));
        if (result.value === null) return null;
        try {
            return JSON.parse(result.value) as T;
        } catch {
            return result.value as unknown as T;
        }
    }

    async set(key: string, value: string): Promise<void> {
        const kv = await this.kvPromise;
        await kv.set(this.toKey(key), value);
    }

    async setex(key: string, seconds: number, value: string): Promise<void> {
        const kv = await this.kvPromise;
        await kv.set(this.toKey(key), value, { expireIn: seconds * 1000 });
    }

    async del(...keys: string[]): Promise<number> {
        const kv = await this.kvPromise;
        let count = 0;
        for (const key of keys) {
            await kv.delete(this.toKey(key));
            count++;
        }
        return count;
    }

    async keys(pattern: string): Promise<string[]> {
        const kv = await this.kvPromise;
        const results: string[] = [];
        // Convert glob pattern to prefix (e.g. "page:*" → ["frontbase", "cache", "page:"])
        const prefix = pattern.replace(/\*.*$/, '');
        for await (const entry of kv.list<unknown>({ prefix: ['frontbase', 'cache', ...(prefix ? [prefix] : [])] })) {
            // Reconstruct the key string from the key array
            const keyParts = entry.key as string[];
            if (keyParts.length >= 3) {
                results.push(keyParts.slice(2).join(':'));
            }
        }
        return results;
    }

    async ping(): Promise<string> {
        // Verify KV is accessible
        await this.kvPromise;
        return 'PONG';
    }

    // ── Queue operations (list-based, using KV sorted keys) ──────────

    async lpush(key: string, ...elements: string[]): Promise<number> {
        const kv = await this.kvPromise;
        const listKey = ['frontbase', 'queue', key];
        for (const el of elements) {
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            await kv.set([...listKey, id], el);
        }
        return elements.length;
    }

    async rpop(key: string): Promise<string | null> {
        const kv = await this.kvPromise;
        const listKey = ['frontbase', 'queue', key];
        let oldest: { key: string[]; value: string } | null = null;
        for await (const entry of kv.list<string>({ prefix: listKey })) {
            oldest = entry;
            break; // First entry is the oldest (sorted by key)
        }
        if (!oldest) return null;
        await kv.delete(oldest.key);
        return oldest.value;
    }

    async llen(key: string): Promise<number> {
        const kv = await this.kvPromise;
        const listKey = ['frontbase', 'queue', key];
        let count = 0;
        for await (const _ of kv.list({ prefix: listKey })) {
            count++;
        }
        return count;
    }

    // ── Rate limiting ────────────────────────────────────────────────

    async incr(key: string): Promise<number> {
        const kv = await this.kvPromise;
        const k = this.toKey(key);
        const current = await kv.get<number>(k);
        const newVal = (current.value ?? 0) + 1;
        await kv.set(k, newVal);
        return newVal;
    }

    async decr(key: string): Promise<number> {
        const kv = await this.kvPromise;
        const k = this.toKey(key);
        const current = await kv.get<number>(k);
        const newVal = (current.value ?? 0) - 1;
        await kv.set(k, newVal);
        return newVal;
    }

    async expire(key: string, seconds: number): Promise<number> {
        const kv = await this.kvPromise;
        const k = this.toKey(key);
        const current = await kv.get<string>(k);
        if (current.value === null) return 0;
        // Re-set with expiry
        await kv.set(k, current.value, { expireIn: seconds * 1000 });
        return 1;
    }

    // ── Sorted set (priority queue) ──────────────────────────────────

    async zadd(key: string, score: number, member: string): Promise<number> {
        const kv = await this.kvPromise;
        const zKey = ['frontbase', 'zset', key, score.toString().padStart(15, '0'), member];
        await kv.set(zKey, member);
        return 1;
    }

    async zpopmax(key: string): Promise<{ member: string; score: number } | null> {
        const kv = await this.kvPromise;
        const prefix = ['frontbase', 'zset', key];
        let last: { key: string[]; value: string } | null = null;
        for await (const entry of kv.list<string>({ prefix })) {
            last = entry; // Keep iterating to get the last (highest score)
        }
        if (!last) return null;
        await kv.delete(last.key);
        const keyParts = last.key as string[];
        const score = parseFloat(keyParts[keyParts.length - 2]);
        return { member: last.value, score };
    }
}
