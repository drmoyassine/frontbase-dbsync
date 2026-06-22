/**
 * Workflow Versions Route (Automations A6)
 *
 * List / inspect / rollback / delete workflow version snapshots.
 *
 *   GET    /workflow/:workflowId           — list versions (newest first)
 *   GET    /:id                            — version detail (nodes/edges/etc.)
 *   POST   /rollback                       — restore a workflow to a version
 *   DELETE /:id                            — delete a version
 *
 * Version methods are optional on the provider; if unsupported the route 503s.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { stateProvider } from '../storage/index.js';
import { SuccessResponseSchema, ErrorResponseSchema } from '../schemas/index.js';

export const versionsRoute = new OpenAPIHono();

function tenantOf(c: any): string | undefined {
    return (c.get as any)?.('tenantSlug') || c.req.query('tenant_slug') || undefined;
}

const VersionSummarySchema = z.object({
    id: z.string(),
    workflowId: z.string(),
    version: z.number(),
    name: z.string(),
    description: z.string().nullable(),
    triggerType: z.string().nullable(),
    createdAt: z.string(),
    createdBy: z.string().nullable(),
});

// ── List ────────────────────────────────────────────────────────────────────

const listRoute = createRoute({
    method: 'get',
    path: '/workflow/:workflowId',
    tags: ['Workflow Versions'],
    summary: 'List workflow versions',
    request: {
        params: z.object({ workflowId: z.string() }),
        query: z.object({ limit: z.string().optional() }),
    },
    responses: {
        200: {
            description: 'Workflow versions',
            content: {
                'application/json': {
                    schema: z.object({ versions: z.array(VersionSummarySchema), total: z.number() }),
                },
            },
        },
        503: {
            description: 'Provider does not support version history',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});

versionsRoute.openapi(listRoute, async (c) => {
    if (!stateProvider.listWorkflowVersions) {
        return c.json({ error: 'NotSupported', message: 'Version history not supported by this provider' }, 503);
    }
    const { workflowId } = c.req.valid('param');
    const { limit } = c.req.valid('query');
    const max = Math.min(parseInt(limit || '50'), 100);
    const versions = await stateProvider.listWorkflowVersions(workflowId, max, tenantOf(c));
    return c.json(
        {
            versions: versions.map((v) => ({
                id: v.id,
                workflowId: v.workflowId,
                version: v.version,
                name: v.name,
                description: v.description,
                triggerType: v.triggerType,
                createdAt: v.createdAt,
                createdBy: v.createdBy,
            })),
            total: versions.length,
        },
        200,
    );
});

// ── Detail ──────────────────────────────────────────────────────────────────

const getRoute = createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Workflow Versions'],
    summary: 'Get a workflow version',
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: 'Workflow version',
            content: {
                'application/json': {
                    schema: z.object({
                        version: z.object({
                            id: z.string(),
                            workflowId: z.string(),
                            version: z.number(),
                            name: z.string(),
                            description: z.string().nullable(),
                            triggerType: z.string(),
                            nodes: z.string(),
                            edges: z.string(),
                            settings: z.string().nullable(),
                            createdAt: z.string(),
                            createdBy: z.string().nullable(),
                        }),
                    }),
                },
            },
        },
        404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
        503: { description: 'Not supported', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
});

versionsRoute.openapi(getRoute, async (c) => {
    if (!stateProvider.getWorkflowVersion) {
        return c.json({ error: 'NotSupported', message: 'Version history not supported by this provider' }, 503);
    }
    const { id } = c.req.valid('param');
    const version = await stateProvider.getWorkflowVersion(id, tenantOf(c));
    if (!version) {
        return c.json({ error: 'NotFound', message: `Version ${id} not found` }, 404);
    }
    return c.json(
        {
            version: {
                id: version.id,
                workflowId: version.workflowId,
                version: version.version,
                name: version.name,
                description: version.description,
                triggerType: version.triggerType,
                nodes: version.nodes,
                edges: version.edges,
                settings: version.settings,
                createdAt: version.createdAt,
                createdBy: version.createdBy,
            },
        },
        200,
    );
});

// ── Rollback ────────────────────────────────────────────────────────────────

const rollbackRoute = createRoute({
    method: 'post',
    path: '/rollback',
    tags: ['Workflow Versions'],
    summary: 'Rollback a workflow to a previous version',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        workflowId: z.string(),
                        versionId: z.string(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Rolled back',
            content: { 'application/json': { schema: SuccessResponseSchema.extend({ currentVersion: z.number() }) } },
        },
        400: { description: 'Bad request', content: { 'application/json': { schema: ErrorResponseSchema } } },
        503: { description: 'Not supported', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
});

versionsRoute.openapi(rollbackRoute, async (c) => {
    if (!stateProvider.rollbackToVersion) {
        return c.json({ error: 'NotSupported', message: 'Version history not supported by this provider' }, 503);
    }
    const { workflowId, versionId } = await c.req.json();
    try {
        await stateProvider.rollbackToVersion(workflowId, versionId, tenantOf(c));
        const wf = await stateProvider.getWorkflowById(workflowId, tenantOf(c));
        return c.json(
            {
                success: true as const,
                message: `Workflow rolled back to version ${versionId}`,
                currentVersion: wf?.version || 0,
            },
            200,
        );
    } catch (e: any) {
        return c.json({ error: 'RollbackError', message: e?.message || 'Rollback failed' }, 400);
    }
});

// ── Delete ──────────────────────────────────────────────────────────────────

const deleteRoute = createRoute({
    method: 'delete',
    path: '/:id',
    tags: ['Workflow Versions'],
    summary: 'Delete a workflow version',
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: { description: 'Deleted', content: { 'application/json': { schema: SuccessResponseSchema } } },
        404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
        503: { description: 'Not supported', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
});

versionsRoute.openapi(deleteRoute, async (c) => {
    if (!stateProvider.deleteWorkflowVersion) {
        return c.json({ error: 'NotSupported', message: 'Version history not supported by this provider' }, 503);
    }
    const { id } = c.req.valid('param');
    const deleted = await stateProvider.deleteWorkflowVersion(id, tenantOf(c));
    if (!deleted) {
        return c.json({ error: 'NotFound', message: `Version ${id} not found` }, 404);
    }
    return c.json({ success: true as const, message: `Version ${id} deleted` }, 200);
});
