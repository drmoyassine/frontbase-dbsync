/**
 * UI Event Trigger Extractor — Sprint 4 (Model C)
 *
 * Given deployed workflows, extract the public-facing configuration for every
 * `ui_event_trigger` node so the hydrated client can wire up DOM listeners.
 *
 * This module is pure (no network/store deps) and fully unit-testable. It
 * emits only the minimal, non-sensitive fields the browser needs — never
 * workflow internals, secrets, or other nodes.
 */

import type { WorkflowData } from '../storage/IStateProvider.js';

export interface UIEventTriggerConfig {
    workflowId: string;
    workflowName: string;
    eventType: string;
    elementSelector: string;
    debounceMs: number;
    throttleMs: number;
    captureEventData: boolean;
    preventDefault: boolean;
    stopPropagation: boolean;
    keyFilter: string;
}

interface NodeInput {
    name: string;
    value?: unknown;
}

interface ParsedNode {
    type?: string;
    data?: { type?: string; inputs?: NodeInput[] | null };
    inputs?: NodeInput[] | null;
}

function readInputs(node: ParsedNode): NodeInput[] {
    return node.data?.inputs ?? node.inputs ?? [];
}

function getInputValue(inputs: NodeInput[], name: string): unknown {
    return inputs.find(i => i.name === name)?.value;
}

function asString(value: unknown, fallback = ''): string {
    if (value === null || value === undefined) return fallback;
    return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
    const n = Number(value);
    return isNaN(n) ? fallback : n;
}

function asBool(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === null) return fallback;
    return String(value).toLowerCase().trim() === 'true';
}

/**
 * Extract ui_event_trigger configs from a single workflow.
 */
export function extractUIEventTriggers(workflow: WorkflowData): UIEventTriggerConfig[] {
    if (!workflow.isActive) return [];

    let nodes: ParsedNode[] = [];
    try {
        nodes = JSON.parse(workflow.nodes || '[]');
    } catch {
        return [];
    }

    const triggers: UIEventTriggerConfig[] = [];

    for (const node of nodes) {
        const type = node.data?.type ?? node.type;
        if (type !== 'ui_event_trigger') continue;

        const inputs = readInputs(node);
        const selector = asString(getInputValue(inputs, 'elementSelector'));
        // Skip triggers with no selector — they can't bind to anything
        if (!selector.trim()) continue;

        triggers.push({
            workflowId: workflow.id,
            workflowName: workflow.name,
            eventType: asString(getInputValue(inputs, 'eventType'), 'click'),
            elementSelector: selector,
            debounceMs: asNumber(getInputValue(inputs, 'debounceMs'), 0),
            throttleMs: asNumber(getInputValue(inputs, 'throttleMs'), 0),
            captureEventData: asBool(getInputValue(inputs, 'captureEventData'), true),
            preventDefault: asBool(getInputValue(inputs, 'preventDefault'), false),
            stopPropagation: asBool(getInputValue(inputs, 'stopPropagation'), false),
            keyFilter: asString(getInputValue(inputs, 'keyFilter')),
        });
    }

    return triggers;
}

/**
 * Extract ui_event_trigger configs across many workflows (tenant-wide).
 */
export function extractFromWorkflows(workflows: WorkflowData[]): UIEventTriggerConfig[] {
    return workflows.flatMap(extractUIEventTriggers);
}
