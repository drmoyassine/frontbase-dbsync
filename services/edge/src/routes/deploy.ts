/**
 * Deploy Route - Receives published workflows from FastAPI
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { stateProvider } from '../storage/index.js';
import type { WorkflowData } from '../storage/IStateProvider.js';
import { DeployWorkflowSchema, SuccessResponseSchema, ErrorResponseSchema } from '../schemas';
import { isSchedulerConfigured } from '../engine/executionGuards.js';
import { needsSchedule, scheduleWorkflowTriggers, unscheduleWorkflowTriggers, withScheduleMeta, readScheduleMeta } from '../engine/scheduler.js';

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
        const tenantSlug = body.tenantSlug || '_default';

        // Phase 3: scheduled/data_change workflows require a scheduler backend.
        if (needsSchedule(body.triggerType).dataChange || needsSchedule(body.triggerType).scheduled) {
            if (!isSchedulerConfigured()) {
                return c.json({
                    error: 'SchedulerNotConfigured',
                    message: 'This workflow uses a scheduled/data_change trigger, but no scheduler is configured (set QSTASH_TOKEN or BULLMQ_REDIS_URL).',
                }, 400);
            }
        }

        // Idempotent re-publish: tear down any prior schedules for this workflow.
        const existing = await stateProvider.getWorkflowById(body.id, tenantSlug);
        if (existing) {
            const oldHandles = readScheduleMeta(existing.settings);
            if (oldHandles.length) await unscheduleWorkflowTriggers(oldHandles);
        }

        // Register new schedules (before upsert so we can store handles in settings).
        let settingsRaw: string | null = (body as any).settings ? JSON.stringify((body as any).settings) : null;
        if (needsSchedule(body.triggerType).dataChange || needsSchedule(body.triggerType).scheduled) {
            const preWorkflow: WorkflowData = {
                id: body.id, name: body.name, triggerType: body.triggerType,
                triggerConfig: JSON.stringify(body.triggerConfig || {}),
            } as WorkflowData;
            try {
                const handles = await scheduleWorkflowTriggers(preWorkflow);
                settingsRaw = withScheduleMeta(settingsRaw, handles);
            } catch (err: any) {
                return c.json({
                    error: 'ScheduleRegistrationFailed',
                    message: err.message || 'Failed to register trigger schedule.',
                }, 400);
            }
        }

        const workflow: WorkflowData = {
            id: body.id,
            name: body.name,
            description: body.description || null,
            triggerType: body.triggerType,
            triggerConfig: JSON.stringify(body.triggerConfig || {}),
            nodes: JSON.stringify(body.nodes),
            edges: JSON.stringify(body.edges),
            settings: settingsRaw,
            publishedBy: body.publishedBy || null,
            tenantSlug,
            version: 1,
            isActive: body.isActive ?? true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
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
