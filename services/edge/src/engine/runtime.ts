/**
 * Workflow Execution Engine
 * 
 * Core runtime logic for executing workflow nodes.
 * Handles node traversal, parameter resolution, and state updates.
 */

import { db } from '../db';
import { executions, Workflow as DbWorkflow } from '../db/schema';
import { eq } from 'drizzle-orm';
import { WorkflowNode, WorkflowEdge, NodeExecutionStatus } from '../schemas';

interface NodeExecution {
    nodeId: string;
    status: NodeExecutionStatus;
    outputs?: Record<string, any>;
    error?: string;
    usage?: number;
}

interface ExecutionContext {
    executionId: string;
    workflowId: string;
    parameters: Record<string, any>;
    nodeOutputs: Record<string, Record<string, any>>;
    nodeExecutions: NodeExecution[];
}

/**
 * Execute a workflow
 */
export async function executeWorkflow(
    executionId: string,
    workflow: DbWorkflow,
    inputParameters: Record<string, any>
): Promise<void> {
    const nodes: WorkflowNode[] = JSON.parse(workflow.nodes);
    const edges: WorkflowEdge[] = JSON.parse(workflow.edges);

    const context: ExecutionContext = {
        executionId,
        workflowId: workflow.id,
        parameters: inputParameters,
        nodeOutputs: {},
        nodeExecutions: nodes.map(n => ({
            nodeId: n.id,
            status: 'idle' as NodeExecutionStatus,
        })),
    };

    try {
        // Update status to executing
        await updateExecutionStatus(executionId, 'executing', context.nodeExecutions);

        // Find start nodes (nodes with no incoming edges)
        const targetNodeIds = new Set(edges.map(e => e.target));
        const startNodes = nodes.filter(n => !targetNodeIds.has(n.id));

        // Execute nodes in topological order
        const executed = new Set<string>();
        const queue = [...startNodes.map(n => n.id)];

        while (queue.length > 0) {
            const nodeId = queue.shift()!;

            if (executed.has(nodeId)) continue;

            const node = nodes.find(n => n.id === nodeId);
            if (!node) continue;

            // Check if all dependencies are satisfied
            const incomingEdges = edges.filter(e => e.target === nodeId);
            const dependenciesMet = incomingEdges.every(e => executed.has(e.source));

            if (!dependenciesMet) {
                queue.push(nodeId); // Re-queue for later
                continue;
            }

            // Resolve inputs from connected nodes
            const inputs: Record<string, any> = {};
            for (const edge of incomingEdges) {
                const sourceOutputs = context.nodeOutputs[edge.source] || {};
                inputs[edge.targetInput] = sourceOutputs[edge.sourceOutput];
            }

            // Merge with workflow parameters for trigger nodes
            if (startNodes.some(n => n.id === nodeId)) {
                Object.assign(inputs, context.parameters);
            }

            // Execute the node
            try {
                updateNodeStatus(context, nodeId, 'executing');
                await updateExecutionStatus(executionId, 'executing', context.nodeExecutions);

                const outputs = await executeNode(node, inputs, context);

                context.nodeOutputs[nodeId] = outputs;
                updateNodeStatus(context, nodeId, 'completed', outputs);
                executed.add(nodeId);

                // Queue downstream nodes
                const outgoingEdges = edges.filter(e => e.source === nodeId);
                for (const edge of outgoingEdges) {
                    if (!executed.has(edge.target)) {
                        queue.push(edge.target);
                    }
                }
            } catch (error: any) {
                updateNodeStatus(context, nodeId, 'error', undefined, error.message);
                throw error;
            }
        }

        // Collect final outputs (from nodes with no outgoing edges)
        const sourceNodeIds = new Set(edges.map(e => e.source));
        const endNodes = nodes.filter(n => !sourceNodeIds.has(n.id));
        const result: Record<string, any> = {};
        for (const node of endNodes) {
            result[node.id] = context.nodeOutputs[node.id];
        }

        // Mark as completed
        await db.update(executions)
            .set({
                status: 'completed',
                nodeExecutions: JSON.stringify(context.nodeExecutions),
                result: JSON.stringify(result),
                endedAt: new Date().toISOString(),
            })
            .where(eq(executions.id, executionId));

    } catch (error: any) {
        // Mark as error
        await db.update(executions)
            .set({
                status: 'error',
                nodeExecutions: JSON.stringify(context.nodeExecutions),
                error: error.message,
                endedAt: new Date().toISOString(),
            })
            .where(eq(executions.id, executionId));
    }
}

/**
 * Execute a single node based on its type
 */
async function executeNode(
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
    const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

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
        const queryUrl = new URL(`${FASTAPI_URL}/api/database/table-data/${table}/`);
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
    const url = inputs.url || node.inputs.find(i => i.name === 'url')?.value;
    const method = inputs.method || node.inputs.find(i => i.name === 'method')?.value || 'GET';
    const headers = inputs.headers || node.inputs.find(i => i.name === 'headers')?.value || {};
    const body = inputs.body || node.inputs.find(i => i.name === 'body')?.value;

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

/**
 * Transform Node
 */
function executeTransform(
    node: WorkflowNode,
    inputs: Record<string, any>
): Record<string, any> {
    const expression = node.inputs.find(i => i.name === 'expression')?.value;

    if (expression && typeof expression === 'string') {
        try {
            // Simple expression evaluation (could use jmespath or similar)
            const fn = new Function('data', `return ${expression}`);
            return { result: fn(inputs) };
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
    const condition = node.inputs.find(i => i.name === 'condition')?.value;
    let result = false;

    if (condition && typeof condition === 'string') {
        try {
            const fn = new Function('data', `return !!(${condition})`);
            result = fn(inputs);
        } catch (e) {
            result = false;
        }
    }

    return { result, branch: result ? 'true' : 'false', data: inputs };
}

/**
 * Update node status in context
 */
function updateNodeStatus(
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
async function updateExecutionStatus(
    executionId: string,
    status: string,
    nodeExecutions: NodeExecution[]
) {
    await db.update(executions)
        .set({
            status,
            nodeExecutions: JSON.stringify(nodeExecutions),
        })
        .where(eq(executions.id, executionId));
}
