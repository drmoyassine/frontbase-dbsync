/**
 * Workflow Concurrency Limiter
 *
 * Redis-based semaphore using INCR/DECR with TTL safety net.
 * Prevents more than N simultaneous executions of a workflow.
 *
 * Key format: wf:{workflowId}:concurrency
 *
 * Graceful fallback: if Redis is unavailable, concurrency is not enforced
 * (all executions are allowed).
 */

import { cacheProvider } from '../cache/index.js';

/**
 * Acquire a concurrency slot for a workflow.
 *
 * @param workflowId - The workflow being executed
 * @param limit - Maximum concurrent executions allowed (0 = unlimited)
 * @returns true if a slot was acquired (execution is allowed)
 */
export async function acquireConcurrency(
    workflowId: string,
    limit: number
): Promise<boolean> {
    if (limit <= 0) return true; // Unlimited

    try {
        const key = `wf:${workflowId}:concurrency`;
        const current = await cacheProvider.incr(key);

        // Set TTL on first increment (safety net — ensures key expires if release fails)
        if (current === 1) {
            await cacheProvider.expire(key, 300); // 5 min max
        }

        if (current > limit) {
            // Over limit — release immediately and reject
            await cacheProvider.decr(key);
            return false;
        }

        return true;
    } catch {
        // Redis unavailable — allow execution
        return true;
    }
}

/**
 * Release a concurrency slot after execution completes.
 * Always call this in a finally block.
 *
 * @param workflowId - The workflow that finished executing
 */
export async function releaseConcurrency(workflowId: string): Promise<void> {
    try {
        const key = `wf:${workflowId}:concurrency`;
        await cacheProvider.decr(key);
    } catch {
        // Best-effort — TTL safety net will clean up
    }
}
