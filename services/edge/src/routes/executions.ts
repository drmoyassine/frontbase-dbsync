/**
 * Executions Route - Query execution status and history
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { db } from '../db';
import { executions } from '../db/schema';
import { ExecutionSchema, ErrorResponseSchema } from '../schemas';
import { eq, desc } from 'drizzle-orm';

const executionsRoute = new OpenAPIHono();

// Get single execution
const getRoute = createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Executions'],
    summary: 'Get execution status',
    description: 'Returns the status and details of a workflow execution',
    request: {
        params: z.object({
            id: z.string().uuid().openapi({ description: 'Execution ID' }),
        }),
    },
    responses: {
        200: {
            description: 'Execution details',
            content: {
                'application/json': {
                    schema: ExecutionSchema,
                },
            },
        },
        404: {
            description: 'Execution not found',
            content: {
                'application/json': {
                    schema: ErrorResponseSchema,
                },
            },
        },
    },
});

executionsRoute.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');

    const [execution] = await db.select()
        .from(executions)
        .where(eq(executions.id, id))
        .limit(1);

    if (!execution) {
        return c.json({
            error: 'NotFound',
            message: `Execution ${id} not found`,
        }, 404);
    }

    return c.json({
        id: execution.id,
        workflowId: execution.workflowId,
        status: execution.status,
        triggerType: execution.triggerType,
        triggerPayload: execution.triggerPayload ? JSON.parse(execution.triggerPayload) : undefined,
        nodeExecutions: execution.nodeExecutions ? JSON.parse(execution.nodeExecutions) : [],
        result: execution.result ? JSON.parse(execution.result) : undefined,
        error: execution.error || undefined,
        usage: execution.usage || undefined,
        startedAt: execution.startedAt,
        endedAt: execution.endedAt || undefined,
    });
});

// List executions for a workflow
const listRoute = createRoute({
    method: 'get',
    path: '/workflow/:workflowId',
    tags: ['Executions'],
    summary: 'List workflow executions',
    description: 'Returns recent executions for a specific workflow',
    request: {
        params: z.object({
            workflowId: z.string().uuid().openapi({ description: 'Workflow ID' }),
        }),
        query: z.object({
            limit: z.string().optional().openapi({ description: 'Max results (default 20)' }),
        }),
    },
    responses: {
        200: {
            description: 'List of executions',
            content: {
                'application/json': {
                    schema: z.object({
                        executions: z.array(ExecutionSchema.omit({ nodeExecutions: true, triggerPayload: true })),
                        total: z.number(),
                    }),
                },
            },
        },
    },
});

executionsRoute.openapi(listRoute, async (c) => {
    const { workflowId } = c.req.valid('param');
    const { limit } = c.req.valid('query');
    const maxResults = Math.min(parseInt(limit || '20'), 100);

    const results = await db.select()
        .from(executions)
        .where(eq(executions.workflowId, workflowId))
        .orderBy(desc(executions.startedAt))
        .limit(maxResults);

    return c.json({
        executions: results.map(e => ({
            id: e.id,
            workflowId: e.workflowId,
            status: e.status,
            triggerType: e.triggerType,
            error: e.error || undefined,
            usage: e.usage || undefined,
            startedAt: e.startedAt,
            endedAt: e.endedAt || undefined,
        })),
        total: results.length,
    });
});

export { executionsRoute };
