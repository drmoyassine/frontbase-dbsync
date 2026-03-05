/**
 * Concurrency Limiter Tests
 *
 * Tests the Redis INCR/DECR semaphore for workflow concurrency limits.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cacheProvider before importing
const mockIncr = vi.fn();
const mockDecr = vi.fn();
const mockExpire = vi.fn();

vi.mock('../cache/index.js', () => ({
    cacheProvider: {
        incr: (...args: any[]) => mockIncr(...args),
        decr: (...args: any[]) => mockDecr(...args),
        expire: (...args: any[]) => mockExpire(...args),
    },
}));

import { acquireConcurrency, releaseConcurrency } from '../engine/concurrency.js';

describe('acquireConcurrency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIncr.mockResolvedValue(1);
        mockDecr.mockResolvedValue(0);
        mockExpire.mockResolvedValue(1);
    });

    it('allows execution when under limit', async () => {
        mockIncr.mockResolvedValue(1);
        const result = await acquireConcurrency('wf-1', 3);
        expect(result).toBe(true);
        expect(mockIncr).toHaveBeenCalledWith('wf:wf-1:concurrency');
    });

    it('allows execution at exactly the limit', async () => {
        mockIncr.mockResolvedValue(3);
        const result = await acquireConcurrency('wf-1', 3);
        expect(result).toBe(true);
    });

    it('rejects execution over limit and calls decr', async () => {
        mockIncr.mockResolvedValue(4);
        const result = await acquireConcurrency('wf-1', 3);
        expect(result).toBe(false);
        expect(mockDecr).toHaveBeenCalledWith('wf:wf-1:concurrency');
    });

    it('sets TTL on first increment', async () => {
        mockIncr.mockResolvedValue(1);
        await acquireConcurrency('wf-1', 5);
        expect(mockExpire).toHaveBeenCalledWith('wf:wf-1:concurrency', 300);
    });

    it('does not set TTL on subsequent increments', async () => {
        mockIncr.mockResolvedValue(2);
        await acquireConcurrency('wf-1', 5);
        expect(mockExpire).not.toHaveBeenCalled();
    });

    it('allows all executions when limit is 0 (unlimited)', async () => {
        const result = await acquireConcurrency('wf-1', 0);
        expect(result).toBe(true);
        expect(mockIncr).not.toHaveBeenCalled();
    });

    it('gracefully allows execution when Redis is unavailable', async () => {
        mockIncr.mockRejectedValue(new Error('Redis connection refused'));
        const result = await acquireConcurrency('wf-1', 3);
        expect(result).toBe(true);
    });
});

describe('releaseConcurrency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDecr.mockResolvedValue(0);
    });

    it('decrements the concurrency counter', async () => {
        await releaseConcurrency('wf-1');
        expect(mockDecr).toHaveBeenCalledWith('wf:wf-1:concurrency');
    });

    it('does not throw when Redis is unavailable', async () => {
        mockDecr.mockRejectedValue(new Error('Redis connection refused'));
        // Should not throw
        await expect(releaseConcurrency('wf-1')).resolves.toBeUndefined();
    });
});
