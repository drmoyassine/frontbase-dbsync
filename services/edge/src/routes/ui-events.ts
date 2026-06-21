/**
 * UI Event Triggers Public Route — Sprint 4 (Model C)
 *
 *   GET /api/public/ui-events
 *
 * Returns the active `ui_event_trigger` configurations for the current tenant
 * so the hydrated client can wire DOM listeners. Public (no systemKeyAuth) by
 * design — the data is just CSS selectors + event types, no workflow internals.
 * Tenant-scoped via tenantMiddleware. Cacheable (SWR): short max-age with a
 * long stale-while-revalidate window so offline/PWA clients keep working.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { stateProvider } from '../storage/index.js';
import { extractFromWorkflows } from '../engine/uiEventTriggers.js';

const uiEventsRoute = new OpenAPIHono();

const UIEventTriggerSchema = z.object({
    workflowId: z.string(),
    workflowName: z.string(),
    eventType: z.string(),
    elementSelector: z.string(),
    debounceMs: z.number(),
    throttleMs: z.number(),
    captureEventData: z.boolean(),
    preventDefault: z.boolean(),
    stopPropagation: z.boolean(),
    keyFilter: z.string(),
}).openapi('UIEventTrigger');

const listRoute = createRoute({
    method: 'get',
    path: '/ui-events',
    tags: ['UI Events'],
    summary: 'List active UI event triggers for the hydrated client',
    description:
        'Returns ui_event_trigger node configurations for active workflows in this tenant. ' +
        'Public endpoint consumed by the page hydration script to wire DOM event listeners.',
    responses: {
        200: {
            description: 'Active UI event triggers',
            content: {
                'application/json': {
                    schema: z.object({
                        triggers: z.array(UIEventTriggerSchema),
                        count: z.number(),
                    }),
                },
            },
        },
    },
});

uiEventsRoute.openapi(listRoute, async (c) => {
    const tenantSlug = (c.env as any)?.FRONTBASE_TENANT_SLUG
        || (c.get as any)('tenantSlug')
        || c.req.query('tenant_slug')
        || undefined;

    const workflows = await stateProvider.listWorkflows(tenantSlug);
    const triggers = extractFromWorkflows(workflows);

    // SWR cache headers: fresh for 60s, usable stale for up to 1 day. This lets
    // the browser/CDN serve a cached copy instantly (and offline) while
    // revalidating in the background.
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=86400');

    return c.json({ triggers, count: triggers.length }, 200);
});

export { uiEventsRoute };
