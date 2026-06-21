/**
 * Read-through stale-cache fallback for datasource reads (Sprint 2A / P1‑3).
 *
 * When an external datasource read fails, serve the last-good cached result and
 * flag it stale (caller sets `X-Fb-Cache: stale`). Read‑only by construction —
 * the helpers here are only used on the query/read path, never on writes.
 *
 * The last-good store is the edge cache (`cache/redis.ts` set/get, backed by
 * Upstash/Redis/CF‑KV/Deno‑KV, or NullCacheProvider when unconfigured). When no
 * cache is configured the fallback is inert (get returns null → the original
 * error propagates), which is the correct degraded behaviour.
 */

import { set as cacheSet, get as cacheGet } from '../cache/redis.js';

/** TTL for the last-good copy — long, since it's only served on failure. */
const LASTGOOD_TTL = 24 * 60 * 60; // 24h

export interface FallbackResult<T> {
    value: T;
    stale: boolean;
}

/**
 * Stable, bounded key hash (djb2). Inputs are plain JSON options/datarequests,
 * so a synchronous string hash is sufficient and avoids async crypto.
 */
export function stableHash(input: unknown): string {
    const s = typeof input === 'string' ? input : safeStringify(input);
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/** JSON.stringify that tolerates circular references (best-effort key input). */
function safeStringify(input: unknown): string {
    try {
        return JSON.stringify(input);
    } catch {
        return String(input);
    }
}

/**
 * Run a read with a stale-cache fallback.
 *
 * - Success (the read resolves AND `isError(value)` is false): store the
 *   last-good copy (fire‑and‑forget) and return `{ value, stale: false }`.
 * - Failure (the read throws, OR `isError(value)` is true): return the cached
 *   last-good as `{ value, stale: true }`; if nothing is cached, rethrow so the
 *   caller surfaces the real error.
 *
 * `isError` lets callers that signal failure via a returned field (e.g.
 * `QueryResult.error`) opt into the fallback without throwing.
 */
export async function readWithFallback<T>(
    key: string,
    read: () => Promise<T>,
    isError: (value: T) => boolean,
): Promise<FallbackResult<T>> {
    try {
        const value = await read();
        if (isError(value)) throw new Error('read returned an error state');
        // Don't block the response on the write — it's best-effort.
        void cacheSet(key, value, LASTGOOD_TTL).catch(() => {
            /* cache unavailable — non-fatal */
        });
        return { value, stale: false };
    } catch (err) {
        const cached = await cacheGet<T>(key).catch(() => null);
        if (cached !== null && cached !== undefined) {
            return { value: cached, stale: true };
        }
        throw err;
    }
}
