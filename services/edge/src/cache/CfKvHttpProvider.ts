/**
 * CfKvHttpProvider — Cloudflare KV via HTTP REST API
 * 
 * Implements ICacheProvider using the CF KV REST API so any edge engine
 * (Deno, Vercel, Supabase, Netlify, Docker, CF Workers) can use CF KV
 * as a cache backend.
 * 
 * CF KV is a pure key-value store — it does NOT support Redis-like data
 * structures (lists, sorted sets, atomic counters). Those methods return
 * no-op defaults, matching NullCacheProvider behavior.
 * 
 * Env vars:
 * - FRONTBASE_CACHE_URL: "kv://<namespace-id>"
 * - FRONTBASE_CF_API_TOKEN: Scoped CF API token (KV read+write)
 * - FRONTBASE_CF_ACCOUNT_ID: CF account ID
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — no calls to FastAPI at runtime.
 */

import type { ICacheProvider } from './ICacheProvider.js';

const CF_API = 'https://api.cloudflare.com/client/v4';

// =============================================================================
// CF KV HTTP API Client
// =============================================================================

function kvUrl(accountId: string, namespaceId: string, path: string): string {
    return `${CF_API}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}${path}`;
}

function authHeaders(apiToken: string): Record<string, string> {
    return {
        'Authorization': `Bearer ${apiToken}`,
    };
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class CfKvHttpProvider implements ICacheProvider {
    private accountId: string = '';
    private namespaceId: string = '';
    private apiToken: string = '';

    private ensureConfig(): void {
        if (this.accountId) return;

        const cacheUrl = process.env.FRONTBASE_CACHE_URL || '';
        this.apiToken = process.env.FRONTBASE_CF_API_TOKEN || '';
        this.accountId = process.env.FRONTBASE_CF_ACCOUNT_ID || '';

        // Parse kv://<namespace-id> → extract namespace ID
        if (cacheUrl.startsWith('kv://')) {
            this.namespaceId = cacheUrl.replace('kv://', '');
        } else {
            this.namespaceId = cacheUrl;
        }

        if (!this.namespaceId || !this.apiToken || !this.accountId) {
            throw new Error(
                '[CfKvHttpProvider] Missing env vars. Required: ' +
                'FRONTBASE_CACHE_URL (kv://namespace-id), FRONTBASE_CF_API_TOKEN, FRONTBASE_CF_ACCOUNT_ID'
            );
        }

        console.log(`🔶 CfKvHttpProvider configured: KV ${this.namespaceId.substring(0, 8)}...`);
    }

    // =========================================================================
    // Core Key-Value Operations
    // =========================================================================

    async get<T>(key: string): Promise<T | null> {
        this.ensureConfig();
        const url = kvUrl(this.accountId, this.namespaceId, `/values/${encodeURIComponent(key)}`);

        const resp = await fetch(url, {
            headers: authHeaders(this.apiToken),
        });

        if (resp.status === 404) return null;
        if (!resp.ok) {
            console.error(`[CfKvHttpProvider] GET ${key} failed: ${resp.status}`);
            return null;
        }

        const text = await resp.text();
        try {
            return JSON.parse(text) as T;
        } catch {
            return text as unknown as T;
        }
    }

    async set(key: string, value: string): Promise<void> {
        this.ensureConfig();
        const url = kvUrl(this.accountId, this.namespaceId, `/values/${encodeURIComponent(key)}`);

        const resp = await fetch(url, {
            method: 'PUT',
            headers: {
                ...authHeaders(this.apiToken),
                'Content-Type': 'text/plain',
            },
            body: value,
        });

        if (!resp.ok) {
            const text = await resp.text();
            console.error(`[CfKvHttpProvider] SET ${key} failed: ${resp.status} ${text.substring(0, 200)}`);
        }
    }

    async setex(key: string, seconds: number, value: string): Promise<void> {
        this.ensureConfig();
        const url = kvUrl(
            this.accountId, this.namespaceId,
            `/values/${encodeURIComponent(key)}?expiration_ttl=${seconds}`
        );

        const resp = await fetch(url, {
            method: 'PUT',
            headers: {
                ...authHeaders(this.apiToken),
                'Content-Type': 'text/plain',
            },
            body: value,
        });

        if (!resp.ok) {
            const text = await resp.text();
            console.error(`[CfKvHttpProvider] SETEX ${key} failed: ${resp.status} ${text.substring(0, 200)}`);
        }
    }

    async del(...keys: string[]): Promise<number> {
        this.ensureConfig();
        let deleted = 0;

        // CF KV bulk delete: PUT /namespaces/{id}/values with array of keys
        // But single deletes are simpler for small counts
        for (const key of keys) {
            const url = kvUrl(this.accountId, this.namespaceId, `/values/${encodeURIComponent(key)}`);
            const resp = await fetch(url, {
                method: 'DELETE',
                headers: authHeaders(this.apiToken),
            });
            if (resp.ok) deleted++;
        }

        return deleted;
    }

    async keys(pattern: string): Promise<string[]> {
        this.ensureConfig();
        // CF KV only supports prefix-based listing, not glob patterns
        // Strip trailing * for prefix search (e.g., "page:*" → "page:")
        const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
        const url = kvUrl(
            this.accountId, this.namespaceId,
            `/keys?prefix=${encodeURIComponent(prefix)}&limit=1000`
        );

        const resp = await fetch(url, {
            headers: authHeaders(this.apiToken),
        });

        if (!resp.ok) return [];

        const data = await resp.json() as any;
        const result = data?.result || [];
        return result.map((item: any) => item.name as string);
    }

    async ping(): Promise<string> {
        this.ensureConfig();
        // Lightweight check: list 1 key to verify connectivity
        const url = kvUrl(this.accountId, this.namespaceId, '/keys?limit=1');

        const resp = await fetch(url, {
            headers: authHeaders(this.apiToken),
        });

        if (resp.ok) return 'PONG (CF KV)';
        throw new Error(`[CfKvHttpProvider] Ping failed: ${resp.status}`);
    }

    // =========================================================================
    // Unsupported Operations (no-op — KV is not a data structure server)
    // =========================================================================

    async lpush(_key: string, ..._elements: string[]): Promise<number> { return 0; }
    async rpop(_key: string): Promise<string | null> { return null; }
    async llen(_key: string): Promise<number> { return 0; }

    async incr(_key: string): Promise<number> { return 1; }
    async decr(_key: string): Promise<number> { return 0; }
    async expire(_key: string, _seconds: number): Promise<number> { return 1; }

    async zadd(_key: string, _score: number, _member: string): Promise<number> { return 1; }
    async zpopmax(_key: string): Promise<{ member: string; score: number } | null> { return null; }
}
