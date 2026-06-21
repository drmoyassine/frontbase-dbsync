/**
 * Backend Connection Validator Tests — Sprint 1
 */

import { describe, it, expect } from 'vitest';
import {
    areTypesCompatible,
    validateEdgeConnection,
    validateWorkflow,
    normalizeType,
    getNodeDefinition,
} from '../../validation/connectionValidator';
import type { WorkflowNode, WorkflowEdge } from '../../schemas/workflow';

function node(id: string, type: string): WorkflowNode {
    return { id, type, position: { x: 0, y: 0 } } as WorkflowNode;
}

describe('normalizeType', () => {
    it('normalizes primitives and numeric aliases', () => {
        expect(normalizeType('string')).toBe('string');
        expect(normalizeType('STRING')).toBe('string');
        expect(normalizeType('integer')).toBe('number');
        expect(normalizeType('float')).toBe('number');
    });

    it('normalizes array notation', () => {
        expect(normalizeType('array<string>')).toBe('array');
        expect(normalizeType('string[]')).toBe('array');
    });

    it('normalizes unions to any when heterogeneous', () => {
        expect(normalizeType('string | number')).toBe('any');
        expect(normalizeType('string|string')).toBe('string');
    });
});

describe('areTypesCompatible', () => {
    it('matches identical types', () => {
        expect(areTypesCompatible('string', 'string')).toBe(true);
        expect(areTypesCompatible('number', 'number')).toBe(true);
    });

    it('accepts any on either side', () => {
        expect(areTypesCompatible('any', 'string')).toBe(true);
        expect(areTypesCompatible('number', 'any')).toBe(true);
    });

    it('accepts compatible coercions', () => {
        expect(areTypesCompatible('string', 'number')).toBe(true);
        expect(areTypesCompatible('number', 'string')).toBe(true);
        expect(areTypesCompatible('boolean', 'string')).toBe(true);
    });

    it('rejects incompatible types', () => {
        expect(areTypesCompatible('array', 'number')).toBe(false);
        expect(areTypesCompatible('array', 'boolean')).toBe(false);
        expect(areTypesCompatible('number', 'array')).toBe(false);
    });
});

describe('getNodeDefinition', () => {
    it('returns definitions for known node types', () => {
        expect(getNodeDefinition('webhook_trigger')).toBeDefined();
        expect(getNodeDefinition('http_request')).toBeDefined();
        expect(getNodeDefinition('http_response')).toBeDefined();
    });

    it('returns undefined for unknown types', () => {
        expect(getNodeDefinition('unknown_type')).toBeUndefined();
    });
});

describe('validateEdgeConnection', () => {
    const nodes: WorkflowNode[] = [
        node('trigger1', 'webhook_trigger'),
        node('action1', 'http_request'),
    ];

    const edge: WorkflowEdge = {
        id: 'edge1',
        source: 'trigger1',
        target: 'action1',
        sourceHandle: 'body',
        targetHandle: 'url',
    };

    it('validates a compatible connection', () => {
        const r = validateEdgeConnection(edge, nodes);
        expect(r.isValid).toBe(true);
        expect(r.sourceType).toBe('object');
    });

    it('rejects connections into trigger nodes', () => {
        const r = validateEdgeConnection(
            { ...edge, source: 'action1', target: 'trigger1' },
            nodes
        );
        expect(r.isValid).toBe(false);
        expect(r.error).toContain('trigger');
    });

    it('rejects self-connections', () => {
        const r = validateEdgeConnection(
            { ...edge, source: 'action1', target: 'action1' },
            nodes
        );
        expect(r.isValid).toBe(false);
        expect(r.error).toContain('itself');
    });

    it('handles missing source node', () => {
        const r = validateEdgeConnection({ ...edge, source: 'nope' }, nodes);
        expect(r.isValid).toBe(false);
        expect(r.error).toContain('not found');
    });

    it('rejects connections from terminal nodes', () => {
        const nodesWithTerminal = [...nodes, node('resp1', 'http_response')];
        const r = validateEdgeConnection(
            { id: 'e2', source: 'resp1', target: 'action1' },
            nodesWithTerminal
        );
        expect(r.isValid).toBe(false);
        expect(r.error).toContain('no outputs');
    });
});

describe('validateWorkflow', () => {
    const validNodes: WorkflowNode[] = [
        node('trigger1', 'webhook_trigger'),
        node('action1', 'http_request'),
    ];

    const validEdges: WorkflowEdge[] = [
        { id: 'edge1', source: 'trigger1', target: 'action1' },
    ];

    it('validates a correct workflow', () => {
        const r = validateWorkflow(validNodes, validEdges);
        expect(r.isValid).toBe(true);
        expect(r.errors).toHaveLength(0);
    });

    it('detects a missing trigger', () => {
        const r = validateWorkflow([node('action1', 'http_request')], []);
        expect(r.isValid).toBe(false);
        expect(r.errors.some(e => e.type === 'missing_trigger')).toBe(true);
    });

    it('warns on orphan nodes', () => {
        const nodes = [...validNodes, node('orphan1', 'log')];
        const r = validateWorkflow(nodes, validEdges);
        expect(r.warnings.some(w => w.type === 'unused_output')).toBe(true);
    });

    it('detects circular dependencies', () => {
        const nodes: WorkflowNode[] = [
            node('a', 'transform'),
            node('b', 'transform'),
        ];
        const edges: WorkflowEdge[] = [
            { id: 'e1', source: 'a', target: 'b' },
            { id: 'e2', source: 'b', target: 'a' },
        ];
        const r = validateWorkflow(nodes, edges);
        expect(r.isValid).toBe(false);
        expect(r.errors.some(e => e.type === 'circular_dependency')).toBe(true);
    });

    it('aggregates invalid-connection errors', () => {
        const edges: WorkflowEdge[] = [
            { id: 'edge1', source: 'trigger1', target: 'action1' },
            { id: 'edge2', source: 'action1', target: 'trigger1' },
        ];
        const r = validateWorkflow(validNodes, edges);
        expect(r.isValid).toBe(false);
        expect(r.errors.length).toBeGreaterThanOrEqual(1);
    });
});
