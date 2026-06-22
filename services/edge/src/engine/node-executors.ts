/**
 * Node Executors — Individual node type handlers
 *
 * Extracted from runtime.ts for single-responsibility compliance.
 * Each function handles one workflow node type (data_request, http_request,
 * transform, condition, http_response, log).
 */

import type { WorkflowNode, NodeExecutionStatus } from '../schemas';
import type { NodeExecution } from './runtime.js';
import { executeEmailNode, validateEmailNode } from '../nodes/EmailNode.js';
import { executeDelayNode } from '../nodes/DelayNode.js';
import { executeLoopNode } from '../nodes/LoopNode.js';
import { executeCheckpointNode } from '../nodes/CheckpointNode.js';
import { executeQueueTrigger } from '../nodes/QueueTrigger.js';
import { executeEmailTrigger } from '../nodes/EmailTrigger.js';
import {
    getNodeOutput,
    setNodeOutput,
    isCacheableNodeType,
    getDefaultTTL,
} from '../execution/nodeCache.js';

/** Execution context subset needed by node-level helpers */
interface ExecutionContext {
    executionId: string;
    workflowId: string;
    parameters: Record<string, any>;
    nodeOutputs: Record<string, Record<string, any>>;
    nodeExecutions: NodeExecution[];
    variableMutations?: Array<{ scope: string; key: string; value: any }>;
}

/**
 * Execute a single node based on its type
 */
export async function executeNode(
    node: WorkflowNode,
    inputs: Record<string, any>,
    context: ExecutionContext
): Promise<Record<string, any>> {
    // Automations A8: node-level output cache for read-only node types.
    // Serves the last cached output keyed by a stable input hash.
    if (isCacheableNodeType(node.type)) {
        const ttlInput = (node.inputs || []).find((i: any) => i.name === 'cache_ttl')?.value;
        const ttl = typeof ttlInput === 'number' ? ttlInput : getDefaultTTL(node.type);
        const cached = await getNodeOutput(node.id, inputs, ttl, context.workflowId);
        if (cached.cached && cached.outputs !== undefined) {
            return cached.outputs;
        }
    }

    // Node type handlers
    switch (node.type) {
        case 'trigger':
        case 'manual_trigger':
            // Trigger nodes just pass through inputs
            return { ...inputs };

        case 'ui_event_trigger': {
            // UI event data is passed in via the trigger payload (inputs).
            // Surface a normalized event object for downstream nodes.
            const event = inputs?.event ?? inputs;
            return {
                timestamp: event?.timestamp ?? new Date().toISOString(),
                eventType: event?.eventType ?? event?.type ?? null,
                element: event?.element ?? null,
                value: event?.value ?? null,
                checked: event?.checked ?? null,
                coordinates: event?.coordinates ?? null,
                modifiers: event?.modifiers ?? null,
                key: event?.key ?? null,
                target: event?.target ?? null,
            };
        }

        case 'data_change_trigger': {
            // The poller fires execution with { changes, operation, count }.
            // Surface them as the node's outputs for downstream nodes.
            const payload = inputs?.changes !== undefined ? inputs : { changes: [], operation: 'any', count: 0 };
            const changes = Array.isArray(payload.changes) ? payload.changes : [];
            return {
                changes,
                operation: payload.operation ?? 'any',
                count: typeof payload.count === 'number' ? payload.count : changes.length,
            };
        }

        case 'schedule_trigger': {
            // Fires on a cron tick; pass through the trigger payload.
            return {
                timestamp: inputs?.timestamp ?? new Date().toISOString(),
                scheduledTime: inputs?.scheduledTime ?? inputs?.timestamp ?? null,
            };
        }

        case 'data_request': {
            const dataResult = await executeDataRequest(node, inputs);
            await cacheStore(node, inputs, context, dataResult);
            return dataResult;
        }

        case 'http_request': {
            const httpResult = await executeHttpRequest(node, inputs);
            await cacheStore(node, inputs, context, httpResult);
            return httpResult;
        }

        case 'transform':
        case 'json_transform': {
            const transformResult = executeTransform(node, inputs);
            await cacheStore(node, inputs, context, transformResult);
            return transformResult;
        }

        case 'condition':
        case 'if':
            return executeCondition(node, inputs);

        case 'log':
        case 'console':
            console.log(`[Node ${node.id}]:`, inputs);
            return { logged: true, data: inputs };

        case 'set_variable':
        case 'setVariable': {
            const nodeInputs = node.inputs || [];
            const getVal = (name: string) => {
                const inp = nodeInputs.find((i: any) => i.name === name);
                return inp?.value !== undefined ? inp.value : inputs[name];
            };
            const scope = getVal('scope') || 'local';
            const key = getVal('key');
            const rawValue = getVal('value');

            // Evaluate value dynamically if it's an expression or reference
            let evaluatedValue = rawValue;
            if (typeof rawValue === 'string') {
                try {
                    evaluatedValue = safeEval(rawValue, inputs);
                } catch (e) {
                    evaluatedValue = rawValue;
                }
            }

            // Append mutation to context.variableMutations
            if (context.variableMutations) {
                context.variableMutations.push({
                    scope,
                    key,
                    value: evaluatedValue
                });
            }

            console.log(`[Set Variable Node] scope=${scope}, key=${key}, value=`, evaluatedValue);
            return { scope, key, value: evaluatedValue };
        }

        case 'http_response': {
            // Extract response config from node inputs
            const nodeInputs = node.inputs || [];
            const getVal = (name: string) => {
                const inp = nodeInputs.find((i: any) => i.name === name);
                return inp?.value !== undefined ? inp.value : inputs[name];
            };
            return {
                statusCode: getVal('statusCode') || 200,
                body: getVal('body') ?? inputs,
                headers: getVal('headers'),
                contentType: getVal('contentType') || 'application/json',
            };
        }

        // ── Automations A3: Email node ──
        case 'email':
        case 'send_email': {
            const validation = validateEmailNode(inputs);
            if (!validation.valid) {
                throw new Error(`Email node validation failed: ${validation.errors.join(', ')}`);
            }
            return await executeEmailNode(inputs);
        }

        // ── Automations A4: Delay / wait node ──
        case 'delay':
        case 'wait': {
            return await executeDelayNode({
                ...inputs,
                _executionId: context.executionId,
                _workflowId: context.workflowId,
                _nodeId: node.id,
            });
        }

        // ── Automations A5: Loop / iterator node ──
        case 'loop':
        case 'iterator': {
            return await executeLoopNode(inputs);
        }

        // ── Automations A9: Manual checkpoint node ──
        case 'checkpoint': {
            return await executeCheckpointNode(node, inputs, {
                executionId: context.executionId,
                workflowId: context.workflowId,
                nodeOutputs: context.nodeOutputs,
                nodeExecutions: context.nodeExecutions,
            });
        }

        // ── Automations A10: Queue trigger node ──
        case 'queue_trigger': {
            return executeQueueTrigger(inputs);
        }

        // ── Automations A11: Email received trigger node ──
        case 'email_trigger': {
            return executeEmailTrigger(inputs);
        }

        default:
            // Generic pass-through for unknown types
            console.warn(`Unknown node type: ${node.type}`);
            return { ...inputs };
    }
}

