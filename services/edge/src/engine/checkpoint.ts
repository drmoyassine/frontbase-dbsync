/**
 * Durable Execution Checkpoints
 * 
 * Saves workflow execution state to Redis after each node completes.
 * If the Edge Worker dies mid-execution (e.g., CF 10ms CPU limit),
 * the checkpoint allows resuming from the last completed node on retry.
 * 
 * Key format: exec:{executionId}:checkpoint
 * TTL: 1 hour (auto-cleanup for completed/abandoned executions)
 * 
 * Graceful fallback: if Redis is unavailable, checkpoint ops are no-ops.
 */

import { cacheProvider } from '../cache/index.js';
import type { NodeExecution } from './runtime.js';

export interface Checkpoint {
    executionId: string;
    workflowId: string;
    completedNodes: string[];
    nodeOutputs: Record<string, Record<string, any>>;
    nodeExecutions: NodeExecution[];
}

const CHECKPOINT_TTL = 3600; // 1 hour

function checkpointKey(executionId: string): string {
    return `exec:${executionId}:checkpoint`;
}

/**
 * Save a checkpoint after a node completes.
 * Overwrites the previous checkpoint for this execution.
 */
export async function saveCheckpoint(cp: Checkpoint): Promise<void> {
    try {
        await cacheProvider.setex(
            checkpointKey(cp.executionId),
            CHECKPOINT_TTL,
            JSON.stringify(cp)
        );
    } catch {
        // Redis unavailable — continue without checkpoints
    }
}

/**
 * Load a checkpoint for a given execution.
 * Returns null if no checkpoint exists or Redis is unavailable.
 */
export async function loadCheckpoint(executionId: string): Promise<Checkpoint | null> {
    try {
        const data = await cacheProvider.get<Checkpoint>(checkpointKey(executionId));
        if (!data) return null;
        // Handle both string and pre-parsed object (Upstash returns parsed)
        if (typeof data === 'string') return JSON.parse(data) as Checkpoint;
        return data;
    } catch {
        return null;
    }
}

/**
 * Clear the checkpoint after successful completion or permanent failure.
 */
export async function clearCheckpoint(executionId: string): Promise<void> {
    try {
        await cacheProvider.del(checkpointKey(executionId));
    } catch {
        // Best-effort cleanup — TTL will handle it regardless
    }
}
