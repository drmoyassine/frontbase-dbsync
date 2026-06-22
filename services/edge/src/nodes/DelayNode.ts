/**
 * Delay / Wait Node (Automations A4)
 *
 * Pauses workflow execution for a configurable duration.
 *
 * Two modes:
 *   - Inline (delayMs <= MAX_INLINE_DELAY): the node blocks with setTimeout for
 *     the duration. Safe within the edge request timeout window. This is the
 *     common case (seconds-level waits).
 *   - Deferred (delayMs > MAX_INLINE_DELAY): records durable state in the cache
 *     and enqueues a resume job via the queue service, returning a `waiting`
 *     marker. Full cross-restart resume is wired through the queue tick handler;
 *     the workflow continues from its checkpoint once the resume fires.
 *
 * Node inputs:
 *   - delayMs:     number   (milliseconds)
 *   - delayUnit:   'ms' | 's' | 'm' | 'h'  (alternative to delayMs)
 *   - delayValue:  number   (used with delayUnit)
 */

import { cacheProvider } from '../cache/index.js';
import { queueServiceReady } from '../services/queue/index.js';

const DELAY_STATE_KEY = (executionId: string) => `exec:${executionId}:delay`;
const DELAY_TTL_SEC = 3600; // 1 hour
// Inline waits are capped well under the 29s edge timeout to leave room for
// the rest of the workflow. Longer waits defer to the queue.
export const MAX_INLINE_DELAY = 25000;
export const MAX_DELAY = 7 * 24 * 3600 * 1000; // 7 days cap

export interface DelayNodeResult {
    waited: boolean;
    deferred?: boolean;
    delayedMs: number;
    resumeAt?: string;
}

interface DelayState {
    resumeAt: number;
    nodeId: string;
    delayMs: number;
    executionId: string;
    workflowId: string;
}

/** Resolve the delay duration (ms) from any supported input shape. */
export function calculateDelayMs(inputs: Record<string, any>): number {
    if (inputs.delayMs !== undefined) {
        const ms = Number(inputs.delayMs);
        if (!Number.isFinite(ms) || ms < 0) throw new Error(`Invalid delayMs: ${inputs.delayMs}`);
        return Math.min(ms, MAX_DELAY);
    }
    if (inputs.delayUnit !== undefined && inputs.delayValue !== undefined) {
        const value = Number(inputs.delayValue);
        if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid delayValue: ${inputs.delayValue}`);
        const multipliers: Record<string, number> = {
            ms: 1, millisecond: 1, milliseconds: 1,
            s: 1000, sec: 1000, second: 1000, seconds: 1000,
            m: 60_000, min: 60_000, minute: 60_000, minutes: 60_000,
            h: 3_600_000, hour: 3_600_000, hours: 3_600_000,
        };
        const mult = multipliers[String(inputs.delayUnit).toLowerCase()];
        if (!mult) throw new Error(`Unknown delay unit: ${inputs.delayUnit}`);
        return Math.min(value * mult, MAX_DELAY);
    }
    return 1000; // default 1s
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a delay node. Returns once the wait has elapsed (inline) or once a
 * deferred resume has been scheduled.
 */
export async function executeDelayNode(inputs: Record<string, any>): Promise<DelayNodeResult> {
    const delayMs = calculateDelayMs(inputs);
    const executionId = inputs._executionId as string | undefined;
    const workflowId = inputs._workflowId as string | undefined;
    const nodeId = inputs._nodeId as string | undefined;

    // Inline wait — the common case.
    if (delayMs <= MAX_INLINE_DELAY) {
        await sleep(delayMs);
        return { waited: true, delayedMs: delayMs };
    }

    // Deferred wait — record durable state + schedule a resume.
    if (!executionId) {
        // No execution context (e.g. ad-hoc call) — cannot defer safely and
        // blocking for the full cap is unacceptable. Report deferred without
        // actually waiting so callers can handle it explicitly.
        return { waited: false, deferred: true, delayedMs: delayMs };
    }

    const resumeAt = Date.now() + delayMs;
    const state: DelayState = {
        resumeAt,
        nodeId: nodeId || 'unknown',
        delayMs,
        executionId,
        workflowId: workflowId || 'unknown',
    };
    try {
        await cacheProvider.setex(DELAY_STATE_KEY(executionId), DELAY_TTL_SEC, JSON.stringify(state));
    } catch (error) {
        console.error('[DelayNode] Failed to save durable state:', error);
    }

    try {
        const queue = await queueServiceReady;
        await queue.enqueue(`wf:resume:${executionId}`, { executionId, nodeId: state.nodeId, workflowId }, { delay: delayMs });
    } catch (error) {
        console.error('[DelayNode] Failed to enqueue resume job:', error);
    }

    return {
        waited: false,
        deferred: true,
        delayedMs: delayMs,
        resumeAt: new Date(resumeAt).toISOString(),
    };
}

/**
 * Manually resume a deferred execution (admin / manual retry).
 */
export async function resumeDelayedExecution(executionId: string): Promise<boolean> {
    const key = DELAY_STATE_KEY(executionId);
    let state: DelayState | null = null;
    try {
        const raw = await cacheProvider.get<string>(key);
        if (!raw) return false;
        state = typeof raw === 'string' ? (JSON.parse(raw) as DelayState) : (raw as DelayState);
    } catch {
        return false;
    }

    try {
        await cacheProvider.del(key);
        const queue = await queueServiceReady;
        await queue.enqueue(
            `wf:resume:${executionId}`,
            { executionId, nodeId: state.nodeId, workflowId: state.workflowId },
            { delay: 0 },
        );
        return true;
    } catch (error) {
        console.error('[DelayNode] Resume failed:', error);
        return false;
    }
}
