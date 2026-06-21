/**
 * Execution Guards (Phase 3)
 *
 * Reusable rate-limit / cooldown / debounce / concurrency checks extracted
 * from routes/execute.ts so both the manual execute route and the trigger
 * tick handler enforce identical per-workflow settings.
 *
 * Usage:
 *   const guard = await acquireExecutionGuards(workflowId, settings);
 *   if (!guard.allowed) return guard.errorResponse;
 *   try { ... } finally { guard.release(); }
 */

import { rateLimit } from '../cache/redis.js';
import { acquireConcurrency, releaseConcurrency } from './concurrency.js';
import { cacheProvider } from '../cache/index.js';
import type { WorkflowSettings } from './runtime.js';

export interface GuardDecision {
    allowed: boolean;
    /** HTTP status to return when blocked. */
    status?: number;
    /** Error body when blocked. */
    body?: { error: string; message: string };
    /** Release concurrency when done (no-op if concurrency disabled). */
    release: () => void;
}

/**
 * Evaluate + acquire all guards for a workflow execution.
 * Applies: cooldown set, debounce check, rate limit, concurrency acquire.
 * On any block, returns `allowed:false` with a 429 body and a no-op release.
 */
export async function acquireExecutionGuards(
    workflowId: string,
    settings: WorkflowSettings,
    opts: { rateLimitAlwaysOn?: boolean } = {}
): Promise<GuardDecision> {
    const noop = () => {};
    const blocked = (error: string, message: string): GuardDecision => ({
        allowed: false, status: 429, body: { error, message }, release: noop,
    });

    const rateLimitMax = settings.rate_limit_max || 60;
    const cooldownMs = settings.cooldown_ms || 0;
    const debounceSec = Math.ceil((settings.debounce_ms || 0) / 1000);
    const concurrencyLimit = settings.concurrency_limit || 0;
    const timeoutMs = settings.execution_timeout_ms || 30000;

    // Cooldown
    if (cooldownMs > 0) {
        try {
            const existing = await cacheProvider.get<string>(`wf:${workflowId}:cooldown`);
            if (existing) {
                return blocked('CoolDown', `Workflow ${workflowId} is cooling down. Try again later.`);
            }
            const timeoutSec = Math.ceil(timeoutMs / 1000);
            await cacheProvider.setex(`wf:${workflowId}:cooldown`, timeoutSec, 'running');
        } catch {
            // Redis unavailable — skip cooldown
        }
    }

    // Debounce
    if (debounceSec > 0) {
        try {
            const { shouldDebounce } = await import('./debounce.js');
            if (await shouldDebounce(workflowId, debounceSec)) {
                return blocked('Debounced', `Workflow ${workflowId} was triggered too recently.`);
            }
        } catch {
            // ignore debounce errors
        }
    }

    // Rate limit (always on when explicitly requested — e.g. public/tick paths)
    if (opts.rateLimitAlwaysOn || settings.rate_limit_enabled !== false) {
        try {
            const { allowed, remaining } = await rateLimit(
                `wf:${workflowId}:rate:${Math.floor(Date.now() / 60000)}`,
                rateLimitMax,
                60
            );
            if (!allowed) {
                return blocked('RateLimited', `Workflow ${workflowId} rate limit exceeded (${rateLimitMax}/min).`);
            }
            void remaining;
        } catch {
            // Redis unavailable — allow
        }
    }

    // Concurrency
    if (concurrencyLimit > 0) {
        try {
            const acquired = await acquireConcurrency(workflowId, concurrencyLimit);
            if (!acquired) {
                return blocked('ConcurrencyLimitExceeded', `Workflow ${workflowId} reached its concurrency limit.`);
            }
            return { allowed: true, release: () => releaseConcurrency(workflowId) };
        } catch {
            // Redis unavailable — allow
        }
    }

    return { allowed: true, release: noop };
}

/** Whether any scheduler backend is configured (QStash or BullMQ). */
export function isSchedulerConfigured(): boolean {
    return !!(process.env.QSTASH_TOKEN || process.env.BULLMQ_REDIS_URL);
}
