/**
 * Workflow Versions Route tests (Automations A6)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = {
    listWorkflowVersions: vi.fn(),
    getWorkflowVersion: vi.fn(),
    rollbackToVersion: vi.fn(),
    deleteWorkflowVersion: vi.fn(),
    getWorkflowById: vi.fn(),
};

vi.mock('../storage/index.js', () => ({
    stateProvider: {
        listWorkflowVersions: (...a: any[]) => mocks.listWorkflowVersions(...a),
        getWorkflowVersion: (...a: any[]) => mocks.getWorkflowVersion(...a),
        rollbackToVersion: (...a: any[]) => mocks.rollbackToVersion(...a),
        deleteWorkflowVersion: (...a: any[]) => mocks.deleteWorkflowVersion(...a),
        getWorkflowById: (...a: any[]) => mocks.getWorkflowById(...a),
    },
}));

// Import after mocks are registered.
import { versionsRoute } from '../routes/versions.js';

describe('Workflow Versions Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: provider supports versions.
        (mocks as any).listWorkflowVersions.mockResolvedValue([]);
        (mocks as any).getWorkflowVersion.mockResolvedValue(null);
        (mocks as any).rollbackToVersion.mockResolvedValue(undefined);
        (mocks as any).deleteWorkflowVersion.mockResolvedValue(true);
        (mocks as any).getWorkflowById.mockResolvedValue({ version: 5 });
    });

    describe('GET /workflow/:workflowId', () => {
        it('lists versions newest-first', async () => {
            mocks.listWorkflowVersions.mockResolvedValue([
                {
                    id: 'v3', workflowId: 'wf-1', version: 3, name: 'Third',
                    description: null, triggerType: 'manual', nodes: '[]', edges: '[]',
                    settings: null, createdAt: '2024-03-01T00:00:00Z', createdBy: null,
                },
            ]);

            const res = await versionsRoute.request('/workflow/wf-1?limit=10', { method: 'GET' });
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.versions).toHaveLength(1);
            expect(body.versions[0].id).toBe('v3');
            expect(body.total).toBe(1);
            expect(mocks.listWorkflowVersions).toHaveBeenCalledWith('wf-1', 10, undefined);
        });

        it('returns 503 when the provider does not support versions', async () => {
            const sp = (await import('../storage/index.js')).stateProvider;
            const original = sp.listWorkflowVersions;
            sp.listWorkflowVersions = undefined as any;
            try {
                const res = await versionsRoute.request('/workflow/wf-1', { method: 'GET' });
                expect(res.status).toBe(503);
            } finally {
                sp.listWorkflowVersions = original;
            }
        });
    });

    describe('GET /:id', () => {
        it('returns a version by id', async () => {
            mocks.getWorkflowVersion.mockResolvedValue({
                id: 'v1', workflowId: 'wf-1', version: 1, name: 'First',
                description: 'd', triggerType: 'manual', nodes: '[{"id":"n1"}]', edges: '[]',
                settings: '{}', createdAt: '2024-01-01T00:00:00Z', createdBy: 'u',
            });

            const res = await versionsRoute.request('/v1', { method: 'GET' });
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.version.id).toBe('v1');
            expect(body.version.nodes).toBe('[{"id":"n1"}]');
        });

        it('returns 404 for an unknown version', async () => {
            mocks.getWorkflowVersion.mockResolvedValue(null);
            const res = await versionsRoute.request('/missing', { method: 'GET' });
            expect(res.status).toBe(404);
        });
    });

    describe('POST /rollback', () => {
        it('rolls back and reports the new version', async () => {
            mocks.getWorkflowById.mockResolvedValue({ version: 5 });

            const res = await versionsRoute.request('/rollback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workflowId: 'wf-1', versionId: 'v2' }),
            });

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.success).toBe(true);
            expect(body.currentVersion).toBe(5);
            expect(mocks.rollbackToVersion).toHaveBeenCalledWith('wf-1', 'v2', undefined);
        });

        it('returns 400 on rollback error', async () => {
            mocks.rollbackToVersion.mockRejectedValue(new Error('Version gone'));
            const res = await versionsRoute.request('/rollback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workflowId: 'wf-1', versionId: 'vX' }),
            });
            expect(res.status).toBe(400);
        });
    });

    describe('DELETE /:id', () => {
        it('deletes a version', async () => {
            mocks.deleteWorkflowVersion.mockResolvedValue(true);
            const res = await versionsRoute.request('/v1', { method: 'DELETE' });
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.success).toBe(true);
        });

        it('returns 404 when nothing was deleted', async () => {
            mocks.deleteWorkflowVersion.mockResolvedValue(false);
            const res = await versionsRoute.request('/v1', { method: 'DELETE' });
            expect(res.status).toBe(404);
        });
    });
});
