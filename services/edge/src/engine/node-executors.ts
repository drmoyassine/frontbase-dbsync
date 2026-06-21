/**
 * Node Executors — Individual node type handlers
 *
 * Extracted from runtime.ts for single-responsibility compliance.
 * Each function handles one workflow node type (data_request, http_request,
 * transform, condition, http_response, log).
 */

import type { WorkflowNode, NodeExecutionStatus } from '../schemas';
import type { NodeExecution } from './runtime.js';

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

        case 'data_request':
            return await executeDataRequest(node, inputs);

        case 'http_request':
            return await executeHttpRequest(node, inputs);

        case 'transform':
        case 'json_transform':
            return executeTransform(node, inputs);

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

        default:
            // Generic pass-through for unknown types
            console.warn(`Unknown node type: ${node.type}`);
            return { ...inputs };
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

function normalizeExpression(expr: string): string {
    return expr
        .replace(/\[['"]([^'"]+)['"]\]/g, '.$1')
        .replace(/\[(\d+)\]/g, '.$1');
}

function getPath(obj: any, path: string): any {
    const parts = path.trim().split('.');
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }
    return current;
}

export function safeEval(expression: string, data: Record<string, any>): any {
    expression = normalizeExpression(expression.trim());

    if (expression === 'true') return true;
    if (expression === 'false') return false;
    if (expression === 'null') return null;
    if (expression === 'undefined') return undefined;

    if (/^\d+(\.\d+)?$/.test(expression)) {
        return Number(expression);
    }

    const stringMatch = expression.match(/^['"](.*)['"]$/);
    if (stringMatch) {
        return stringMatch[1];
    }

    if (expression.startsWith('!')) {
        return !safeEval(expression.substring(1), data);
    }

    if (expression.includes('||')) {
        const parts = expression.split('||');
        for (const part of parts) {
            const val = safeEval(part, data);
            if (val) return val;
        }
        return safeEval(parts[parts.length - 1], data);
    }

    if (expression.includes('&&')) {
        const parts = expression.split('&&');
        let val: any = true;
        for (const part of parts) {
            val = safeEval(part, data);
            if (!val) return val;
        }
        return val;
    }

    const operators = ['===', '!==', '==', '!=', '>=', '<=', '>', '<'];
    for (const op of operators) {
        if (expression.includes(op)) {
            const parts = expression.split(op).map(p => p.trim());
            if (parts.length === 2) {
                const left = safeEval(parts[0], data);
                const right = safeEval(parts[1], data);
                switch (op) {
                    case '===':
                    case '==':
                        return left === right;
                    case '!==':
                    case '!=':
                        return left !== right;
                    case '>=':
                        return left >= right;
                    case '<=':
                        return left <= right;
                    case '>':
                        return left > right;
                    case '<':
                        return left < right;
                }
            }
        }
    }

    if (expression === 'data') return data;
    if (expression.startsWith('data.')) {
        return getPath({ data }, expression);
    }

    return getPath(data, expression);
}

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
