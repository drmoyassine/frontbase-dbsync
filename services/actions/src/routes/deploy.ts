/**
 * Deploy Route - Receives published workflows from FastAPI
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { db } from '../db';
import { workflows } from '../db/schema';
import { DeployWorkflowSchema, SuccessResponseSchema, ErrorResponseSchema } from '../schemas';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';

const deployRoute = new OpenAPIHono();

const route = createRoute({
    method: 'post',
    path: '/',
    tags: ['Deployment'],
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

        // Check if workflow exists (update) or is new (insert)
        const existing = await db.select()
            .from(workflows)
            .where(eq(workflows.id, body.id))
            .limit(1);

        const now = new Date().toISOString();

        if (existing.length > 0) {
            // Update existing workflow
            const newVersion = (existing[0].version || 1) + 1;
            await db.update(workflows)
                .set({
                    name: body.name,
                    description: body.description,
                    triggerType: body.triggerType,
                    triggerConfig: JSON.stringify(body.triggerConfig || {}),
                    nodes: JSON.stringify(body.nodes),
                    edges: JSON.stringify(body.edges),
                    version: newVersion,
                    updatedAt: now,
                    publishedBy: body.publishedBy,
                })
                .where(eq(workflows.id, body.id));

            return c.json({
                success: true,
                message: 'Workflow updated successfully',
                workflowId: body.id,
                version: newVersion,
            });
        } else {
            // Insert new workflow
            await db.insert(workflows).values({
                id: body.id,
                name: body.name,
                description: body.description,
                triggerType: body.triggerType,
                triggerConfig: JSON.stringify(body.triggerConfig || {}),
                nodes: JSON.stringify(body.nodes),
                edges: JSON.stringify(body.edges),
                version: 1,
                isActive: true,
                createdAt: now,
                updatedAt: now,
                publishedBy: body.publishedBy,
            });

            return c.json({
                success: true,
                message: 'Workflow deployed successfully',
                workflowId: body.id,
                version: 1,
            });
        }
    } catch (error: any) {
        return c.json({
            error: 'DeploymentError',
            message: error.message || 'Failed to deploy workflow',
            details: error,
        }, 400);
    }
});

export { deployRoute };
