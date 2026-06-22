import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../cache/index.js', () => ({
    cacheProvider: {
        get: vi.fn(),
        setex: vi.fn(),
        del: vi.fn(),
    },
}));

import {
    getNodeOutput,
    setNodeOutput,
    hashInputs,
    invalidateNodeCache,
    invalidateWorkflowCache,
    isCacheableNodeType,
    getDefaultTTL,
} from '../execution/nodeCache.js';

describe('Node Cache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('hashInputs', () => {
        it('generates a consistent hash for the same inputs', () => {
            expect(hashInputs({ a: 1, b: 2 })).toBe(hashInputs({ a: 1, b: 2 }));
        });

        it('is order-independent', () => {
            expect(hashInputs({ a: 1, b: 2 })).toBe(hashInputs({ b: 2, a: 1 }));
        });

        it('differs for different inputs', () => {
            expect(hashInputs({ a: 1, b: 2 })).not.toBe(hashInputs({ a: 1, b: 3 }));
        });

        it('handles nested objects and arrays', () => {
            const h1 = hashInputs({ data: { nested: { value: 1 } }, items: [1, 2, 3] });
            const h2 = hashInputs({ data: { nested: { value: 1 } }, items: [1, 2, 3] });
            expect(h1).toBe(h2);
        });
    });

    describe('getNodeOutput', () => {
        it('returns cached=true on a cache hit', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            // version lookups return null (version 0)
            (cacheProvider.get as any).mockImplementation((key: string) => {
                if (key.includes(':version:')) return Promise.resolve(null);
                return Promise.resolve(JSON.stringify({ result: 'cached' }));
            });

            const result = await getNodeOutput('node-1', { input: 'test' });
            expect(result.cached).toBe(true);
            expect(result.outputs).toEqual({ result: 'cached' });
        });

        it('returns cached=false on a cache miss', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(null);

            const result = await getNodeOutput('node-1', { input: 'test' });
            expect(result.cached).toBe(false);
        });

        it('handles cache errors gracefully', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockRejectedValue(new Error('Cache error'));

            const result = await getNodeOutput('node-1', { input: 'test' });
            expect(result.cached).toBe(false);
        });
    });

    describe('setNodeOutput', () => {
        it('stores output in the cache', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(null);
            (cacheProvider.setex as any).mockResolvedValue('OK');

            await setNodeOutput('node-1', { input: 'test' }, { result: 'success' });

            expect(cacheProvider.setex).toHaveBeenCalledWith(
                expect.stringContaining('wf:node:cache:node-1:'),
                300,
                JSON.stringify({ result: 'success' }),
            );
        });
    });

    describe('invalidateNodeCache', () => {
        it('bumps the node version counter', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue('2');
            (cacheProvider.setex as any).mockResolvedValue('OK');

            await invalidateNodeCache('node-1');

            expect(cacheProvider.setex).toHaveBeenCalledWith(
                'wf:node:cache:version:node-1',
                86400,
                '3',
            );
        });
    });

    describe('invalidateWorkflowCache', () => {
        it('bumps the workflow version counter', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue('0');
            (cacheProvider.setex as any).mockResolvedValue('OK');

            await invalidateWorkflowCache('wf-1');

            expect(cacheProvider.setex).toHaveBeenCalledWith(
                'wf:node:cache:wfversion:wf-1',
                86400,
                '1',
            );
        });
    });

    describe('isCacheableNodeType', () => {
        it('returns true for cacheable node types', () => {
            expect(isCacheableNodeType('data_request')).toBe(true);
            expect(isCacheableNodeType('http_request')).toBe(true);
            expect(isCacheableNodeType('transform')).toBe(true);
            expect(isCacheableNodeType('json_transform')).toBe(true);
        });

        it('returns false for non-cacheable node types', () => {
            expect(isCacheableNodeType('trigger')).toBe(false);
            expect(isCacheableNodeType('log')).toBe(false);
            expect(isCacheableNodeType('condition')).toBe(false);
        });
    });

    describe('getDefaultTTL', () => {
        it('returns the appropriate TTL per node type', () => {
            expect(getDefaultTTL('data_request')).toBe(60);
            expect(getDefaultTTL('http_request')).toBe(300);
            expect(getDefaultTTL('transform')).toBe(600);
        });

        it('returns the default TTL for unknown types', () => {
            expect(getDefaultTTL('unknown')).toBe(300);
        });
    });
});
