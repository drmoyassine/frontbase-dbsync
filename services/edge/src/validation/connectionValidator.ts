/**
 * Backend Connection Validator
 *
 * Validates workflow node connections and type compatibility during workflow
 * deployment and execution to prevent invalid workflows from being run.
 *
 * The NODE_DEFINITIONS below mirror the frontend schema registry
 * (src/lib/workflow/nodeSchemas/*). They must be kept in sync. In this
 * architecture node `inputs` are configuration fields, not typed data ports,
 * so the target data type defaults to `'any'`; the structural rules
 * (no self-connect, no target-is-trigger, no source-is-terminal) plus output
 * type checks are what's enforced.
 */

import type { WorkflowNode, WorkflowEdge } from '../schemas/workflow';

// ============ Node Type Definitions (Backend Mirror) ============

interface NodeDefinition {
    outputs: Record<string, string>;
    category: 'triggers' | 'actions' | 'logic' | 'integrations' | 'interface' | 'output';
}

const NODE_DEFINITIONS: Record<string, NodeDefinition> = {
    // Triggers
    trigger: { outputs: { payload: 'object' }, category: 'triggers' },
    manual_trigger: { outputs: { payload: 'object' }, category: 'triggers' },
    webhook_trigger: {
        outputs: { headers: 'object', query: 'object', body: 'object' },
        category: 'triggers',
    },
    schedule_trigger: {
        outputs: { timestamp: 'string', scheduledTime: 'string' },
        category: 'triggers',
    },
    data_change_trigger: {
        outputs: { changes: 'array', operation: 'string', count: 'number' },
        category: 'triggers',
    },
    ui_event_trigger: {
        outputs: {
            timestamp: 'string',
            eventType: 'string',
            element: 'object',
            value: 'any',
            checked: 'boolean',
            coordinates: 'object',
            modifiers: 'object',
            key: 'string',
            target: 'object',
        },
        category: 'triggers',
    },
    // Actions
    http_request: {
        outputs: { data: 'any', status: 'number', headers: 'object' },
        category: 'actions',
    },
    transform: { outputs: { data: 'any', count: 'number' }, category: 'actions' },
    log: { outputs: { data: 'any' }, category: 'actions' },
    // Logic
    condition: { outputs: { 'Condition 1': 'any', else: 'any' }, category: 'logic' },
    if: { outputs: { true: 'any', false: 'any' }, category: 'logic' },
    // Integrations
    data_request: {
        outputs: { data: 'array', rowCount: 'number', success: 'boolean' },
        category: 'integrations',
    },
    // Interface
    toast: { outputs: { data: 'any' }, category: 'interface' },
    set_variable: { outputs: { data: 'any' }, category: 'interface' },
    redirect: { outputs: {}, category: 'interface' },
    refresh: { outputs: {}, category: 'interface' },
    // Output
    http_response: { outputs: {}, category: 'output' },
};

export function getNodeDefinition(nodeType: string): NodeDefinition | undefined {
    return NODE_DEFINITIONS[nodeType];
}

// ============ Type Compatibility Matrix ============

const COMPATIBILITY_MATRIX: Record<string, Set<string>> = {
    any: new Set(['*']),
    string: new Set(['string', 'number', 'any', 'json', 'object']),
    number: new Set(['number', 'string', 'any', 'json', 'boolean']),
    boolean: new Set(['boolean', 'string', 'any', 'json', 'number']),
    array: new Set(['array', 'any', 'json', 'object']),
    object: new Set(['object', 'any', 'json', 'array', 'string']),
    json: new Set(['json', 'object', 'array', 'string', 'any']),
    void: new Set(['void']),
};

export function normalizeType(type: string): string {
    const normalized = type.toLowerCase().trim();

    if (normalized.startsWith('array<') || normalized.endsWith('[]')) {
        return 'array';
    }

    if (normalized.includes('|')) {
        const types = normalized.split('|').map(t => normalizeType(t.trim()));
        const uniqueTypes = new Set(types);
        return uniqueTypes.size === 1 ? types[0] : 'any';
    }

    if (['integer', 'float', 'double', 'int'].includes(normalized)) {
        return 'number';
    }

    return normalized;
}

export function areTypesCompatible(sourceType: string, targetType: string): boolean {
    const source = normalizeType(sourceType);
    const target = normalizeType(targetType);

    if (source === 'any' || target === 'any') return true;
    if (source === target) return true;

    const compatibleTargets = COMPATIBILITY_MATRIX[source];
    return !!compatibleTargets && (compatibleTargets.has('*') || compatibleTargets.has(target));
}

// ============ Connection Validation ============

export interface EdgeValidationResult {
    isValid: boolean;
    edgeId?: string;
    error?: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceOutput?: string;
    targetInput?: string;
    sourceType: string;
    targetType: string;
}

