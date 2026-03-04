/**
 * Workflow Debouncing
 * 
 * Prevents duplicate workflow executions within a configurable time window.
 * Uses Redis SET NX EX semantics: set-if-not-exists with TTL.
 * 
 * Key format: wf:{workflowId}:debounce
 * 
 * Graceful fallback: if Redis is unavailable, debouncing is skipped
 * (all executions are allowed).
 */

import { cacheProvider } from '../cache/index.js';

/**
 * Check if a workflow execution should be debounced.
 * 
 * @param workflowId - The workflow being triggered
 * @param windowSeconds - Debounce window in seconds (0 = disabled)
 * @returns true if the execution should be SKIPPED (debounced)
 */
export async function shouldDebounce(
    workflowId: string,
    windowSeconds: number = 0
): Promise<boolean> {
    // Debouncing disabled
    if (windowSeconds <= 0) return false;

    try {
        const key = `wf:${workflowId}:debounce`;
        // Try to read existing lock
        const existing = await cacheProvider.get<string>(key);
        if (existing) {
            // Lock exists — debounce this execution
            return true;
        }
        // Set lock with TTL (best-effort NX via check-then-set)
        await cacheProvider.setex(key, windowSeconds, '1');
        return false;
    } catch {
        // Redis unavailable — don't debounce
        return false;
    }
}
