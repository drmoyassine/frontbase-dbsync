/**
 * Debounce Tests
 *
 * Tests the Redis SET NX EX debounce mechanism for workflow executions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSetex = vi.fn();

vi.mock('../cache/index.js', () => ({
    cacheProvider: {
        get: (...args: any[]) => mockGet(...args),
        setex: (...args: any[]) => mockSetex(...args),
    },
}));

import { shouldDebounce } from '../engine/debounce.js';

describe('shouldDebounce', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue(null);
        mockSetex.mockResolvedValue('OK');
    });

    it('returns false when windowSeconds is 0 (disabled)', async () => {
        const result = await shouldDebounce('wf-1', 0);
        expect(result).toBe(false);
        expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns false when windowSeconds is negative', async () => {
        const result = await shouldDebounce('wf-1', -1);
        expect(result).toBe(false);
    });

    it('returns true when lock exists (debounced)', async () => {
        mockGet.mockResolvedValue('1');
        const result = await shouldDebounce('wf-1', 5);
        expect(result).toBe(true);
        expect(mockGet).toHaveBeenCalledWith('wf:wf-1:debounce');
    });

    it('returns false and sets lock when no existing lock', async () => {
        mockGet.mockResolvedValue(null);
        const result = await shouldDebounce('wf-1', 5);
        expect(result).toBe(false);
        expect(mockSetex).toHaveBeenCalledWith('wf:wf-1:debounce', 5, '1');
    });

    it('does not debounce when Redis is unavailable (graceful fallback)', async () => {
        mockGet.mockRejectedValue(new Error('Redis connection refused'));
        const result = await shouldDebounce('wf-1', 5);
        expect(result).toBe(false);
    });
});
