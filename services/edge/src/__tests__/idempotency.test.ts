import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../cache/index.js', () => ({
    cacheProvider: {
        get: vi.fn(),
        setex: vi.fn(),
        del: vi.fn(),
    },
}));

import {
    checkIdempotency,
    markIdempotency,
    generateIdempotencyKey,
    clearIdempotency,
} from '../execution/idempotency.js';

describe('Idempotency Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('checkIdempotency', () => {
        it('returns unseen for a new key', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(null);

            const result = await checkIdempotency('test-key');

            expect(result.seen).toBe(false);
            expect(result.executionId).toBeUndefined();
        });

        it('returns seen for an existing key', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockResolvedValue(
                JSON.stringify({ executionId: 'exec-123', seenAt: '2024-01-01T00:00:00Z' }),
            );

            const result = await checkIdempotency('test-key');

            expect(result.seen).toBe(true);
            expect(result.executionId).toBe('exec-123');
            expect(result.seenAt).toBe('2024-01-01T00:00:00Z');
        });

        it('handles cache errors gracefully', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.get as any).mockRejectedValue(new Error('Cache error'));

            const result = await checkIdempotency('test-key');

            expect(result.seen).toBe(false);
        });
    });

    describe('markIdempotency', () => {
        it('stores an idempotency record', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.setex as any).mockResolvedValue('OK');

            await markIdempotency('test-key', 'exec-123');

            expect(cacheProvider.setex).toHaveBeenCalledWith(
                'wf:idempotency:test-key',
                86400,
                expect.stringContaining('"executionId":"exec-123"'),
            );
        });

        it('handles cache errors gracefully', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.setex as any).mockRejectedValue(new Error('Cache error'));

            await expect(markIdempotency('test-key', 'exec-123')).resolves.toBeUndefined();
        });
    });

    describe('generateIdempotencyKey', () => {
        it('generates a key for webhook triggers', () => {
            const key = generateIdempotencyKey('wf-123', 'webhook', { eventId: 'evt-456' });
            expect(key).toContain('wf-123:webhook:evt-456');
        });

        it('generates a key for data_change triggers', () => {
            const key = generateIdempotencyKey('wf-123', 'data_change', {
                operation: 'INSERT',
                changes: [{ id: 1 }],
            });
            expect(key).toContain('wf-123:data_change:INSERT');
        });

        it('generates a key for scheduled triggers', () => {
            const key = generateIdempotencyKey('wf-123', 'scheduled', {
                timestamp: '2024-01-01T00:00:00Z',
            });
            expect(key).toContain('wf-123:scheduled:2024-01-01T00:00:00Z');
        });

        it('sanitizes special characters', () => {
            const key = generateIdempotencyKey('wf-123', 'webhook', {
                eventId: 'evt/with:spaces and!',
            });
            expect(key).not.toContain('/');
            expect(key).not.toContain('!');
            expect(key).not.toContain(' ');
        });
    });

    describe('clearIdempotency', () => {
        it('deletes the idempotency record', async () => {
            const { cacheProvider } = await import('../cache/index.js');
            (cacheProvider.del as any).mockResolvedValue(1);

            await clearIdempotency('test-key');

            expect(cacheProvider.del).toHaveBeenCalledWith('wf:idempotency:test-key');
        });
    });
});
