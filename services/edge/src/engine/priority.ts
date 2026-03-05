/**
 * Priority Queue for Workflow Executions
 *
 * Redis sorted-set-based priority queue using ZADD/ZPOPMAX.
 * Higher priority = higher score = dequeued first.
 *
 * Scores: high=3, normal=2, low=1
 *
 * Key format: wf:priority:{engineId}
 *
 * Graceful fallback: if Redis is unavailable, returns null (caller
 * should fall through to direct execution).
 */

import { cacheProvider } from '../cache/index.js';

export type PriorityLevel = 'low' | 'normal' | 'high';

const PRIORITY_SCORES: Record<PriorityLevel, number> = {
    low: 1,
    normal: 2,
    high: 3,
};

/**
 * Enqueue an execution with priority.
 *
 * @param queueKey - Sorted set key (e.g. 'wf:priority:engine-123')
 * @param payload - JSON-stringified execution payload
 * @param priority - Execution priority level
 */
export async function enqueuePriority(
    queueKey: string,
    payload: string,
    priority: PriorityLevel = 'normal'
): Promise<void> {
    try {
        await cacheProvider.zadd(queueKey, PRIORITY_SCORES[priority], payload);
    } catch {
        // Redis unavailable — caller should fall through to direct execution
    }
}

/**
 * Dequeue the highest-priority execution.
 *
 * @param queueKey - Sorted set key
 * @returns Parsed payload or null if queue is empty / Redis unavailable
 */
export async function dequeuePriority<T = any>(
    queueKey: string
): Promise<T | null> {
    try {
        const result = await cacheProvider.zpopmax(queueKey);
        if (!result) return null;
        return JSON.parse(result.member) as T;
    } catch {
        return null;
    }
}

/**
 * Get the priority score for a level string.
 */
export function getPriorityScore(priority: PriorityLevel | string): number {
    return PRIORITY_SCORES[priority as PriorityLevel] ?? PRIORITY_SCORES.normal;
}
