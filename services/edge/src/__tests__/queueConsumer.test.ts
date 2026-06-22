import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../storage/index.js', () => ({
    stateProvider: {
        getWorkflowById: vi.fn(),
        listWorkflows: vi.fn().mockResolvedValue([]),
        createExecution: vi.fn().mockResolvedValue(undefined),
        getExecutionById: vi.fn(),
    },
}));

vi.mock('../services/queue/index.js', () => ({
    queueServiceReady: Promise.resolve({
        process: vi.fn(),
    }),
}));

vi.mock('../engine/runtime.js', () => ({
    executeWorkflow: vi.fn().mockResolvedValue({ status: 'completed', result: {} }),
}));

vi.mock('../execution/idempotency.js', () => ({
    checkIdempotency: vi.fn().mockResolvedValue({ seen: false }),
    markIdempotency: vi.fn().mockResolvedValue(undefined),
    generateIdempotencyKey: vi.fn().mockReturnValue('idem-key'),
}));

vi.mock('../execution/spikeBuffer.js', () => ({
    getWorkflowSpikeBuffer: () => ({ execute: async (job: any) => job() }),
}));

import { handleQueueMessage, handleResume, needsQueueTrigger, isResumeJob } from '../execution/queueConsumer.js';

describe('Queue Consumer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('needsQueueTrigger', () => {
        it('detects queue trigger types', () => {
            expect(needsQueueTrigger('queue')).toBe(true);
            expect(needsQueueTrigger('queue_trigger')).toBe(true);
            expect(needsQueueTrigger('manual,queue_trigger')).toBe(true);
        });

        it('returns false for non-queue triggers', () => {
            expect(needsQueueTrigger('manual')).toBe(false);
            expect(needsQueueTrigger('scheduled')).toBe(false);
            expect(needsQueueTrigger('data_change')).toBe(false);
        });
    });

    describe('isResumeJob', () => {
        it('identifies resume jobs', () => {
            expect(isResumeJob('wf:resume:exec-1')).toBe(true);
            expect(isResumeJob('queue:wf-1')).toBe(false);
        });
    });

    describe('handleQueueMessage', () => {
        it('skips when the workflow is not found or inactive', async () => {
            const { stateProvider } = await import('../storage/index.js');
            (stateProvider.getWorkflowById as any).mockResolvedValue(null);

            const result = await handleQueueMessage('wf-missing', { foo: 'bar' });
            expect(result).toBeNull();
        });

        it('creates an execution and runs the workflow for an active queue workflow', async () => {
            const { stateProvider } = await import('../storage/index.js');
            const { executeWorkflow } = await import('../engine/runtime.js');
            (stateProvider.getWorkflowById as any).mockResolvedValue({
                id: 'wf-1',
                isActive: true,
                triggerType: 'queue_trigger',
                nodes: '[]',
                edges: '[]',
                settings: '{}',
            });

            const result = await handleQueueMessage('wf-1', { foo: 'bar' });

            expect(result?.executionId).toBeDefined();
            expect(stateProvider.createExecution).toHaveBeenCalled();
            // spike buffer executes synchronously here (mocked), so executeWorkflow fires
            expect(executeWorkflow).toHaveBeenCalled();
        });

        it('deduplicates an already-seen message', async () => {
            const { stateProvider } = await import('../storage/index.js');
            const { checkIdempotency } = await import('../execution/idempotency.js');
            (stateProvider.getWorkflowById as any).mockResolvedValue({
                id: 'wf-1',
                isActive: true,
                triggerType: 'queue_trigger',
                nodes: '[]',
                edges: '[]',
                settings: '{}',
            });
            (checkIdempotency as any).mockResolvedValue({ seen: true, executionId: 'prior-exec' });

            const result = await handleQueueMessage('wf-1', { foo: 'bar' });
            expect(result?.deduplicated).toBe(true);
            expect(result?.executionId).toBe('prior-exec');
        });
    });

    describe('handleResume', () => {
        it('re-executes the workflow with the same executionId', async () => {
            const { stateProvider } = await import('../storage/index.js');
            const { executeWorkflow } = await import('../engine/runtime.js');
            (stateProvider.getExecutionById as any).mockResolvedValue({
                id: 'exec-1',
                workflowId: 'wf-1',
            });
            (stateProvider.getWorkflowById as any).mockResolvedValue({
                id: 'wf-1',
                nodes: '[]',
                edges: '[]',
                settings: '{}',
            });

            await handleResume('exec-1', {});

            expect(executeWorkflow).toHaveBeenCalledWith('exec-1', expect.anything(), {}, expect.anything());
        });

        it('no-ops when the execution is not found', async () => {
            const { stateProvider } = await import('../storage/index.js');
            const { executeWorkflow } = await import('../engine/runtime.js');
            (stateProvider.getExecutionById as any).mockResolvedValue(null);

            await handleResume('missing', {});
            expect(executeWorkflow).not.toHaveBeenCalled();
        });
    });
});
