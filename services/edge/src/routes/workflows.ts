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
import { WorkflowNodeSchema, WorkflowEdgeSchema, WorkflowValidationResultSchema } from '../schemas/workflow.js';
import { validateWorkflow } from '../validation/connectionValidator.js';
import { readScheduleMeta, unscheduleWorkflowTriggers, needsSchedule, scheduleWorkflowTriggers, withScheduleMeta } from '../engine/scheduler.js';

/** Best-effort teardown of any schedules attached to a workflow. */
async function teardownSchedules(workflowId: string, tenantSlug: string | undefined) {
    try {
        const wf = await stateProvider.getWorkflowById(workflowId, tenantSlug);
        const handles = readScheduleMeta(wf?.settings ?? null);
        if (handles.length) await unscheduleWorkflowTriggers(handles);
    } catch {
        // best-effort — do not block delete/toggle on scheduler errors
    }
}

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
    const tenantSlug = (c.get as any)('tenantSlug') || c.req.query('tenant_slug') || undefined;
    const workflows = await stateProvider.listWorkflows(tenantSlug);
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
    const tenantSlug = (c.get as any)('tenantSlug') || c.req.query('tenant_slug') || undefined;
    const workflow = await stateProvider.getWorkflowById(id, tenantSlug);
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
    const tenantSlug = (c.get as any)('tenantSlug') || c.req.query('tenant_slug') || undefined;
    await teardownSchedules(id, tenantSlug);
    await stateProvider.deleteWorkflow(id, tenantSlug);
    return c.json({ success: true as const, message: `Workflow ${id} deleted` }, 200);
});

// ── POST /validate — Validate workflow structure (Sprint 1) ─────────────────

const validateRoute = createRoute({
    method: 'post',
    path: '/validate',
    tags: ['Workflows'],
    summary: 'Validate workflow structure',
    description: 'Validates workflow nodes and edges for type compatibility and structural issues',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        nodes: z.array(WorkflowNodeSchema),
                        edges: z.array(WorkflowEdgeSchema),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Validation result (always 200; check `isValid` field)',
            content: {
                'application/json': {
                    schema: WorkflowValidationResultSchema,
                },
            },
        },
    },
});

workflowsRoute.openapi(validateRoute, async (c) => {
    const { nodes, edges } = c.req.valid('json');
    const result = validateWorkflow(nodes, edges);
    return c.json(result, 200);
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
    const tenantSlug = (c.get as any)('tenantSlug') || c.req.query('tenant_slug') || undefined;

    if (isActive) {
        // Activating: reschedule if the workflow uses data_change/scheduled triggers
        const workflow = await stateProvider.getWorkflowById(id, tenantSlug);
        if (workflow && (needsSchedule(workflow.triggerType).dataChange || needsSchedule(workflow.triggerType).scheduled)) {
            try {
                const handles = await scheduleWorkflowTriggers(workflow);
                const settingsWithSchedules = withScheduleMeta(workflow.settings, handles);
                // Update settings before toggling — toggleWorkflow will set isActive
                await stateProvider.upsertWorkflow({ ...workflow, settings: settingsWithSchedules } as any);
            } catch (e: any) {
                console.warn(`[Workflows] Failed to reschedule workflow ${id}:`, e.message);
                // Don't block the toggle if scheduling fails
            }
        }
    } else {
        // Deactivating: tear down schedules
        await teardownSchedules(id, tenantSlug);
    }

    await stateProvider.toggleWorkflow(id, isActive, tenantSlug);
    return c.json({
        success: true as const,
        message: `Workflow ${id} ${isActive ? 'activated' : 'deactivated'}`,
        isActive,
    }, 200);
});

export { workflowsRoute };
