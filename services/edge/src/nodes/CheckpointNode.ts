/**
 * Manual Checkpoint Node (Automations A9)
 *
 * User-placeable explicit state save. The runtime already auto-checkpoints
 * after every node (see engine/runtime.ts); this node lets a workflow author
 * name a specific save point and surface it in execution metadata (useful inside
 * loops or before a risky branch). On resume, the runtime's existing checkpoint
 * loader restores all completed-node state.
 */

import type { WorkflowNode } from '../schemas/workflow.js';
import { saveCheckpoint } from '../engine/checkpoint.js';

export interface CheckpointNodeResult {
    checkpoint: string;
    timestamp: string;
    saved: boolean;
}

interface CheckpointContext {
    executionId: string;
    workflowId: string;
    nodeOutputs: Record<string, Record<string, any>>;
    nodeExecutions: any[];
}

/**
 * Execute a manual checkpoint node. Reads the checkpoint name from the node
 * config (input `name`) and persists an explicit named checkpoint.
 */
export async function executeCheckpointNode(
    node: WorkflowNode,
    inputs: Record<string, any>,
    context: CheckpointContext,
): Promise<CheckpointNodeResult> {
    const nodeInputs = node.inputs || node.data?.inputs || [];
    const getName = () => {
        const inp = (nodeInputs as any[]).find((i: any) => i.name === 'name');
        return inp?.value || `checkpoint-${node.id}`;
    };
    const checkpointName = getName();
    const timestamp = new Date().toISOString();

    const completed = (context.nodeExecutions || [])
        .filter((n: any) => n.status === 'completed')
        .map((n: any) => n.nodeId);

    let saved = false;
    try {
        await saveCheckpoint({
            executionId: context.executionId,
            workflowId: context.workflowId,
            completedNodes: completed,
            nodeOutputs: context.nodeOutputs,
            nodeExecutions: context.nodeExecutions,
        });
        saved = true;
    } catch (error) {
        console.error('[CheckpointNode] Failed to save checkpoint:', error);
    }

    return { checkpoint: checkpointName, timestamp, saved };
}
