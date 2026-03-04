/**
 * Webhook Route - Handle external webhook triggers
 * 
 * Features:
 *   - Per-webhook authentication (header, basic, none)
 *   - Rate limiting (60/min per workflow, via Redis INCR)
 *   - Debouncing (configurable window, via Redis SET NX EX)
 *   - QStash durable execution (auto-retry on Worker failure)
 *   - Sync mode (http_response node) vs async fire-and-forget
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { stateProvider } from '../storage/index.js';
import { WebhookPayloadSchema, ExecuteResponseSchema, ErrorResponseSchema } from '../schemas';
import { v4 as uuidv4 } from 'uuid';
import { executeWorkflow } from '../engine/runtime';
import { rateLimit } from '../cache/redis.js';
import { shouldDebounce } from '../engine/debounce.js';
import { isQStashEnabled, publishExecution } from '../engine/qstash.js';

const webhookRoute = new OpenAPIHono();

const route = createRoute({
    method: 'post',
    path: '/:id',
    tags: ['Webhooks'],
    summary: 'Trigger workflow via webhook',
    description: 'External webhook endpoint to trigger workflow execution',
    request: {
        params: z.object({
            id: z.string().uuid().openapi({ description: 'Workflow ID' }),
        }),
        body: {
            content: {
                'application/json': {
                    schema: WebhookPayloadSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Webhook received and execution started',
            content: {
                'application/json': {
                    schema: ExecuteResponseSchema,
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
    },
});

webhookRoute.openapi(route, async (c) => {
    try {
        const { id } = c.req.valid('param');
        const payload = c.req.valid('json');

        // Fetch active workflow via provider
        const workflow = await stateProvider.getActiveWebhookWorkflow(id);

        if (!workflow) {
            return c.json({
                error: 'NotFound',
                message: `Active workflow ${id} not found`,
            }, 404);
        }

        // ── Per-webhook authentication ──────────────────────────────────
        const wfNodes = JSON.parse(workflow.nodes);
        const triggerNode = wfNodes.find((n: any) =>
            n.type === 'webhook_trigger' || n.data?.type === 'webhook_trigger'
        );
        if (triggerNode) {
            const inputs = triggerNode.data?.inputs || triggerNode.inputs || [];
            const getInput = (name: string) => {
                const inp = inputs.find((i: any) => i.name === name);
                return inp?.value;
            };
            const authMode = getInput('authentication') || 'none';

            if (authMode === 'header') {
                const expectedName = getInput('headerName') || 'X-API-Key';
                const expectedValue = getInput('headerValue');
                if (expectedValue) {
                    const actual = c.req.header(expectedName);
                    if (actual !== expectedValue) {
                        return c.json({
                            error: 'Unauthorized',
                            message: `Missing or invalid '${expectedName}' header`,
                        }, 401) as any;
                    }
                }
            } else if (authMode === 'basic') {
                const expectedUser = getInput('username') || '';
                const expectedPass = getInput('password') || '';
                const authHeader = c.req.header('Authorization');
                if (!authHeader || !authHeader.startsWith('Basic ')) {
                    c.header('WWW-Authenticate', 'Basic realm="Webhook"');
                    return c.json({
                        error: 'Unauthorized',
                        message: 'Basic authentication required',
                    }, 401) as any;
                }
                const decoded = atob(authHeader.slice(6));
                const [user, pass] = decoded.split(':');
                if (user !== expectedUser || pass !== expectedPass) {
                    return c.json({
                        error: 'Unauthorized',
                        message: 'Invalid credentials',
                    }, 401) as any;
                }
            }
            // authMode === 'none' → no validation needed
        }

        // ── Rate limiting (60 executions/minute per workflow) ────────────
        try {
            const { allowed, remaining } = await rateLimit(
                `wf:${id}:rate:${Math.floor(Date.now() / 60000)}`,
                60,
                60
            );
            if (!allowed) {
                return c.json({
                    error: 'RateLimited',
                    message: `Workflow ${id} rate limit exceeded (60/min). Retry after 1 minute.`,
                }, 429);
            }
            c.header('X-RateLimit-Remaining', String(remaining));
        } catch {
            // Redis unavailable — allow execution
        }

        // ── Debouncing (skip if triggered within window) ────────────────
        if (await shouldDebounce(id, 5)) {
            return c.json({
                executionId: null,
                status: 'debounced' as any,
                message: 'Execution skipped (debounced within 5s window)',
            }, 200);
        }

        // Create execution record via provider
        const executionId = uuidv4();
        const now = new Date().toISOString();

        await stateProvider.createExecution({
            id: executionId,
            workflowId: id,
            status: 'started',
            triggerType: 'http_webhook',
            triggerPayload: JSON.stringify(payload),
            nodeExecutions: JSON.stringify([]),
            startedAt: now,
        });

        // Check if workflow contains an http_response node (sync mode)
        const hasResponseNode = wfNodes.some((n: any) => n.type === 'http_response');

        if (hasResponseNode) {
            // Sync execution — wait and return user-defined response
            // (cannot use QStash for sync — caller is waiting)
            try {
                const execResult = await executeWorkflow(executionId, workflow, payload.data);

                if (execResult.httpResponse) {
                    const { statusCode, body, headers: respHeaders, contentType } = execResult.httpResponse;
                    const responseBody = typeof body === 'string' ? body : JSON.stringify(body);
                    c.header('Content-Type', contentType || 'application/json');
                    if (respHeaders) {
                        for (const [k, v] of Object.entries(respHeaders)) {
                            c.header(k, v);
                        }
                    }
                    c.status(statusCode as any);
                    return c.body(responseBody) as any;
                }

                // Response node existed but produced no output — return default
                return c.json({
                    executionId,
                    status: execResult.status,
                    result: execResult.result,
                }, 200);
            } catch (err: any) {
                return c.json({
                    executionId,
                    status: 'error',
                    error: err.message,
                }, 500);
            }
        }

        // ── Async execution (fire-and-forget) ───────────────────────────
        // If QStash is enabled, route through QStash for durable retry
        if (isQStashEnabled()) {
            const publicUrl = process.env.PUBLIC_URL || process.env.EDGE_URL || '';
            const destUrl = `${publicUrl}/api/execute/${id}`;
            const msgId = await publishExecution(destUrl, {
                executionId,
                workflowId: id,
                parameters: payload.data,
                triggerType: 'http_webhook',
                triggerPayload: JSON.stringify(payload),
            });

            if (msgId) {
                return c.json({
                    executionId,
                    status: 'started' as const,
                    message: 'Execution queued via QStash (durable)',
                }, 200);
            }
            // QStash publish failed — fall through to direct execution
        }

        // Direct execution (no QStash or QStash failed)
        executeWorkflow(executionId, workflow, payload.data)
            .catch(err => console.error(`Webhook execution ${executionId} failed:`, err));

        return c.json({
            executionId,
            status: 'started' as const,
            message: 'Webhook received, execution started',
        }, 200);
    } catch (err: any) {
        console.error('[Webhook Error]', err);
        return c.json({
            success: false,
            error: err.message || 'Unknown webhook error',
            stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
        }, 500) as any;
    }
});

export { webhookRoute };
