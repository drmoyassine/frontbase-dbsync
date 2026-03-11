/**
 * Deploy Route - Receives published workflows from FastAPI
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { stateProvider } from '../storage/index.js';
import type { WorkflowData } from '../storage/IStateProvider.js';
import { DeployWorkflowSchema, SuccessResponseSchema, ErrorResponseSchema } from '../schemas';

const deployRoute = new OpenAPIHono();

const route = createRoute({
    method: 'post',
    path: '/',
    tags: ['Workflows'],
    summary: 'Deploy a workflow',
    description: 'Receives a workflow from FastAPI and stores it for execution',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: DeployWorkflowSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Workflow deployed successfully',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema.extend({
                        workflowId: z.string().uuid(),
                        version: z.number(),
                    }),
                },
            },
        },
        400: {
            description: 'Invalid workflow data',
            content: {
                'application/json': {
                    schema: ErrorResponseSchema,
                },
            },
        },
    },
});

deployRoute.openapi(route, async (c) => {
    try {
        const body = c.req.valid('json');

        const workflow: WorkflowData = {
            id: body.id,
            name: body.name,
            description: body.description || null,
            triggerType: body.triggerType,
            triggerConfig: JSON.stringify(body.triggerConfig || {}),
            nodes: JSON.stringify(body.nodes),
            edges: JSON.stringify(body.edges),
            settings: (body as any).settings ? JSON.stringify((body as any).settings) : null,
            version: 1,
            isActive: body.isActive ?? true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            publishedBy: body.publishedBy || null,
        };

        const { version } = await stateProvider.upsertWorkflow(workflow);

        return c.json({
            success: true as const,
            message: version > 1 ? 'Workflow updated successfully' : 'Workflow deployed successfully',
            workflowId: body.id,
            version,
        }, 200);
    } catch (error: any) {
        return c.json({
            error: 'DeploymentError',
            message: error.message || 'Failed to deploy workflow',
            details: error,
        }, 400);
    }
});

export { deployRoute };
