import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory cache stand-in for the edge cache module (set/get).
const { cache, setMock, getMock } = vi.hoisted(() => {
    const cache = new Map<string, unknown>();
    return {
        cache,
        setMock: async (k: string, v: unknown) => { cache.set(k, v); },
        getMock: async (k: string) => (cache.has(k) ? cache.get(k) : null),
    };
});

vi.mock('../cache/redis.js', () => ({ set: setMock, get: getMock }));

const { readWithFallback, stableHash } = await import('../db/fallback.js');

describe('readWithFallback (Sprint 2A stale-cache fallback)', () => {
    beforeEach(() => cache.clear());

    it('returns the fresh value and stores last-good on success', async () => {
        const r = await readWithFallback('k1', async () => ({ data: [1, 2] }), () => false);
        expect(r.stale).toBe(false);
        expect(r.value).toEqual({ data: [1, 2] });
        expect(cache.get('k1')).toEqual({ data: [1, 2] });
    });

    it('serves cached last-good (stale) when the read throws', async () => {
        cache.set('k2', { data: [9] });
        const r = await readWithFallback('k2', async () => { throw new Error('boom'); }, () => false);
        expect(r.stale).toBe(true);
        expect(r.value).toEqual({ data: [9] });
    });

    it('serves cached last-good when isError(value) is true', async () => {
        cache.set('k3', { data: [9] });
        const r = await readWithFallback('k3', async () => ({ error: 'upstream' }), (v: any) => !!v.error);
        expect(r.stale).toBe(true);
        expect(r.value).toEqual({ data: [9] });
    });

    it('rethrows when the read fails and nothing is cached', async () => {
        await expect(
            readWithFallback('none', async () => { throw new Error('boom'); }, () => false),
        ).rejects.toThrow('boom');
    });
});

describe('stableHash', () => {
    it('is stable for equal inputs and differs for unequal', () => {
        expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ a: 1, b: 2 }));
        expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
    });
    it('returns a short string', () => {
        expect(typeof stableHash('x')).toBe('string');
        expect(stableHash('x').length).toBeLessThanOrEqual(12);
    });
});
