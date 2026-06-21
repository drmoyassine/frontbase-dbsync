/**
 * UI Event Trigger Executor Tests — Sprint 4
 */

import { describe, it, expect } from 'vitest';
import { executeNode } from '../engine/node-executors';
import type { WorkflowNode } from '../schemas/workflow';

const mockContext = {
    executionId: 'exec-1',
    workflowId: 'wf-1',
    parameters: {},
    nodeOutputs: {},
    nodeExecutions: [],
    variableMutations: [],
};

function uiEventNode(): WorkflowNode {
    return {
        id: 'n1',
        type: 'ui_event_trigger',
        position: { x: 0, y: 0 },
        data: { type: 'ui_event_trigger' },
    } as WorkflowNode;
}

describe('ui_event_trigger executor', () => {
    it('normalizes a nested event payload', async () => {
        const result = await executeNode(uiEventNode(), {
            event: {
                eventType: 'click',
                timestamp: '2026-01-01T00:00:00.000Z',
                value: 'submit',
                coordinates: { x: 10, y: 20 },
            },
        }, mockContext as never);

        expect(result.eventType).toBe('click');
        expect(result.timestamp).toBe('2026-01-01T00:00:00.000Z');
        expect(result.value).toBe('submit');
        expect(result.coordinates).toEqual({ x: 10, y: 20 });
    });

    it('falls back to top-level fields when no nested event', async () => {
        const result = await executeNode(uiEventNode(), {
            type: 'submit',
            value: 'ok',
        }, mockContext as never);

        expect(result.eventType).toBe('submit');
        expect(result.value).toBe('ok');
    });

    it('always returns a timestamp', async () => {
        const result = await executeNode(uiEventNode(), {}, mockContext as never);
        expect(result.timestamp).toBeTruthy();
        expect(result.eventType).toBeNull();
    });
});
