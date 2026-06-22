import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../cache/index.js', () => ({
    cacheProvider: {
        setex: vi.fn().mockResolvedValue('OK'),
        get: vi.fn().mockResolvedValue(null),
        del: vi.fn().mockResolvedValue(1),
    },
}));

vi.mock('../services/queue/index.js', () => ({
    queueServiceReady: Promise.resolve({ enqueue: vi.fn().mockResolvedValue('msg-1') }),
}));

import { executeDelayNode, calculateDelayMs, MAX_INLINE_DELAY } from '../nodes/DelayNode.js';

describe('Delay Node', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('calculateDelayMs', () => {
        it('returns delayMs directly when provided', () => {
            expect(calculateDelayMs({ delayMs: 5000 })).toBe(5000);
        });

        it('handles seconds', () => {
            expect(calculateDelayMs({ delayUnit: 's', delayValue: 5 })).toBe(5000);
            expect(calculateDelayMs({ delayUnit: 'second', delayValue: 1 })).toBe(1000);
        });

        it('handles minutes', () => {
            expect(calculateDelayMs({ delayUnit: 'm', delayValue: 2 })).toBe(120000);
            expect(calculateDelayMs({ delayUnit: 'minutes', delayValue: 30 })).toBe(1800000);
        });

        it('handles hours', () => {
            expect(calculateDelayMs({ delayUnit: 'h', delayValue: 1 })).toBe(3600000);
        });

        it('throws on invalid delayMs', () => {
            expect(() => calculateDelayMs({ delayMs: 'invalid' as any })).toThrow();
            expect(() => calculateDelayMs({ delayMs: -100 })).toThrow();
        });

        it('throws on unknown unit', () => {
            expect(() => calculateDelayMs({ delayUnit: 'week', delayValue: 1 })).toThrow();
        });

        it('caps delay at 7 days', () => {
            expect(calculateDelayMs({ delayUnit: 'h', delayValue: 200 })).toBe(7 * 24 * 3600 * 1000);
        });

        it('defaults to 1 second when nothing is specified', () => {
            expect(calculateDelayMs({})).toBe(1000);
        });
    });

    describe('executeDelayNode', () => {
        it('inline-waits when the delay is within the inline cap', async () => {
            const result = await executeDelayNode({
                _executionId: 'exec-1',
                _workflowId: 'wf-1',
                _nodeId: 'n-1',
                delayMs: 50,
            });

            expect(result.waited).toBe(true);
            expect(result.deferred).toBeUndefined();
            expect(result.delayedMs).toBe(50);
        });

        it('defers and records durable state when the delay exceeds the cap', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            const result = await executeDelayNode({
                _executionId: 'exec-2',
                _workflowId: 'wf-2',
                _nodeId: 'n-2',
                delayMs: MAX_INLINE_DELAY + 5000,
            });

            expect(result.waited).toBe(false);
            expect(result.deferred).toBe(true);
            expect(result.resumeAt).toBeDefined();
            expect(cacheProvider.setex).toHaveBeenCalled();
        });

        it('reports deferred without blocking when no execution context is present', async () => {
            const result = await executeDelayNode({ delayMs: MAX_INLINE_DELAY + 5000 });
            expect(result.waited).toBe(false);
            expect(result.deferred).toBe(true);
        });
    });
});
