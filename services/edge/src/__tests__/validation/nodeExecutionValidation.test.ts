/**
 * Backend Pre-Execution Validation Tests — Sprint 3
 */

import { describe, it, expect } from 'vitest';
import { validateNode, validateWorkflowExecution } from '../../engine/validation';
import type { WorkflowNode } from '../../schemas/workflow';

function node(id: string, type: string, inputs: Array<{ name: string; value?: unknown }>): WorkflowNode {
    return {
        id,
        type,
        position: { x: 0, y: 0 },
        data: { type, inputs: inputs as never },
    } as WorkflowNode;
}

describe('validateNode', () => {
    it('passes when required fields are present', () => {
        const errors = validateNode(node('n1', 'http_request', [
            { name: 'method', value: 'GET' },
            { name: 'url', value: 'https://example.com' },
        ]));
        expect(errors).toHaveLength(0);
    });

    it('flags missing required fields', () => {
        const errors = validateNode(node('n1', 'http_request', [
            { name: 'method', value: 'GET' },
        ]));
        expect(errors.map(e => e.field)).toContain('url');
    });

    it('flags empty-string required values', () => {
        const errors = validateNode(node('n1', 'http_request', [
            { name: 'method', value: 'GET' },
            { name: 'url', value: '' },
        ]));
        expect(errors.map(e => e.field)).toContain('url');
    });

    it('skips nodes with no required fields', () => {
        const errors = validateNode(node('n1', 'transform', []));
        expect(errors).toHaveLength(0);
    });
});

describe('validateWorkflowExecution', () => {
    it('aggregates errors across nodes', () => {
        const r = validateWorkflowExecution([
            node('n1', 'http_request', [{ name: 'method', value: 'GET' }]),
            node('n2', 'log', []),
        ]);
        expect(r.valid).toBe(false);
        expect(r.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('is valid when all nodes satisfy required fields', () => {
        const r = validateWorkflowExecution([
            node('n1', 'http_request', [
                { name: 'method', value: 'GET' },
                { name: 'url', value: 'https://example.com' },
            ]),
        ]);
        expect(r.valid).toBe(true);
    });
});