/**
 * Automations A8: store a node's output in the node cache (cacheable types only).
 */
async function cacheStore(
    node: WorkflowNode,
    inputs: Record<string, any>,
    context: ExecutionContext,
    outputs: Record<string, any>,
): Promise<void> {
    if (!isCacheableNodeType(node.type)) return;
    try {
        const ttlInput = (node.inputs || []).find((i: any) => i.name === 'cache_ttl')?.value;
        const ttl = typeof ttlInput === 'number' ? ttlInput : getDefaultTTL(node.type);
        await setNodeOutput(node.id, inputs, outputs, ttl, context.workflowId);
    } catch (error) {
        console.error('[NodeCache] Store in executeNode failed:', error);
    }
}

/**
 * Data Request Node - Query database via FastAPI proxy
 */
async function executeDataRequest(
    node: WorkflowNode,
    inputs: Record<string, any>
): Promise<Record<string, any>> {
    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

    // Get node configuration - check multiple sources
    const nodeData = node.data || {};
    const nodeInputs = nodeData.inputs || node.inputs || [];

    // Extract config from node inputs array
    const getInputValue = (name: string) => {
        // First check in node.data.inputs array format
        if (Array.isArray(nodeInputs)) {
            const input = nodeInputs.find((i: any) => i.name === name);
            if (input?.value !== undefined) return input.value;
        }
        // Then check in node.data directly (flat format)
        if (nodeData[name] !== undefined) return nodeData[name];
        // Finally check in workflow inputs
        return inputs[name];
    };

    const dataSource = getInputValue('dataSource');
    const table = getInputValue('table');
    const operation = getInputValue('operation') || 'select';
    const selectFields = getInputValue('selectFields') || [];
    const whereConditions = getInputValue('whereConditions') || [];
    const limit = getInputValue('limit') || 100;
    const returnData = getInputValue('returnData') !== false;

    console.log(`[Data Request] table=${table}, operation=${operation}`);

    if (!table) {
        return {
            success: false,
            error: 'Table is required',
            data: [],
            rowCount: 0,
        };
    }

    try {
        // Build select fields
        let selectParam = '*';
        if (Array.isArray(selectFields) && selectFields.length > 0) {
            selectParam = selectFields
                .map((f: any) => f.key || f.name || f)
                .filter(Boolean)
                .join(',') || '*';
        }

        // Build query URL using existing FastAPI endpoint
        const queryUrl = new URL(`${BACKEND_URL}/api/database/table-data/${table}/`);
        queryUrl.searchParams.set('limit', String(limit));
        queryUrl.searchParams.set('select', selectParam);
        queryUrl.searchParams.set('mode', 'builder'); // Use service key for Actions

        // Add WHERE conditions as filters
        if (Array.isArray(whereConditions) && whereConditions.length > 0) {
            whereConditions.forEach((condition: any) => {
                if (condition.key && condition.value !== undefined) {
                    queryUrl.searchParams.set(`filter_${condition.key}`, String(condition.value));
                }
            });
        }

        console.log(`[Data Request] Fetching: ${queryUrl.toString()}`);

        const response = await fetch(queryUrl.toString(), {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Data Request] Error: ${response.status} - ${errorText}`);
            return {
                success: false,
                error: `Query failed: ${response.status} - ${errorText}`,
                data: [],
                rowCount: 0,
            };
        }

        const result = await response.json();
        const data = returnData ? (result.data || result.rows || []) : [];
        const total = result.total || data.length;

        console.log(`[Data Request] Success: ${data.length} rows (total: ${total})`);

        return {
            success: true,
            data,
            rowCount: data.length,
            total,
        };
    } catch (error: any) {
        console.error(`[Data Request] Error:`, error);
        return {
            success: false,
            error: error.message || 'Query execution failed',
            data: [],
            rowCount: 0,
        };
    }
}

/**
 * HTTP Request Node
 */
async function executeHttpRequest(
    node: WorkflowNode,
    inputs: Record<string, any>
): Promise<Record<string, any>> {
    const nodeInputs = node.inputs || [];
    const url = inputs.url || nodeInputs.find(i => i.name === 'url')?.value;
    const method = inputs.method || nodeInputs.find(i => i.name === 'method')?.value || 'GET';
    const headers = inputs.headers || nodeInputs.find(i => i.name === 'headers')?.value || {};
    const body = inputs.body || nodeInputs.find(i => i.name === 'body')?.value;

    const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => response.text());

    return {
        status: response.status,
        ok: response.ok,
        data,
    };
}

// The expression engine (safeEval + helpers) lives in engine/expr.ts so that
// nodes/LoopNode.ts can import it without forming a circular dependency with
// this module. Imported for local use and re-exported for backward compat.
import { safeEval } from './expr.js';
export { safeEval };

/**
 * Transform Node
 */
function executeTransform(
    node: WorkflowNode,
    inputs: Record<string, any>
): Record<string, any> {
    const expression = (node.inputs || []).find(i => i.name === 'expression')?.value;

    if (expression && typeof expression === 'string') {
        try {
            return { result: safeEval(expression, inputs) };
        } catch (e) {
            return { result: inputs, error: 'Transform expression failed' };
        }
    }

    return { result: inputs };
}

/**
 * Condition Node
 */
function executeCondition(
    node: WorkflowNode,
    inputs: Record<string, any>
): Record<string, any> {
    const condition = (node.inputs || []).find(i => i.name === 'condition')?.value;
    let result = false;

    if (condition && typeof condition === 'string') {
        try {
            result = !!safeEval(condition, inputs);
        } catch (e) {
            result = false;
        }
    }

    return { result, branch: result ? 'true' : 'false', data: inputs };
}

/**
 * Update node status in context
 */
export function updateNodeStatus(
    context: ExecutionContext,
    nodeId: string,
    status: NodeExecutionStatus,
    outputs?: Record<string, any>,
    error?: string
) {
    const execution = context.nodeExecutions.find(n => n.nodeId === nodeId);
    if (execution) {
        execution.status = status;
        if (outputs) execution.outputs = outputs;
        if (error) execution.error = error;
    }
}

/**
 * Update execution status in database
 */
export async function updateExecutionStatus(
    executionId: string,
    status: string,
    nodeExecutions: NodeExecution[],
    stateProvider: any
) {
    await stateProvider.updateExecution(executionId, {
        status,
        nodeExecutions: JSON.stringify(nodeExecutions),
    });
}
