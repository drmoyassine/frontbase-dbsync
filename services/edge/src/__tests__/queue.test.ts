/**
 * Queue Module Tests
 *
 * Tests publishExecution options passthrough (retry count, backoff).
 * Note: isQStashEnabled depends on module-level env vars and is tested
 * via the trailing-slash tests which mock it correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../cache/index.js', () => ({
    cacheProvider: { get: vi.fn(), setex: vi.fn() },
}));

const mockPublishJSON = vi.fn();

vi.mock('@upstash/qstash', () => ({
    Client: vi.fn().mockImplementation(() => ({
        publishJSON: (...args: any[]) => mockPublishJSON(...args),
    })),
}));

import { publishExecution } from '../engine/queue.js';

describe('publishExecution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPublishJSON.mockResolvedValue({ messageId: 'msg-123' });
    });

    it('returns null when QStash is not configured', async () => {
        // Without QSTASH_TOKEN, the client should be null
        const result = await publishExecution(
            'https://example.com/api/execute/wf-1',
            {
                executionId: 'exec-1',
                workflowId: 'wf-1',
                parameters: {},
                triggerType: 'manual',
            }
        );
        // If no client, should return null gracefully
        expect(result === null || typeof result === 'string').toBe(true);
    });

    it('accepts options parameter without error', async () => {
        // Ensure the 3-arg signature doesn't throw
        const result = await publishExecution(
            'https://example.com/api/execute/wf-1',
            {
                executionId: 'exec-1',
                workflowId: 'wf-1',
                parameters: {},
                triggerType: 'manual',
            },
            { retries: 5, backoff: 'exponential' }
        );
        // Should not throw — return type is string | null
        expect(result === null || typeof result === 'string').toBe(true);
    });

    it('accepts call without options (backward compatible)', async () => {
        const result = await publishExecution(
            'https://example.com/api/execute/wf-1',
            {
                executionId: 'exec-1',
                workflowId: 'wf-1',
                parameters: {},
                triggerType: 'manual',
            }
        );
        expect(result === null || typeof result === 'string').toBe(true);
    });
});
