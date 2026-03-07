/**
 * Workflow Execution Engine
 * 
 * Core runtime logic for executing workflow nodes.
 * Handles node traversal, parameter resolution, and state updates.
 * 
 * Provider-agnostic: uses stateProvider instead of Drizzle ORM.
 * 
 * Settings enforcement: timeout, cooldown, timezone, log level.
 */

import { stateProvider } from '../storage/index.js';
import type { WorkflowData } from '../storage/IStateProvider.js';
import { WorkflowNode, WorkflowEdge, NodeExecutionStatus } from '../schemas';
import { saveCheckpoint, loadCheckpoint, clearCheckpoint } from './checkpoint.js';
import { createWorkflowLogger, type LogLevel, type WorkflowLogger } from './logger.js';
import { cacheProvider } from '../cache/index.js';
import { executeNode, updateNodeStatus, updateExecutionStatus } from './node-executors.js';

/** Parsed workflow settings passed from route handlers */
export interface WorkflowSettings {
    execution_timeout_ms?: number;
    cooldown_ms?: number;
    timezone?: string;
    log_level?: LogLevel;
    dlq_enabled?: boolean;
    [key: string]: any;
}

export interface NodeExecution {
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

export interface ExecutionResult {
    status: 'completed' | 'error';
    result: Record<string, any>;
    error?: string;
    httpResponse?: {
        statusCode: number;
        body: any;
        headers?: Record<string, string>;
        contentType?: string;
    };
}

/**
 * Execute a workflow with full settings enforcement.
 * 
 * Settings enforced:
 * - execution_timeout_ms: kills execution after N ms
 * - cooldown_ms: sets a cooldown key after successful completion
 * - timezone: formats startedAt/endedAt in configured timezone
 * - log_level: controls console output verbosity
 * - dlq_enabled: writes to dead_letters table on final failure
 */
export async function executeWorkflow(
    executionId: string,
    workflow: WorkflowData,
    inputParameters: Record<string, any>,
    settings?: WorkflowSettings
): Promise<ExecutionResult> {
    const s = settings || (workflow.settings ? JSON.parse(workflow.settings) : {});
    const timeoutMs = s.execution_timeout_ms || 30000;
    const cooldownMs = s.cooldown_ms || 0;
    const tz = s.timezone || 'UTC';
    const log = createWorkflowLogger(s.log_level || 'all', `[Workflow:${executionId.slice(0, 8)}]`);

    /** Format a Date in the workflow's configured timezone */
    const formatTime = () => {
        try {
            return new Date().toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T');
        } catch {
            return new Date().toISOString();
        }
    };
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

    // Core execution logic wrapped for timeout race
    async function coreExecute(): Promise<ExecutionResult> {
        try {
            // ── Checkpoint resume: restore state from a previous attempt ──
            const checkpoint = await loadCheckpoint(executionId);
            const executed = new Set<string>();

            if (checkpoint) {
                log.info(`Resuming from checkpoint (${checkpoint.completedNodes.length} nodes done)`);
                for (const nodeId of checkpoint.completedNodes) {
                    executed.add(nodeId);
                }
                Object.assign(context.nodeOutputs, checkpoint.nodeOutputs);
                context.nodeExecutions = checkpoint.nodeExecutions;
            }

            // Update status to executing
            await updateExecutionStatus(executionId, 'executing', context.nodeExecutions, stateProvider);

            // Find start nodes (nodes with no incoming edges)
            const targetNodeIds = new Set(edges.map(e => e.target));
            const startNodes = nodes.filter(n => !targetNodeIds.has(n.id));

            // Execute nodes in topological order
            const queue = [...startNodes.map(n => n.id)];

            while (queue.length > 0) {
                const nodeId = queue.shift()!;

                if (executed.has(nodeId)) {
                    // Already completed (from checkpoint) — still queue downstream
                    const outgoingEdges = edges.filter(e => e.source === nodeId);
                    for (const edge of outgoingEdges) {
                        if (!executed.has(edge.target)) {
                            queue.push(edge.target);
                        }
                    }
                    continue;
                }

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
                    if (edge.targetInput && edge.sourceOutput) {
                        inputs[edge.targetInput] = sourceOutputs[edge.sourceOutput];
                    }
                }

                // Merge with workflow parameters for trigger nodes
                if (startNodes.some(n => n.id === nodeId)) {
                    Object.assign(inputs, context.parameters);
                }

                // Execute the node
                try {
                    updateNodeStatus(context, nodeId, 'executing');

                    const outputs = await executeNode(node, inputs, context);

                    context.nodeOutputs[nodeId] = outputs;
                    updateNodeStatus(context, nodeId, 'completed', outputs);
                    executed.add(nodeId);
                    log.info(`Node ${node.type || nodeId} completed`);

                    // ── Checkpoint: save progress after each node ──
                    await saveCheckpoint({
                        executionId,
                        workflowId: workflow.id,
                        completedNodes: Array.from(executed),
                        nodeOutputs: context.nodeOutputs,
                        nodeExecutions: context.nodeExecutions,
                    });

                    // Queue downstream nodes
                    const outgoingEdges = edges.filter(e => e.source === nodeId);
                    for (const edge of outgoingEdges) {
                        if (!executed.has(edge.target)) {
                            queue.push(edge.target);
                        }
                    }
                } catch (error: any) {
                    updateNodeStatus(context, nodeId, 'error', undefined, error.message);
                    log.error(`Node ${node?.type || nodeId} failed: ${error.message}`);
                    // Leave checkpoint in Redis for retry (TTL 1h)
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

            // Check for http_response node output
            const responseNode = endNodes.find(n => n.type === 'http_response');
            let httpResponse: ExecutionResult['httpResponse'] = undefined;
            if (responseNode && context.nodeOutputs[responseNode.id]) {
                const out = context.nodeOutputs[responseNode.id];
                httpResponse = {
                    statusCode: out.statusCode || 200,
                    body: out.body,
                    headers: out.headers,
                    contentType: out.contentType || 'application/json',
                };
            }

            // ── Flush to Turso (single write) + clear checkpoint ──
            await stateProvider.updateExecution(executionId, {
                status: 'completed',
                nodeExecutions: JSON.stringify(context.nodeExecutions),
                result: JSON.stringify(result),
                endedAt: formatTime(),
            });
            await clearCheckpoint(executionId);

            // ── Set cooldown after successful completion ──
            if (cooldownMs > 0) {
                try {
                    const cooldownSec = Math.ceil(cooldownMs / 1000);
                    await cacheProvider.setex(`wf:${workflow.id}:cooldown`, cooldownSec, '1');
                } catch {
                    // Best-effort — Redis unavailable
                }
            }

            log.info(`Execution completed (${executed.size} nodes)`);
            return { status: 'completed', result, httpResponse };

        } catch (error: any) {
            // ── Write to dead_letters if DLQ enabled and no queue ──
            if (s.dlq_enabled) {
                try {
                    await stateProvider.createDeadLetter?.({
                        id: crypto.randomUUID?.() || executionId + '-dlq',
                        workflowId: workflow.id,
                        executionId,
                        error: error.message,
                        payload: JSON.stringify(inputParameters),
                    });
                } catch {
                    // Best-effort DLQ write
                }
            }

            // Mark as error
            await stateProvider.updateExecution(executionId, {
                status: 'error',
                nodeExecutions: JSON.stringify(context.nodeExecutions),
                error: error.message,
                endedAt: formatTime(),
            });

            log.error(`Execution failed: ${error.message}`);
            return { status: 'error', result: {}, error: error.message };
        }
    } // end coreExecute

    // ── Timeout enforcement ──
    const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(
            `Execution timed out after ${timeoutMs}ms`
        )), timeoutMs)
    );

    return Promise.race([coreExecute(), timeoutPromise]);
}

