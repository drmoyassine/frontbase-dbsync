/**
 * Execute Route Tests
 *
 * Tests the /api/execute/:id route handler using Hono's test client.
 * Mocks stateProvider, cacheProvider, and runtime to isolate route logic.
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

const mockCacheGet = vi.fn();
const mockCacheSetex = vi.fn();

vi.mock('../cache/index.js', () => ({
    cacheProvider: {
        get: (...args: any[]) => mockCacheGet(...args),
        setex: (...args: any[]) => mockCacheSetex(...args),
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

const mockExecuteWorkflow = vi.fn();
vi.mock('../engine/runtime', () => ({
    executeWorkflow: (...args: any[]) => mockExecuteWorkflow(...args),
    executeSingleNode: vi.fn().mockResolvedValue({}),
}));

vi.mock('../engine/queue.js', () => ({
    verifyQueueSignature: vi.fn().mockResolvedValue(true),
}));

vi.mock('../engine/debounce.js', () => ({
    shouldDebounce: vi.fn().mockResolvedValue(false),
}));

// Import after mocks
import { executeRoute } from '../routes/execute.js';

// ── Test App ────────────────────────────────────────────────────────────────

const app = new OpenAPIHono();
app.route('/api/execute', executeRoute);

function makeWorkflow(overrides: Record<string, any> = {}) {
    return {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Test Workflow',
        description: null,
        triggerType: 'manual',
        triggerConfig: null,
        nodes: JSON.stringify([{ id: 'n1', type: 'log', data: {} }]),
        edges: JSON.stringify([]),
        settings: null,
        version: 1,
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        publishedBy: null,
        ...overrides,
    };
}

describe('Execute Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetWorkflowById.mockResolvedValue(makeWorkflow());
        mockCreateExecution.mockResolvedValue(undefined);
        mockRateLimit.mockResolvedValue({ allowed: true, remaining: 59 });
        mockAcquireConcurrency.mockResolvedValue(true);
        mockExecuteWorkflow.mockResolvedValue({ status: 'completed' });
        mockCacheGet.mockResolvedValue(null);
        mockCacheSetex.mockResolvedValue('OK');
    });

    it('returns 200 for valid workflow', async () => {
        const res = await app.request('/api/execute/00000000-0000-0000-0000-000000000001', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.status).toBe('started');
        expect(json.executionId).toBeDefined();
    });

    it('returns 404 for unknown workflow', async () => {
        mockGetWorkflowById.mockResolvedValue(null);
        const res = await app.request('/api/execute/00000000-0000-0000-0000-000000000001', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(404);
    });

    it('returns 400 for inactive workflow', async () => {
        mockGetWorkflowById.mockResolvedValue(makeWorkflow({ isActive: false }));
        const res = await app.request('/api/execute/00000000-0000-0000-0000-000000000001', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
    });

    it('returns 429 when cooldown is active', async () => {
        mockGetWorkflowById.mockResolvedValue(
            makeWorkflow({ settings: JSON.stringify({ cooldown_ms: 10000 }) })
        );
        mockCacheGet.mockResolvedValue('running');
        const res = await app.request('/api/execute/00000000-0000-0000-0000-000000000001', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(429);
        const json = await res.json();
        expect(json.error).toBe('CoolDown');
    });

    it('returns 429 when concurrency limit exceeded', async () => {
        mockGetWorkflowById.mockResolvedValue(
            makeWorkflow({ settings: JSON.stringify({ concurrency_limit: 1 }) })
        );
        mockAcquireConcurrency.mockResolvedValue(false);
        const res = await app.request('/api/execute/00000000-0000-0000-0000-000000000001', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(429);
        const json = await res.json();
        expect(json.error).toBe('ConcurrencyLimitExceeded');
    });

    it('returns 429 when rate limit exceeded', async () => {
        mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
        const res = await app.request('/api/execute/00000000-0000-0000-0000-000000000001', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(429);
        const json = await res.json();
        expect(json.error).toBe('RateLimited');
    });

    it('passes settings to executeWorkflow', async () => {
        const settings = { execution_timeout_ms: 5000, cooldown_ms: 0 };
        mockGetWorkflowById.mockResolvedValue(
            makeWorkflow({ settings: JSON.stringify(settings) })
        );
        await app.request('/api/execute/00000000-0000-0000-0000-000000000001', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        // executeWorkflow should have been called with the settings object
        expect(mockExecuteWorkflow).toHaveBeenCalled();
        const callArgs = mockExecuteWorkflow.mock.calls[0];
        expect(callArgs[3]).toEqual(expect.objectContaining({ execution_timeout_ms: 5000 }));
    });

    it('sets X-RateLimit-Remaining header', async () => {
        mockRateLimit.mockResolvedValue({ allowed: true, remaining: 42 });
        const res = await app.request('/api/execute/00000000-0000-0000-0000-000000000001', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.headers.get('X-RateLimit-Remaining')).toBe('42');
    });
});
