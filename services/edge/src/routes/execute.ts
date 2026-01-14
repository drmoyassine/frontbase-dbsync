/**
 * Execute Route - Trigger workflow execution
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { db } from '../db';
import { workflows, executions } from '../db/schema';
import { ExecuteRequestSchema, ExecuteResponseSchema, ErrorResponseSchema } from '../schemas';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { executeWorkflow } from '../engine/runtime';

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
    },
});

executeRoute.openapi(route, async (c) => {
    const { id } = c.req.valid('param');
    const body = await c.req.json().catch(() => ({}));

    // Fetch workflow
    const [workflow] = await db.select()
        .from(workflows)
        .where(eq(workflows.id, id))
        .limit(1);

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

    // Create execution record
    const executionId = uuidv4();
    const now = new Date().toISOString();

    await db.insert(executions).values({
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

export { executeRoute };
