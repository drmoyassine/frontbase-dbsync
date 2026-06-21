/**
 * Public Execute Route — Sprint 4 (Model C, last step)
 *
 *   POST /api/public/execute/:id
 *
 * Lets the hydrated browser client fire a `ui_event_trigger` workflow without
 * a system key. Security gate: ONLY workflows whose triggerType includes
 * `ui_event` are reachable here — every other trigger type (manual, webhook,
 * scheduled, data_change) stays behind systemKeyAuth on /api/execute.
 *
 * Reuses the same primitives as the authenticated execute route
 * (rate limit, cooldown, debounce, concurrency) so per-workflow settings are
 * honored identically. Tenant-scoped via tenantMiddleware.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { v4 as uuidv4 } from 'uuid';
import { stateProvider } from '../storage/index.js';
import { ExecuteRequestSchema, ExecuteResponseSchema, ErrorResponseSchema } from '../schemas/index.js';
import { executeWorkflow, type WorkflowSettings } from '../engine/runtime.js';
import { rateLimit } from '../cache/redis.js';
import { acquireConcurrency, releaseConcurrency } from '../engine/concurrency.js';
import { cacheProvider } from '../cache/index.js';

const publicExecuteRoute = new OpenAPIHono();

const route = createRoute({
    method: 'post',
    path: '/:id',
    tags: ['UI Events'],
    summary: 'Publicly execute a ui_event workflow from the browser',
    description:
        'Executes a published workflow by ID without authentication. Only workflows with a ' +
        '`ui_event` trigger type are reachable; all others return 403. Subject to the workflow\'s ' +
        'rate-limit / cooldown / debounce / concurrency settings.',
    request: {
        params: z.object({
            id: z.string().uuid().openapi({ description: 'Workflow ID' }),
        }),
        body: {
            content: {
                'application/json': {
                    schema: ExecuteRequestSchema,
                },
            },
            required: false,
        },
    },
    responses: {
        200: {
            description: 'Execution result',
            content: { 'application/json': { schema: ExecuteResponseSchema } },
        },
        403: {
            description: 'Workflow is not publicly executable (not a ui_event trigger)',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        404: {
            description: 'Workflow not found / inactive',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
        429: {
            description: 'Rate limited / cooldown / concurrency',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});

function isUIEventWorkflow(triggerType: string): boolean {
    return triggerType
        .split(',')
        .map(t => t.trim().toLowerCase())
        .includes('ui_event');
}

publicExecuteRoute.openapi(route, async (c) => {
    const { id } = c.req.valid('param');
    const rawBody = await c.req.text();
    const body = rawBody ? JSON.parse(rawBody) : {};

    const tenantSlug = (c.env as any)?.FRONTBASE_TENANT_SLUG
        || (c.get as any)('tenantSlug')
        || c.req.query('tenant_slug')
        || undefined;

    const workflow = await stateProvider.getWorkflowById(id, tenantSlug);

    if (!workflow) {
        return c.json({ error: 'NotFound', message: `Workflow ${id} not found` }, 404);
    }
    if (!workflow.isActive) {
        return c.json({ error: 'WorkflowInactive', message: `Workflow ${id} is not active` }, 404);
    }

    // ── Security gate: only ui_event workflows are publicly executable ──
    if (!isUIEventWorkflow(workflow.triggerType)) {
        return c.json({
            error: 'Forbidden',
            message: `Workflow ${id} is not publicly executable (ui_event triggers only)`,
        }, 403);
    }

    // ── Per-workflow settings ──────────────────────────────────────────
    const settings: WorkflowSettings = workflow.settings ? JSON.parse(workflow.settings) : {};
    const rateLimitMax = settings.rate_limit_max || 60;
    const cooldownMs = settings.cooldown_ms || 0;
    const debounceSec = Math.ceil((settings.debounce_ms || 0) / 1000);
    const concurrencyLimit = settings.concurrency_limit || 0;

    // ── Cooldown ───────────────────────────────────────────────────────
    if (cooldownMs > 0) {
        try {
            const existing = await cacheProvider.get<string>(`wf:${id}:cooldown`);
            if (existing) {
                return c.json({ error: 'CoolDown', message: `Workflow ${id} is cooling down.` }, 429);
            }
            const timeoutSec = Math.ceil((settings.execution_timeout_ms || 30000) / 1000);
            await cacheProvider.setex(`wf:${id}:cooldown`, timeoutSec, 'running');
        } catch {
            // Redis unavailable — skip cooldown
        }
    }

    // ── Debounce ───────────────────────────────────────────────────────
    if (debounceSec > 0) {
        const { shouldDebounce } = await import('../engine/debounce.js');
        if (await shouldDebounce(id, debounceSec)) {
            return c.json({
                error: 'Debounced',
                message: `Workflow ${id} was triggered too recently`,
            }, 429);
        }
    }

    // ── Rate limiting (always on for the public path) ──────────────────
    try {
        const { allowed, remaining } = await rateLimit(
            `wf:${id}:public-rate:${Math.floor(Date.now() / 60000)}`,
            rateLimitMax,
            60
        );
        if (!allowed) {
            return c.json({
                error: 'RateLimited',
                message: `Workflow ${id} rate limit exceeded (${rateLimitMax}/min).`,
            }, 429);
        }
        c.header('X-RateLimit-Remaining', String(remaining));
    } catch {
        // Redis unavailable — allow execution
    }

    // ── Concurrency ────────────────────────────────────────────────────
    if (concurrencyLimit > 0) {
        const acquired = await acquireConcurrency(id, concurrencyLimit);
        if (!acquired) {
            return c.json({
                error: 'ConcurrencyLimitExceeded',
                message: `Workflow ${id} has reached its concurrency limit`,
            }, 429);
        }
    }

    const executionId = uuidv4();
    const now = new Date().toISOString();

    await stateProvider.createExecution({
        id: executionId,
        workflowId: id,
        status: 'started',
        triggerType: 'ui_event',
        triggerPayload: JSON.stringify(body.parameters || {}),
        nodeExecutions: JSON.stringify([]),
        startedAt: now,
    });

    try {
        const result = await executeWorkflow(executionId, workflow, body.parameters || {}, settings);

        return c.json({
            executionId,
            status: result.status === 'completed' ? 'completed' as const : 'error' as const,
            result: result.result,
            variableMutations: result.variableMutations || [],
            error: result.error,
            message: result.status === 'completed' ? 'Workflow execution completed' : 'Workflow execution failed',
        }, 200);
    } catch (err: any) {
        console.error(`[public-execute] ${executionId} failed:`, err);
        return c.json({
            executionId,
            status: 'error' as const,
            error: err.message,
            message: 'Workflow execution failed',
        }, 200);
    } finally {
        if (concurrencyLimit > 0) releaseConcurrency(id);
    }
});

export { publicExecuteRoute };
