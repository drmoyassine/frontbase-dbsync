/**
 * Priority Queue Tests
 *
 * Tests the Redis sorted-set priority queue for workflow executions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockZadd = vi.fn();
const mockZpopmax = vi.fn();

vi.mock('../cache/index.js', () => ({
    cacheProvider: {
        zadd: (...args: any[]) => mockZadd(...args),
        zpopmax: (...args: any[]) => mockZpopmax(...args),
    },
}));

import { enqueuePriority, dequeuePriority, getPriorityScore } from '../engine/priority.js';

describe('enqueuePriority', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockZadd.mockResolvedValue(1);
    });

    it('enqueues with high priority (score=3)', async () => {
        await enqueuePriority('wf:priority:engine-1', '{"id":"exec-1"}', 'high');
        expect(mockZadd).toHaveBeenCalledWith('wf:priority:engine-1', 3, '{"id":"exec-1"}');
    });

    it('enqueues with normal priority (score=2)', async () => {
        await enqueuePriority('wf:priority:engine-1', '{"id":"exec-1"}', 'normal');
        expect(mockZadd).toHaveBeenCalledWith('wf:priority:engine-1', 2, '{"id":"exec-1"}');
    });

    it('enqueues with low priority (score=1)', async () => {
        await enqueuePriority('wf:priority:engine-1', '{"id":"exec-1"}', 'low');
        expect(mockZadd).toHaveBeenCalledWith('wf:priority:engine-1', 1, '{"id":"exec-1"}');
    });

    it('defaults to normal priority', async () => {
        await enqueuePriority('wf:priority:engine-1', '{"id":"exec-1"}');
        expect(mockZadd).toHaveBeenCalledWith('wf:priority:engine-1', 2, '{"id":"exec-1"}');
    });

    it('does not throw when Redis is unavailable', async () => {
        mockZadd.mockRejectedValue(new Error('Redis down'));
        await expect(enqueuePriority('key', 'payload', 'high')).resolves.toBeUndefined();
    });
});

describe('dequeuePriority', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns parsed payload from zpopmax', async () => {
        mockZpopmax.mockResolvedValue({ member: '{"id":"exec-1","data":"test"}', score: 3 });
        const result = await dequeuePriority('wf:priority:engine-1');
        expect(result).toEqual({ id: 'exec-1', data: 'test' });
    });

    it('returns null when queue is empty', async () => {
        mockZpopmax.mockResolvedValue(null);
        const result = await dequeuePriority('wf:priority:engine-1');
        expect(result).toBeNull();
    });

    it('returns null when Redis is unavailable', async () => {
        mockZpopmax.mockRejectedValue(new Error('Redis down'));
        const result = await dequeuePriority('wf:priority:engine-1');
        expect(result).toBeNull();
    });
});

describe('getPriorityScore', () => {
    it('returns 3 for high', () => expect(getPriorityScore('high')).toBe(3));
    it('returns 2 for normal', () => expect(getPriorityScore('normal')).toBe(2));
    it('returns 1 for low', () => expect(getPriorityScore('low')).toBe(1));
    it('returns 2 (normal) for unknown level', () => expect(getPriorityScore('unknown')).toBe(2));
});
