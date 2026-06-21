/**
 * Phase 3 — deploy lifecycle: reject scheduled/data_change deploys when no scheduler.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';

const mockGetWorkflow = vi.fn();
const mockUpsert = vi.fn();

vi.mock('../storage/index.js', () => ({
    stateProvider: {
        getWorkflowById: (...a: any[]) => mockGetWorkflow(...a),
        upsertWorkflow: (...a: any[]) => mockUpsert(...a),
    },
}));

// Ensure NO scheduler is configured for the reject path.
beforeAll(() => {
    delete process.env.QSTASH_TOKEN;
    delete process.env.BULLMQ_REDIS_URL;
});

import { deployRoute } from '../routes/deploy.js';

const app = new OpenAPIHono();
app.route('/api/deploy', deployRoute);

const UUID = '00000000-0000-0000-0000-0000000000aa';

function baseBody(triggerType: string) {
    return {
        id: UUID, name: 'T', triggerType,
        nodes: [], edges: [], isActive: true, tenantSlug: '_default',
    };
}

describe('POST /api/deploy — scheduler prerequisite', () => {
    it('rejects a data_change workflow when no scheduler is configured', async () => {
        const res = await app.request(`/api/deploy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(baseBody('data_change')),
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('SchedulerNotConfigured');
        expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('rejects a scheduled workflow when no scheduler is configured', async () => {
        const res = await app.request(`/api/deploy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(baseBody('scheduled')),
        });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('SchedulerNotConfigured');
    });

    it('allows a manual workflow with no scheduler', async () => {
        mockGetWorkflow.mockResolvedValue(null);
        mockUpsert.mockResolvedValue({ version: 1 });
        const res = await app.request(`/api/deploy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(baseBody('manual')),
        });
        expect(res.status).toBe(200);
        expect(mockUpsert).toHaveBeenCalled();
    });
});
