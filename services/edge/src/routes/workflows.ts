/**
 * Workflows Management Route — List, inspect, delete, toggle workflows
 *
 * These routes expose the IStateProvider workflow CRUD to the management API.
 * All endpoints are protected by systemKeyAuth (registered in lite.ts).
 *
 * Routes:
 *   GET  /              — List all workflows
 *   GET  /:id           — Get workflow by ID
 *   DELETE /:id         — Delete a workflow
 *   PATCH  /:id/toggle  — Toggle active/inactive
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { stateProvider } from '../storage/index.js';
import { SuccessResponseSchema, ErrorResponseSchema } from '../schemas';

const workflowsRoute = new OpenAPIHono();

// ── Shared Zod schemas ──────────────────────────────────────────────────────

const WorkflowSummarySchema = z.object({
    id: z.string(),
    name: z.string(),
    triggerType: z.string(),
    version: z.number(),
    isActive: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

// ── GET / — List all workflows ──────────────────────────────────────────────

const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['Workflows'],
    summary: 'List all deployed workflows',
    description: 'Returns a list of all workflows deployed to this engine',
    responses: {
        200: {
            description: 'Workflow list',
            content: {
                'application/json': {
                    schema: z.object({
                        workflows: z.array(WorkflowSummarySchema),
                        total: z.number(),
                    }),
                },
            },
        },
    },
});

workflowsRoute.openapi(listRoute, async (c) => {
    const workflows = await stateProvider.listWorkflows();
    return c.json({
        workflows: workflows.map(w => ({
            id: w.id, name: w.name, triggerType: w.triggerType,
            version: w.version, isActive: w.isActive,
            createdAt: w.createdAt, updatedAt: w.updatedAt,
        })),
        total: workflows.length,
    }, 200);
});

// ── GET /:id — Get workflow detail ──────────────────────────────────────────

const getRoute = createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Workflows'],
    summary: 'Get workflow by ID',
    description: 'Returns the full workflow definition including nodes and edges',
    request: {
        params: z.object({
            id: z.string().uuid().openapi({ description: 'Workflow ID' }),
        }),
    },
    responses: {
        200: {
            description: 'Workflow detail',
            content: {
                'application/json': {
                    schema: z.object({ workflow: z.record(z.unknown()) }),
                },
            },
        },
        404: {
            description: 'Workflow not found',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
});

workflowsRoute.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const workflow = await stateProvider.getWorkflowById(id);
    if (!workflow) {
        return c.json({ error: 'NotFound', message: `Workflow ${id} not found` }, 404);
    }
    return c.json({ workflow }, 200);
});

// ── DELETE /:id — Delete a workflow ─────────────────────────────────────────

const deleteRoute = createRoute({
    method: 'delete',
    path: '/:id',
    tags: ['Workflows'],
    summary: 'Delete a workflow',
    description: 'Permanently removes a workflow from this engine',
    request: {
        params: z.object({
            id: z.string().uuid().openapi({ description: 'Workflow ID' }),
        }),
    },
    responses: {
        200: {
            description: 'Workflow deleted',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema,
                },
            },
        },
    },
});

workflowsRoute.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid('param');
    await stateProvider.deleteWorkflow(id);
    return c.json({ success: true as const, message: `Workflow ${id} deleted` }, 200);
});

// ── PATCH /:id/toggle — Toggle active/inactive ─────────────────────────────

const toggleRoute = createRoute({
    method: 'patch',
    path: '/:id/toggle',
    tags: ['Workflows'],
    summary: 'Toggle workflow active state',
    description: 'Enable or disable a workflow without deleting it',
    request: {
        params: z.object({
            id: z.string().uuid().openapi({ description: 'Workflow ID' }),
        }),
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        isActive: z.boolean().openapi({ description: 'Desired active state' }),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Workflow toggled',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema.extend({
                        isActive: z.boolean(),
                    }),
                },
            },
        },
    },
});

workflowsRoute.openapi(toggleRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { isActive } = c.req.valid('json');
    await stateProvider.toggleWorkflow(id, isActive);
    return c.json({
        success: true as const,
        message: `Workflow ${id} ${isActive ? 'activated' : 'deactivated'}`,
        isActive,
    }, 200);
});

export { workflowsRoute };
