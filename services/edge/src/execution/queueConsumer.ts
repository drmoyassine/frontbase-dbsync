/**
 * Queue Consumer (Automations A10)
 *
 * Registers + implements the job handlers for `queue_trigger` workflows. When a
 * message lands on a watched queue, QStash/BullMQ pings
 * /api/queue/process?jobName=queue:<workflowId> and this handler executes the
 * workflow with the message payload.
 *
 * Also implements the `wf:resume:<executionId>` handler used by the delay node
 * (Automations A4) to resume a deferred execution from its checkpoint.
 *
 * Follows the same boot-registration pattern as engine/tickHandlers.ts.
 */

import { v4 as uuidv4 } from 'uuid';
import type { WorkflowData } from '../storage/IStateProvider.js';
import { stateProvider } from '../storage/index.js';
import { queueServiceReady } from '../services/queue/index.js';
import { executeWorkflow } from '../engine/runtime.js';
import { checkIdempotency, markIdempotency, generateIdempotencyKey } from './idempotency.js';
import { getWorkflowSpikeBuffer } from './spikeBuffer.js';

export const QUEUE_JOB = (workflowId: string) => `queue:${workflowId}`;
export const RESUME_JOB_PREFIX = 'wf:resume:';

export function isResumeJob(jobName: string): boolean {
    return jobName.startsWith(RESUME_JOB_PREFIX);
}

/**
 * Handle an inbound queue message for a queue-trigger workflow.
 * Resolves tenant from the workflow itself (no tenantSlug parameter needed).
 */
export async function handleQueueMessage(
    workflowId: string,
    message: Record<string, any>,
    _tenantSlug?: string, // Deprecated: tenant is resolved from workflow
): Promise<{ executionId: string; deduplicated?: boolean } | null> {
    // Look up workflow without tenant filtering to get its tenantSlug
    // This is safe because workflowId is a unqique identifier and we validate
    // the workflow is active before proceeding.
    const workflow = await stateProvider.getWorkflowById(workflowId);
    if (!workflow || !workflow.isActive) {
        console.log(`[QueueConsumer] Workflow ${workflowId} not found or inactive, skipping`);
        return null;
    }
    const tenantSlug = workflow.tenantSlug || '_default';

    // Idempotency: skip if this exact message was already processed.
    const idemKey = generateIdempotencyKey(workflowId, 'queue', message);
    const idem = await checkIdempotency(idemKey);
    if (idem.seen) {
        console.log(`[QueueConsumer] Duplicate message skipped (seen as ${idem.executionId})`);
        return { executionId: idem.executionId!, deduplicated: true };
    }

    const executionId = uuidv4();
    const now = new Date().toISOString();

    await stateProvider.createExecution({
        id: executionId,
        workflowId,
        status: 'started',
        triggerType: 'queue_trigger',
        triggerPayload: JSON.stringify(message),
        startedAt: now,
    });

    await markIdempotency(idemKey, executionId);

    const settings = workflow.settings ? JSON.parse(workflow.settings) : {};

    // Spike-level the actual execution.
    getWorkflowSpikeBuffer()
        .execute(() =>
            executeWorkflow(executionId, workflow, message, settings).catch((err) =>
                console.error(`[QueueConsumer] Execution ${executionId} failed:`, err),
            ),
        )
        .catch((err) => console.error('[QueueConsumer] Spike buffer rejected job:', err));

    return { executionId };
}

/**
 * Handle a deferred-execution resume (delay node). Re-runs the workflow with the
 * same executionId so the runtime resumes from its checkpoint.
 */
export async function handleResume(
    executionId: string,
    _data: Record<string, any>,
): Promise<void> {
    try {
        const execution = await stateProvider.getExecutionById(executionId);
        if (!execution) {
            console.warn(`[QueueConsumer] Resume: execution ${executionId} not found`);
            return;
        }
        const workflow = await stateProvider.getWorkflowById(execution.workflowId);
        if (!workflow) {
            console.warn(`[QueueConsumer] Resume: workflow ${execution.workflowId} not found`);
            return;
        }
        const settings = workflow.settings ? JSON.parse(workflow.settings) : {};
        // Re-execute with the SAME executionId → runtime loads checkpoint & resumes.
        await executeWorkflow(executionId, workflow, {}, settings);
    } catch (err) {
        console.error(`[QueueConsumer] Resume failed for ${executionId}:`, err);
    }
}

/**
 * Boot-time registration of queue-trigger handlers for all active workflows.
 * Idempotent. Mirrors registerTickHandlers().
 */
export async function registerQueueConsumers(): Promise<void> {
    try {
        const queue = await queueServiceReady;
        const workflows = await stateProvider.listWorkflows('_default');
        const queueWorkflows = workflows.filter(
            (w) => w.isActive && needsQueueTrigger(w.triggerType),
        );

        let registered = 0;
        for (const workflow of queueWorkflows) {
            const jobName = QUEUE_JOB(workflow.id);
            queue.process(jobName, async (data: any) => {
                // Tenant is resolved from the workflow itself by handleQueueMessage
                await handleQueueMessage(workflow.id, data || {});
            });
            registered++;
        }
        console.log(
            `[QueueConsumer] Registered ${registered} queue-trigger handlers for ${queueWorkflows.length} workflows`,
        );
    } catch (e: any) {
        console.warn(`[QueueConsumer] Failed to register (may be test env):`, e.message);
    }
}

/** Whether a workflow's triggerType string includes a queue trigger. */
export function needsQueueTrigger(triggerType: string): boolean {
    return (triggerType || '')
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .some((t) => t === 'queue' || t === 'queue_trigger');
}
