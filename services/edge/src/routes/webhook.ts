/**
 * Webhook Route - Handle external webhook triggers
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { stateProvider } from '../storage/index.js';
import { WebhookPayloadSchema, ExecuteResponseSchema, ErrorResponseSchema } from '../schemas';
import { v4 as uuidv4 } from 'uuid';
import { executeWorkflow } from '../engine/runtime';

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
    },
});

webhookRoute.openapi(route, async (c) => {
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

    // Execute workflow asynchronously
    executeWorkflow(executionId, workflow, payload.data)
        .catch(err => console.error(`Webhook execution ${executionId} failed:`, err));

    return c.json({
        executionId,
        status: 'started' as const,
        message: 'Webhook received, execution started',
    }, 200);
});

export { webhookRoute };
