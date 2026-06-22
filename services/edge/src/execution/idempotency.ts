/**
 * Idempotency Service (Automations A7)
 *
 * Ensures the same workflow execution is not processed twice. Uses the cache
 * provider as a short-TTL key store. Important for retryable webhook deliveries,
 * at-least-once queue triggers, and manual retries.
 *
 * No limits configured / cache unavailable ⇒ degrades to "not seen" (no-op),
 * so this never blocks a first execution.
 */

import { cacheProvider } from '../cache/index.js';

const IDEM_CACHE_KEY = (key: string) => `wf:idempotency:${key}`;
const DEFAULT_TTL = 86400; // 24 hours

export interface IdempotencyResult {
    seen: boolean;
    executionId?: string;
    seenAt?: string;
}

/**
 * Check whether an idempotency key has been seen before.
 */
export async function checkIdempotency(
    key: string,
    _ttl: number = DEFAULT_TTL,
): Promise<IdempotencyResult> {
    try {
        const cached = await cacheProvider.get<string>(IDEM_CACHE_KEY(key));
        if (!cached) return { seen: false };

        const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
        return {
            seen: true,
            executionId: parsed?.executionId,
            seenAt: parsed?.seenAt,
        };
    } catch (error) {
        console.error('[Idempotency] Check failed:', error);
        return { seen: false };
    }
}

/**
 * Mark an idempotency key as seen.
 */
export async function markIdempotency(
    key: string,
    executionId: string,
    ttl: number = DEFAULT_TTL,
): Promise<void> {
    try {
        await cacheProvider.setex(
            IDEM_CACHE_KEY(key),
            ttl,
            JSON.stringify({ executionId, seenAt: new Date().toISOString() }),
        );
    } catch (error) {
        console.error('[Idempotency] Mark failed:', error);
    }
}

/**
 * Generate a deterministic idempotency key from trigger data.
 */
export function generateIdempotencyKey(
    workflowId: string,
    triggerType: string,
    triggerPayload: Record<string, any>,
): string {
    const parts = [workflowId, triggerType];

    if (triggerType === 'webhook' || triggerType === 'http_webhook') {
        parts.push(triggerPayload.eventId || triggerPayload.id || '');
    } else if (triggerType === 'data_change') {
        parts.push(triggerPayload.operation || '');
        parts.push(JSON.stringify(triggerPayload.changes || []));
    } else if (triggerType === 'scheduled' || triggerType === 'schedule') {
        parts.push(triggerPayload.timestamp || triggerPayload.scheduledTime || '');
    } else if (triggerType === 'queue' || triggerType === 'queue_trigger') {
        parts.push(triggerPayload.messageId || triggerPayload.id || '');
    }

    return parts.join(':').replace(/[^a-zA-Z0-9:-]/g, '_');
}

/**
 * Clear an idempotency key (for testing / manual reset).
 */
export async function clearIdempotency(key: string): Promise<void> {
    try {
        await cacheProvider.del(IDEM_CACHE_KEY(key));
    } catch (error) {
        console.error('[Idempotency] Clear failed:', error);
    }
}
