/**
 * UI Event Trigger Extractor Tests — Sprint 4 (Model C)
 */

import { describe, it, expect } from 'vitest';
import { extractUIEventTriggers, extractFromWorkflows } from '../engine/uiEventTriggers';
import type { WorkflowData } from '../storage/IStateProvider';

function workflow(over: Partial<WorkflowData> = {}): WorkflowData {
    return {
        id: 'wf-1',
        name: 'Test Workflow',
        description: null,
        triggerType: 'ui_event',
        triggerConfig: null,
        nodes: '[]',
        edges: '[]',
        settings: null,
        version: 1,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        publishedBy: null,
        ...over,
    };
}

function uiEventNode(inputs: Record<string, unknown>) {
    return {
        type: 'ui_event_trigger',
        data: {
            type: 'ui_event_trigger',
            inputs: Object.entries(inputs).map(([name, value]) => ({ name, value })),
        },
    };
}

describe('extractUIEventTriggers', () => {
    it('extracts a ui_event_trigger with defaults', () => {
        const wf = workflow({
            nodes: JSON.stringify([
                uiEventNode({ elementSelector: '#btn', eventType: 'click' }),
            ]),
        });
        const triggers = extractUIEventTriggers(wf);
        expect(triggers).toHaveLength(1);
        expect(triggers[0]).toMatchObject({
            workflowId: 'wf-1',
            workflowName: 'Test Workflow',
            eventType: 'click',
            elementSelector: '#btn',
            captureEventData: true,
            preventDefault: false,
        });
    });

    it('skips triggers with no elementSelector', () => {
        const wf = workflow({
            nodes: JSON.stringify([uiEventNode({ eventType: 'click' })]),
        });
        expect(extractUIEventTriggers(wf)).toHaveLength(0);
    });

    it('defaults eventType to click when missing', () => {
        const wf = workflow({
            nodes: JSON.stringify([uiEventNode({ elementSelector: '.x' })]),
        });
        expect(extractUIEventTriggers(wf)[0].eventType).toBe('click');
    });

    it('skips inactive workflows', () => {
        const wf = workflow({
            isActive: false,
            nodes: JSON.stringify([uiEventNode({ elementSelector: '#btn' })]),
        });
        expect(extractUIEventTriggers(wf)).toHaveLength(0);
    });

    it('ignores non-ui_event_trigger nodes', () => {
        const wf = workflow({
            nodes: JSON.stringify([
                { type: 'http_request', data: { type: 'http_request', inputs: [] } },
            ]),
        });
        expect(extractUIEventTriggers(wf)).toHaveLength(0);
    });

    it('returns [] on unparseable nodes JSON', () => {
        const wf = workflow({ nodes: '{not json' });
        expect(extractUIEventTriggers(wf)).toHaveLength(0);
    });

    it('reads legacy top-level inputs', () => {
        const wf = workflow({
            nodes: JSON.stringify([
                { type: 'ui_event_trigger', inputs: [{ name: 'elementSelector', value: '.legacy' }] },
            ]),
        });
        expect(extractUIEventTriggers(wf)[0].elementSelector).toBe('.legacy');
    });

    it('coerces numeric and boolean fields', () => {
        const wf = workflow({
            nodes: JSON.stringify([
                uiEventNode({
                    elementSelector: '#x',
                    debounceMs: '300',
                    preventDefault: 'true',
                    captureEventData: 'false',
                }),
            ]),
        });
        const t = extractUIEventTriggers(wf)[0];
        expect(t.debounceMs).toBe(300);
        expect(t.preventDefault).toBe(true);
        expect(t.captureEventData).toBe(false);
    });

    it('handles multiple ui_event_trigger nodes in one workflow', () => {
        const wf = workflow({
            nodes: JSON.stringify([
                uiEventNode({ elementSelector: '#a' }),
                uiEventNode({ elementSelector: '#b', eventType: 'submit' }),
            ]),
        });
        expect(extractUIEventTriggers(wf)).toHaveLength(2);
    });
});

describe('extractFromWorkflows', () => {
    it('aggregates triggers across workflows', () => {
        const wfs = [
            workflow({ id: 'wf-1', nodes: JSON.stringify([uiEventNode({ elementSelector: '#a' })]) }),
            workflow({ id: 'wf-2', nodes: JSON.stringify([uiEventNode({ elementSelector: '#b' })]) }),
        ];
        const triggers = extractFromWorkflows(wfs);
        expect(triggers.map(t => t.workflowId).sort()).toEqual(['wf-1', 'wf-2']);
    });
});