/**
 * Execute a single node (and its upstream dependencies)
 * This is for testing individual nodes without running the entire workflow
 */
export async function executeSingleNode(
    executionId: string,
    workflow: WorkflowData,
    targetNodeId: string,
    inputParameters: Record<string, any>
): Promise<void> {
    const nodes: WorkflowNode[] = JSON.parse(workflow.nodes);
    const edges: WorkflowEdge[] = JSON.parse(workflow.edges);

    const targetNode = nodes.find(n => n.id === targetNodeId);
    if (!targetNode) {
        throw new Error(`Node ${targetNodeId} not found in workflow`);
    }

    const context: ExecutionContext = {
        executionId,
        workflowId: workflow.id,
        parameters: inputParameters,
        nodeOutputs: {},
        nodeExecutions: [],
    };

    try {
        // Update status to executing
        await updateExecutionStatus(executionId, 'executing', context.nodeExecutions, stateProvider);

        // Find all upstream nodes needed to execute the target
        const upstreamNodes = getUpstreamNodes(targetNodeId, nodes, edges);
        const nodesToExecute = [...upstreamNodes, targetNodeId];

        // Initialize node executions for only the nodes we're running
        context.nodeExecutions = nodesToExecute.map(nodeId => ({
            nodeId,
            status: 'idle' as NodeExecutionStatus,
        }));

        // Execute nodes in dependency order
        const executed = new Set<string>();
        const queue = [...nodesToExecute];

        while (queue.length > 0) {
            const nodeId = queue.shift()!;
            if (executed.has(nodeId)) continue;

            const node = nodes.find(n => n.id === nodeId);
            if (!node) continue;

            // Check dependencies
            const incomingEdges = edges.filter(e => e.target === nodeId);
            const dependenciesMet = incomingEdges.every(e =>
                !nodesToExecute.includes(e.source) || executed.has(e.source)
            );

            if (!dependenciesMet) {
                queue.push(nodeId);
                continue;
            }

            // Resolve inputs
            const inputs: Record<string, any> = {};
            for (const edge of incomingEdges) {
                const sourceOutputs = context.nodeOutputs[edge.source] || {};
                if (edge.targetInput && edge.sourceOutput) {
                    inputs[edge.targetInput] = sourceOutputs[edge.sourceOutput];
                }
            }

            // Merge workflow parameters for trigger nodes
            const allTargetNodeIds = new Set(edges.map(e => e.target));
            if (!allTargetNodeIds.has(nodeId)) {
                Object.assign(inputs, context.parameters);
            }

            // Execute
            try {
                updateNodeStatus(context, nodeId, 'executing');
                await updateExecutionStatus(executionId, 'executing', context.nodeExecutions, stateProvider);

                const outputs = await executeNode(node, inputs, context);

                context.nodeOutputs[nodeId] = outputs;
                updateNodeStatus(context, nodeId, 'completed', outputs);
                executed.add(nodeId);
            } catch (error: any) {
                updateNodeStatus(context, nodeId, 'error', undefined, error.message);
                throw error;
            }
        }

        // Result is just the target node's output
        const result = {
            [targetNodeId]: context.nodeOutputs[targetNodeId],
        };

        await stateProvider.updateExecution(executionId, {
            status: 'completed',
            nodeExecutions: JSON.stringify(context.nodeExecutions),
            result: JSON.stringify(result),
            endedAt: new Date().toISOString(),
        });

    } catch (error: any) {
        await stateProvider.updateExecution(executionId, {
            status: 'error',
            nodeExecutions: JSON.stringify(context.nodeExecutions),
            error: error.message,
            endedAt: new Date().toISOString(),
        });
    }
}

/**
 * Get all upstream nodes required to execute a target node
 */
function getUpstreamNodes(targetNodeId: string, nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
    const upstream: string[] = [];
    const visited = new Set<string>();
    const queue = [targetNodeId];

    while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        const incomingEdges = edges.filter(e => e.target === nodeId);
        for (const edge of incomingEdges) {
            if (!visited.has(edge.source)) {
                upstream.push(edge.source);
                queue.push(edge.source);
            }
        }
    }

    return upstream;
}

