/**
 * Durable AI Task Execution Manager
 * 
 * Manages the state of long-running AI tool-calling loops.
 * Because Serverless edge workers enforce strict execution timeouts (e.g. 10s CPU limit),
 * multi-turn agent loops can be reliably survived by persisting their state to cache
 * and asynchronously queuing up the next loop step.
 */

import { cacheProvider } from '../cache/index.js';
import { isQueueEnabled, publishExecution } from './queue.js';

export interface AITaskState {
    id: string;
    model: string;
    messages: any[]; // The cumulative conversation history
    tools?: Record<string, any>;
    maxSteps: number;
    currentStep: number;
    status: 'pending' | 'completed' | 'failed';
    options: Record<string, any>; // temperature, topP, etc
    result: any | null; // Final output (the assistant message)
    error?: string;
}

const AI_TASK_TTL = 3600; // 1 hour memory

function getTaskKey(taskId: string): string {
    return `ai:task:${taskId}`;
}

/**
 * Save current progression of the AI Task to Redis
 * @returns true if successful, false if Redis is unavailable
 */
export async function saveAITask(task: AITaskState): Promise<boolean> {
    try {
        await cacheProvider.setex(
            getTaskKey(task.id),
            AI_TASK_TTL,
            JSON.stringify(task)
        );
        return true;
    } catch {
        // Continue if Redis is unavailable - degrades gracefully to sync 
        return false;
    }
}

/**
 * Retrieve current AI Task progression from Redis
 */
export async function loadAITask(taskId: string): Promise<AITaskState | null> {
    try {
        const data = await cacheProvider.get<AITaskState>(getTaskKey(taskId));
        if (!data) return null;
        if (typeof data === 'string') return JSON.parse(data) as AITaskState;
        return data;
    } catch {
        return null; // Degrade gracefully
    }
}

/**
 * Cleanup task data after success/fail (optional, TTL covers it otherwise)
 */
export async function clearAITask(taskId: string): Promise<void> {
    try {
        await cacheProvider.del(getTaskKey(taskId));
    } catch {
        // Best effort
    }
}

/**
 * Dispatches an AI task to the async queue.
 * @returns true if successfully queued via QStash/CF Queues
 */
export async function dispatchAITask(taskId: string): Promise<boolean> {
    if (!isQueueEnabled()) return false;

    // Use FRONTBASE queue integration. Determine local/live URL
    const publicUrl = process.env.PUBLIC_URL || process.env.EDGE_URL || '';
    if (!publicUrl) return false;

    const destUrl = `${publicUrl}/v1/chat/completions/continue`;

    const msgId = await publishExecution(
        destUrl,
        {
            executionId: taskId,
            workflowId: 'ai-task', // dummy required by signature 
            parameters: { taskId },
            triggerType: 'ai-internal',
        },
        {
            retries: 3, 
            backoff: 'exponential'
        }
    );

    return msgId !== null;
}
