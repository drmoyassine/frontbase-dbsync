import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../cache/index.js', () => ({
    cacheProvider: {
        get: vi.fn(),
        setex: vi.fn(),
        del: vi.fn(),
    },
}));

import {
    getSharedVariables,
    getSharedVariable,
    setSharedVariable,
    deleteSharedVariable,
    incrementSharedVariable,
    clearSharedVariables,
    setSharedVariables,
} from '../execution/sharedVars.js';

describe('Shared Variables Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getSharedVariables', () => {
        it('returns an empty object when nothing is stored', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(null);

            const result = await getSharedVariables('wf-123');
            expect(result).toEqual({});
        });

        it('returns existing variables', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(JSON.stringify({ counter: 5, name: 'test' }));

            const result = await getSharedVariables('wf-123');
            expect(result).toEqual({ counter: 5, name: 'test' });
        });

        it('handles cache errors gracefully', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockRejectedValue(new Error('Cache error'));
            expect(await getSharedVariables('wf-123')).toEqual({});
        });
    });

    describe('setSharedVariable', () => {
        it('sets a new variable', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(null);
            (cacheProvider.setex as any).mockResolvedValue('OK');

            await setSharedVariable('wf-123', 'counter', 10);

            expect(cacheProvider.setex).toHaveBeenCalledWith(
                'wf:shared:wf-123',
                3600,
                JSON.stringify({ counter: 10 }),
            );
        });

        it('merges with existing variables', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(JSON.stringify({ existing: 'value' }));
            (cacheProvider.setex as any).mockResolvedValue('OK');

            await setSharedVariable('wf-123', 'new', 'data');

            const callArgs = (cacheProvider.setex as any).mock.calls[0];
            expect(JSON.parse(callArgs[2])).toEqual({ existing: 'value', new: 'data' });
        });
    });

    describe('incrementSharedVariable', () => {
        it('increments an existing number', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(JSON.stringify({ counter: 5 }));
            (cacheProvider.setex as any).mockResolvedValue('OK');

            const result = await incrementSharedVariable('wf-123', 'counter', 3);
            expect(result).toBe(8);
        });

        it('starts from 0 for a new variable', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(null);
            (cacheProvider.setex as any).mockResolvedValue('OK');

            const result = await incrementSharedVariable('wf-123', 'counter', 1);
            expect(result).toBe(1);
        });

        it('supports a negative delta', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(JSON.stringify({ counter: 10 }));
            (cacheProvider.setex as any).mockResolvedValue('OK');

            const result = await incrementSharedVariable('wf-123', 'counter', -3);
            expect(result).toBe(7);
        });
    });

    describe('deleteSharedVariable', () => {
        it('removes a key', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(JSON.stringify({ a: 1, b: 2 }));
            (cacheProvider.setex as any).mockResolvedValue('OK');

            await deleteSharedVariable('wf-123', 'a');

            const callArgs = (cacheProvider.setex as any).mock.calls[0];
            expect(JSON.parse(callArgs[2])).toEqual({ b: 2 });
        });
    });

    describe('clearSharedVariables', () => {
        it('deletes all variables for a workflow', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.del as any).mockResolvedValue(1);

            await clearSharedVariables('wf-123');
            expect(cacheProvider.del).toHaveBeenCalledWith('wf:shared:wf-123');
        });
    });

    describe('setSharedVariables', () => {
        it('merges multiple variables', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(JSON.stringify({ old: 1 }));
            (cacheProvider.setex as any).mockResolvedValue('OK');

            await setSharedVariables('wf-123', { a: 1, b: 2 });

            const callArgs = (cacheProvider.setex as any).mock.calls[0];
            expect(JSON.parse(callArgs[2])).toEqual({ old: 1, a: 1, b: 2 });
        });
    });

    describe('getSharedVariable', () => {
        it('returns a single variable', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(JSON.stringify({ flag: true }));

            expect(await getSharedVariable('wf-123', 'flag')).toBe(true);
        });
    });
});
