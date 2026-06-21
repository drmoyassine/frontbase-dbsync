/**
 * Public Execute Route Tests — Sprint 4 (Model C, last step)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockGetWorkflowById = vi.fn();
const mockCreateExecution = vi.fn();

vi.mock('../storage/index.js', () => ({
    stateProvider: {
        getWorkflowById: (...args: any[]) => mockGetWorkflowById(...args),
        createExecution: (...args: any[]) => mockCreateExecution(...args),
    },
}));

const mockRateLimit = vi.fn();
vi.mock('../cache/redis.js', () => ({
    rateLimit: (...args: any[]) => mockRateLimit(...args),
}));

const mockAcquireConcurrency = vi.fn();
const mockReleaseConcurrency = vi.fn();
vi.mock('../engine/concurrency.js', () => ({
    acquireConcurrency: (...args: any[]) => mockAcquireConcurrency(...args),
    releaseConcurrency: (...args: any[]) => mockReleaseConcurrency(...args),
}));

const mockCacheGet = vi.fn();
const mockCacheSetex = vi.fn();
vi.mock('../cache/index.js', () => ({
    cacheProvider: {
        get: (...args: any[]) => mockCacheGet(...args),
        setex: (...args: any[]) => mockCacheSetex(...args),
    },
}));

const mockExecuteWorkflow = vi.fn();
vi.mock('../engine/runtime', () => ({
    executeWorkflow: (...args: any[]) => mockExecuteWorkflow(...args),
}));

vi.mock('../engine/debounce.js', () => ({
    shouldDebounce: vi.fn().mockResolvedValue(false),
}));

import { publicExecuteRoute } from '../routes/public-execute.js';

const app = new OpenAPIHono();
app.route('/api/public/execute', publicExecuteRoute);

const UUID = '00000000-0000-0000-0000-000000000001';

function workflow(over: Record<string, unknown> = {}) {
    return {
        id: UUID,
        triggerType: 'ui_event',
        isActive: true,
        settings: null,
        nodes: '[]',
        edges: '[]',
        ...over,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ allowed: true, remaining: 59 });
    mockCacheGet.mockResolvedValue(null);
    mockAcquireConcurrency.mockResolvedValue(true);
    mockExecuteWorkflow.mockResolvedValue({ status: 'completed', result: { ok: true }, variableMutations: [] });
});

describe('POST /api/public/execute/:id — security gate', () => {
    it('executes a ui_event workflow', async () => {
        mockGetWorkflowById.mockResolvedValue(workflow());

        const res = await app.request(`/api/public/execute/${UUID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parameters: { event: { eventType: 'click' } } }),
        });

        expect(res.status).toBe(200);
        expect(mockExecuteWorkflow).toHaveBeenCalled();
        const body = await res.json();
        expect(body.status).toBe('completed');
    });

    it('rejects a non-ui_event workflow with 403', async () => {
        mockGetWorkflowById.mockResolvedValue(workflow({ triggerType: 'manual' }));

        const res = await app.request(`/api/public/execute/${UUID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });

        expect(res.status).toBe(403);
        expect(mockExecuteWorkflow).not.toHaveBeenCalled();
    });

    it('allows a multi-trigger workflow that includes ui_event', async () => {
        mockGetWorkflowById.mockResolvedValue(workflow({ triggerType: 'manual, ui_event' }));

        const res = await app.request(`/api/public/execute/${UUID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });

        expect(res.status).toBe(200);
    });

    it('returns 404 for an inactive workflow', async () => {
        mockGetWorkflowById.mockResolvedValue(workflow({ isActive: false }));

        const res = await app.request(`/api/public/execute/${UUID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });

        expect(res.status).toBe(404);
    });

    it('returns 404 when the workflow does not exist', async () => {
        mockGetWorkflowById.mockResolvedValue(null);

        const res = await app.request(`/api/public/execute/${UUID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });

        expect(res.status).toBe(404);
    });
});

describe('POST /api/public/execute/:id — rate limiting', () => {
    it('returns 429 when the rate limit is exceeded', async () => {
        mockGetWorkflowById.mockResolvedValue(workflow({ settings: '{"rate_limit_max":1}' }));
        mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });

        const res = await app.request(`/api/public/execute/${UUID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });

        expect(res.status).toBe(429);
        expect(mockExecuteWorkflow).not.toHaveBeenCalled();
    });

    it('records the execution with triggerType ui_event', async () => {
        mockGetWorkflowById.mockResolvedValue(workflow());

        await app.request(`/api/public/execute/${UUID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });

        expect(mockCreateExecution).toHaveBeenCalledWith(
            expect.objectContaining({ workflowId: UUID, triggerType: 'ui_event' })
        );
    });
});
