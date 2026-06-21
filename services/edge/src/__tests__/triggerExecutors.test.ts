/**
 * Phase 3 — data_change / schedule trigger executor tests.
 */

import { describe, it, expect } from 'vitest';
import { executeNode } from '../engine/node-executors';
import type { WorkflowNode } from '../schemas/workflow';

const ctx = {
    executionId: 'e', workflowId: 'w', parameters: {},
    nodeOutputs: {}, nodeExecutions: [], variableMutations: [],
};

function node(type: string): WorkflowNode {
    return { id: 'n', type, position: { x: 0, y: 0 }, data: { type } } as WorkflowNode;
}

describe('data_change_trigger executor', () => {
    it('surfaces {changes, operation, count} from the payload', async () => {
        const out = await executeNode(node('data_change_trigger'), {
            changes: [{ id: 1 }], operation: 'insert', count: 1,
        }, ctx as never);
        expect(out).toEqual({ changes: [{ id: 1 }], operation: 'insert', count: 1 });
    });

    it('defaults to empty changes + any operation when no payload', async () => {
        const out = await executeNode(node('data_change_trigger'), {}, ctx as never);
        expect(out.changes).toEqual([]);
        expect(out.operation).toBe('any');
        expect(out.count).toBe(0);
    });
});

describe('schedule_trigger executor', () => {
    it('passes through a timestamp', async () => {
        const out = await executeNode(node('schedule_trigger'), { timestamp: '2026-01-01T00:00:00Z' }, ctx as never);
        expect(out.timestamp).toBe('2026-01-01T00:00:00Z');
        expect(out.scheduledTime).toBe('2026-01-01T00:00:00Z');
    });

    it('synthesizes a timestamp when none provided', async () => {
        const out = await executeNode(node('schedule_trigger'), {}, ctx as never);
        expect(typeof out.timestamp).toBe('string');
        expect(out.timestamp.length).toBeGreaterThan(0);
    });
});
