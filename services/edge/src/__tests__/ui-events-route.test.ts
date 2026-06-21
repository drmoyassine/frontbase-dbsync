/**
 * UI Events Public Route Tests — Sprint 4 (Model C)
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';

const mockListWorkflows = vi.fn();

vi.mock('../storage/index.js', () => ({
    stateProvider: {
        listWorkflows: (...args: any[]) => mockListWorkflows(...args),
    },
}));

import { uiEventsRoute } from '../routes/ui-events.js';

const app = new OpenAPIHono();
app.route('/api/public', uiEventsRoute);

beforeAll(() => {
    // Silence route-level console output if any
});

describe('GET /api/public/ui-events', () => {
    it('returns extracted triggers for active workflows', async () => {
        mockListWorkflows.mockResolvedValue([
            {
                id: 'wf-1',
                name: 'Button Workflow',
                isActive: true,
                nodes: JSON.stringify([
                    {
                        type: 'ui_event_trigger',
                        data: {
                            type: 'ui_event_trigger',
                            inputs: [
                                { name: 'elementSelector', value: '#checkout' },
                                { name: 'eventType', value: 'click' },
                            ],
                        },
                    },
                ]),
            },
        ]);

        const res = await app.request('/api/public/ui-events');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.count).toBe(1);
        expect(body.triggers[0]).toMatchObject({
            workflowId: 'wf-1',
            eventType: 'click',
            elementSelector: '#checkout',
        });
        // SWR cache headers present
        expect(res.headers.get('cache-control')).toContain('stale-while-revalidate');
    });

    it('returns an empty list when there are no ui_event triggers', async () => {
        mockListWorkflows.mockResolvedValue([
            { id: 'wf-2', name: 'No UI', isActive: true, nodes: '[]' },
        ]);

        const res = await app.request('/api/public/ui-events');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.count).toBe(0);
        expect(body.triggers).toEqual([]);
    });

    it('passes the tenant slug through to the provider', async () => {
        mockListWorkflows.mockResolvedValue([]);

        await app.request('/api/public/ui-events?tenant_slug=acme');
        expect(mockListWorkflows).toHaveBeenCalledWith('acme');
    });
});