export function validateEdgeConnection(
    edge: WorkflowEdge,
    nodes: WorkflowNode[]
): EdgeValidationResult {
    const base = {
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        edgeId: edge.id,
    };

    if (edge.source === edge.target) {
        return {
            ...base,
            isValid: false,
            sourceType: 'unknown',
            targetType: 'unknown',
            error: 'Cannot connect a node to itself',
        };
    }

    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);

    if (!sourceNode) {
        return {
            ...base,
            isValid: false,
            sourceType: 'unknown',
            targetType: 'unknown',
            error: `Source node ${edge.source} not found`,
        };
    }
    if (!targetNode) {
        return {
            ...base,
            isValid: false,
            sourceType: 'unknown',
            targetType: 'unknown',
            error: `Target node ${edge.target} not found`,
        };
    }

    const sourceDef = getNodeDefinition(sourceNode.type);
    const targetDef = getNodeDefinition(targetNode.type);

    if (!sourceDef) {
        return {
            ...base,
            isValid: false,
            sourceType: sourceNode.type,
            targetType: targetNode.type,
            error: `Unknown source node type: ${sourceNode.type}`,
        };
    }
    if (!targetDef) {
        return {
            ...base,
            isValid: false,
            sourceType: sourceNode.type,
            targetType: targetNode.type,
            error: `Unknown target node type: ${targetNode.type}`,
        };
    }

    // Source must produce outputs
    if (Object.keys(sourceDef.outputs).length === 0) {
        return {
            ...base,
            isValid: false,
            sourceType: 'void',
            targetType: 'any',
            error: `Source node ${sourceNode.type} has no outputs (terminal node)`,
        };
    }

    // Cannot connect INTO a trigger
    if (targetDef.category === 'triggers') {
        return {
            ...base,
            isValid: false,
            sourceType: 'unknown',
            targetType: 'unknown',
            error: `Cannot connect to trigger node ${targetNode.type}`,
        };
    }

    const sourceOutputName =
        edge.sourceHandle || edge.sourceOutput || Object.keys(sourceDef.outputs)[0];
    const sourceType = sourceDef.outputs[sourceOutputName] || 'any';
    const targetType = 'any'; // data flows in generically

    if (!areTypesCompatible(sourceType, targetType)) {
        return {
            ...base,
            isValid: false,
            sourceOutput: sourceOutputName,
            sourceType,
            targetType,
            error: `Type mismatch: ${sourceNode.type}.${sourceOutputName} (${sourceType}) -> ${targetNode.type} (${targetType})`,
        };
    }

    return {
        ...base,
        isValid: true,
        sourceOutput: sourceOutputName,
        sourceType,
        targetType,
    };
}

// ============ Workflow Validation ============

export interface WorkflowValidationError {
    type: 'invalid_connection' | 'missing_trigger' | 'orphan_node' | 'circular_dependency';
    message: string;
    edgeId?: string;
    nodeId?: string;
}

export interface WorkflowValidationWarning {
    type: 'type_coercion' | 'unused_output' | 'missing_input';
    message: string;
}

export interface WorkflowValidationResult {
    isValid: boolean;
    errors: WorkflowValidationError[];
    warnings: WorkflowValidationWarning[];
}

export function validateWorkflow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): WorkflowValidationResult {
    const errors: WorkflowValidationError[] = [];
    const warnings: WorkflowValidationWarning[] = [];

    // At least one trigger
    const triggerNodes = nodes.filter(n => getNodeDefinition(n.type)?.category === 'triggers');
    if (triggerNodes.length === 0) {
        errors.push({
            type: 'missing_trigger',
            message: 'Workflow must have at least one trigger node',
        });
    }
    if (triggerNodes.length > 1) {
        warnings.push({
            type: 'unused_output',
            message: 'Workflow has multiple trigger nodes (only one will be used)',
        });
    }

    // Orphan nodes (non-trigger nodes with no connections)
    const connectedNodeIds = new Set<string>();
    edges.forEach(edge => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
    });

    nodes.forEach(node => {
        if (!connectedNodeIds.has(node.id) && getNodeDefinition(node.type)?.category !== 'triggers') {
            warnings.push({
                type: 'unused_output',
                message: `Node ${node.id} (${node.type}) is not connected to the workflow`,
            });
        }
    });

    // Circular dependency detection (DFS)
    const adjacencyList = new Map<string, string[]>();
    nodes.forEach(node => adjacencyList.set(node.id, []));
    edges.forEach(edge => {
        const targets = adjacencyList.get(edge.source) || [];
        targets.push(edge.target);
        adjacencyList.set(edge.source, targets);
    });

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    function detectCycle(nodeId: string): boolean {
        visited.add(nodeId);
        recursionStack.add(nodeId);

        const neighbors = adjacencyList.get(nodeId) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                if (detectCycle(neighbor)) return true;
            } else if (recursionStack.has(neighbor)) {
                return true;
            }
        }

        recursionStack.delete(nodeId);
        return false;
    }

    for (const node of nodes) {
        if (!visited.has(node.id)) {
            if (detectCycle(node.id)) {
                errors.push({
                    type: 'circular_dependency',
                    message: 'Workflow contains circular dependencies',
                });
                break;
            }
        }
    }

    // Validate each edge
    edges.forEach(edge => {
        const result = validateEdgeConnection(edge, nodes);
        if (!result.isValid) {
            errors.push({
                type: 'invalid_connection',
                message: result.error || 'Invalid connection',
                edgeId: edge.id,
            });
        }
    });

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}
