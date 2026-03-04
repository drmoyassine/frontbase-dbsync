/**
 * Execute Route - Trigger workflow execution
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { stateProvider } from '../storage/index.js';
import { ExecuteRequestSchema, ExecuteResponseSchema, ErrorResponseSchema } from '../schemas';
import { v4 as uuidv4 } from 'uuid';
import { executeWorkflow, executeSingleNode } from '../engine/runtime';
import { rateLimit } from '../cache/redis.js';
import { verifyQueueSignature } from '../engine/queue.js';

const executeRoute = new OpenAPIHono();

const route = createRoute({
    method: 'post',
    path: '/:id',
    tags: ['Execution'],
    summary: 'Execute a workflow',
    description: 'Triggers execution of a published workflow by ID',
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
            description: 'Execution started',
            content: {
                'application/json': {
                    schema: ExecuteResponseSchema,
                },
            },
        },
        400: {
            description: 'Bad request (e.g., workflow inactive)',
            content: {
                'application/json': {
                    schema: ErrorResponseSchema,
                },
            },
        },
        404: {
            description: 'Workflow not found',
            content: {
                'application/json': {
                    schema: ErrorResponseSchema,
                },
            },
        },
        429: {
            description: 'Rate limited',
            content: {
                'application/json': {
                    schema: ErrorResponseSchema,
                },
            },
        },
        401: {
            description: 'Unauthorized (invalid QStash signature)',
            content: {
                'application/json': {
                    schema: ErrorResponseSchema,
                },
            },
        },

    },
});

executeRoute.openapi(route, async (c) => {
    const { id } = c.req.valid('param');
    const rawBody = await c.req.text();
    const body = rawBody ? JSON.parse(rawBody) : {};

    // ── QStash signature verification ───────────────────────────────
    // If the request has an Upstash-Signature header, it came from QStash
    // and must be verified before executing.
    const qstashSignature = c.req.header('Upstash-Signature');
    if (qstashSignature) {
        const valid = await verifyQueueSignature(qstashSignature, rawBody);
        if (!valid) {
            return c.json({
                error: 'Unauthorized',
                message: 'Invalid QStash signature',
            }, 401);
        }
    }

    // Fetch workflow via provider
    const workflow = await stateProvider.getWorkflowById(id);

    if (!workflow) {
        return c.json({
            error: 'NotFound',
            message: `Workflow ${id} not found`,
        }, 404);
    }

    if (!workflow.isActive) {
        return c.json({
            error: 'WorkflowInactive',
            message: `Workflow ${id} is not active`,
        }, 400);
    }

    // ── Parse per-workflow settings ─────────────────────────────────
    const settings = workflow.settings ? JSON.parse(workflow.settings) : {};
    const rateLimitEnabled = settings.rate_limit_enabled !== false; // default: true
    const rateLimitMax = settings.rate_limit_max || 60;
    const debounceSec = Math.ceil((settings.debounce_ms || 0) / 1000);

    // ── Debounce check ──────────────────────────────────────────────
    if (debounceSec > 0) {
        const { shouldDebounce } = await import('../engine/debounce.js');
        const debounced = await shouldDebounce(id, debounceSec);
        if (debounced) {
            return c.json({
                error: 'Debounced',
                message: `Workflow ${id} was triggered too recently (${settings.debounce_ms}ms window)`,
            }, 429);
        }
    }

    // ── Rate limiting ───────────────────────────────────────────────
    if (rateLimitEnabled) {
        try {
            const { allowed, remaining } = await rateLimit(
                `wf:${id}:rate:${Math.floor(Date.now() / 60000)}`,
                rateLimitMax,
                60
            );
            if (!allowed) {
                return c.json({
                    error: 'RateLimited',
                    message: `Workflow ${id} rate limit exceeded (${rateLimitMax}/min). Retry after 1 minute.`,
                }, 429);
            }
            c.header('X-RateLimit-Remaining', String(remaining));
        } catch {
            // Redis unavailable — allow execution
        }
    }

    // Create execution record via provider
    const executionId = uuidv4();
    const now = new Date().toISOString();

    await stateProvider.createExecution({
        id: executionId,
        workflowId: id,
        status: 'started',
        triggerType: 'manual',
        triggerPayload: JSON.stringify(body.parameters || {}),
        nodeExecutions: JSON.stringify([]),
        startedAt: now,
    });

    // Execute workflow asynchronously
    executeWorkflow(executionId, workflow, body.parameters || {})
        .catch(err => console.error(`Execution ${executionId} failed:`, err));

    return c.json({
        executionId,
        status: 'started' as const,
        message: 'Workflow execution started',
    }, 200);
});

// Single node execution route
const singleNodeRoute = createRoute({
    method: 'post',
    path: '/:id/node/:nodeId',
    tags: ['Execution'],
    summary: 'Execute a single node',
    description: 'Executes a single node (and its upstream dependencies) for testing',
    request: {
        params: z.object({
            id: z.string().uuid().openapi({ description: 'Workflow ID' }),
            nodeId: z.string().openapi({ description: 'Node ID to execute' }),
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
            description: 'Node execution started',
            content: {
                'application/json': {
                    schema: ExecuteResponseSchema,
                },
            },
        },
        404: {
            description: 'Workflow or node not found',
            content: {
                'application/json': {
                    schema: ErrorResponseSchema,
                },
            },
        },
    },
});

executeRoute.openapi(singleNodeRoute, async (c) => {
    const { id, nodeId } = c.req.valid('param');
    const body = await c.req.json().catch(() => ({}));

    // Fetch workflow via provider
    const workflow = await stateProvider.getWorkflowById(id);

    if (!workflow) {
        return c.json({
            error: 'NotFound',
            message: `Workflow ${id} not found`,
        }, 404);
    }

    // Create execution record via provider
    const executionId = uuidv4();
    const now = new Date().toISOString();

    await stateProvider.createExecution({
        id: executionId,
        workflowId: id,
        status: 'started',
        triggerType: 'node_test',
        triggerPayload: JSON.stringify({ nodeId, parameters: body.parameters || {} }),
        nodeExecutions: JSON.stringify([]),
        startedAt: now,
    });

    // Execute single node asynchronously
    executeSingleNode(executionId, workflow, nodeId, body.parameters || {})
        .catch(err => console.error(`Node execution ${executionId} failed:`, err));

    return c.json({
        executionId,
        status: 'started' as const,
        message: `Executing node ${nodeId}`,
    }, 200);
});

export { executeRoute };
