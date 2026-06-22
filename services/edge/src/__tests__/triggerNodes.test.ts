import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../engine/checkpoint.js', () => ({
    saveCheckpoint: vi.fn().mockResolvedValue(undefined),
}));

import { executeCheckpointNode } from '../nodes/CheckpointNode.js';
import { executeQueueTrigger } from '../nodes/QueueTrigger.js';
import { executeEmailTrigger } from '../nodes/EmailTrigger.js';

describe('Checkpoint Node', () => {
    beforeEach(() => vi.clearAllMocks());

    it('saves a named checkpoint and reports it', async () => {
        const { saveCheckpoint } = await import('../engine/checkpoint.js');
        const node = {
            id: 'cp-1',
            type: 'checkpoint',
            inputs: [{ name: 'name', value: 'before-risky-branch' }],
        } as any;

        const result = await executeCheckpointNode(node, {}, {
            executionId: 'exec-1',
            workflowId: 'wf-1',
            nodeOutputs: { 'n-1': { ok: true } },
            nodeExecutions: [{ nodeId: 'n-1', status: 'completed' }],
        });

        expect(result.saved).toBe(true);
        expect(result.checkpoint).toBe('before-risky-branch');
        expect(saveCheckpoint).toHaveBeenCalled();
    });

    it('falls back to a default checkpoint name', async () => {
        const node = { id: 'cp-2', type: 'checkpoint', inputs: [] } as any;
        const result = await executeCheckpointNode(node, {}, {
            executionId: 'exec-1',
            workflowId: 'wf-1',
            nodeOutputs: {},
            nodeExecutions: [],
        });
        expect(result.checkpoint).toBe('checkpoint-cp-2');
    });
});

describe('Queue Trigger Node', () => {
    it('normalizes an inbound queue message', () => {
        const result = executeQueueTrigger({
            message: { hello: 'world' },
            messageId: 'm-1',
            queueName: 'orders',
        });
        expect(result.message).toEqual({ hello: 'world' });
        expect(result.messageId).toBe('m-1');
        expect(result.queueName).toBe('orders');
        expect(result.timestamp).toBeDefined();
    });

    it('falls back to the whole payload when no message key is present', () => {
        const result = executeQueueTrigger({ foo: 'bar', id: 'm-2' });
        expect(result.message).toEqual({ foo: 'bar', id: 'm-2' });
        expect(result.messageId).toBe('m-2');
    });
});

describe('Email Trigger Node', () => {
    it('normalizes a parsed inbound email', () => {
        const result = executeEmailTrigger({
            from: 'a@b.com',
            to: 'c@d.com',
            subject: 'Hi',
            body: '<p>Hello</p>',
            attachments: [{ filename: 'x.txt' }],
            headers: { 'X-Mailer': 'test' },
            provider: 'resend',
            messageId: 'mid-1',
        });
        expect(result.from).toBe('a@b.com');
        expect(result.subject).toBe('Hi');
        expect(result.body).toBe('<p>Hello</p>');
        expect(result.attachments).toHaveLength(1);
        expect(result.provider).toBe('resend');
        expect(result.messageId).toBe('mid-1');
    });

    it('supplies sensible defaults for a sparse payload', () => {
        const result = executeEmailTrigger({});
        expect(result.subject).toBe('(no subject)');
        expect(result.attachments).toEqual([]);
        expect(result.headers).toEqual({});
        expect(result.timestamp).toBeDefined();
    });
});
