/**
 * Trigger Scheduler (Phase 3)
 *
 * Lifecycle helpers that register recurring schedules for data_change and
 * scheduled workflows, and tear them down on delete/inactive. Reuses the
 * existing QueueService.schedule()/unschedule() + the /api/queue/process
 * dispatch (the schedule pings `dc:<workflowId>` / `sched:<workflowId>` job
 * names, whose handlers are registered via process()).
 */

import type { WorkflowData } from '../storage/IStateProvider.js';
import { queueServiceReady } from '../services/queue/index.js';
import type { QueueService, ScheduleHandle } from '../services/queue/types.js';

export const DC_JOB = (workflowId: string) => `dc:${workflowId}`;
export const SCHEDULED_JOB = (workflowId: string) => `sched:${workflowId}`;

/** Floor a polling interval (seconds) to a QStash-compatible cron (≥ 1 minute). */
export function pollingIntervalToCron(seconds: number): string {
    const minutes = Math.max(1, Math.ceil((seconds || 60) / 60));
    return `*/${minutes} * * * *`;
}

/** Parse a workflow's triggerConfig (JSON string) into an object. */
export function parseTriggerConfig(workflow: Pick<WorkflowData, 'triggerConfig'>): Record<string, any> {
    try {
        return workflow.triggerConfig ? JSON.parse(workflow.triggerConfig) : {};
    } catch {
        return {};
    }
}

/** Whether the workflow uses a trigger type that needs scheduling. */
export function needsSchedule(triggerType: string): { dataChange: boolean; scheduled: boolean } {
    const types = (triggerType || '').split(',').map((t) => t.trim().toLowerCase());
    return {
        dataChange: types.includes('data_change'),
        scheduled: types.includes('scheduled'),
    };
}

/**
 * Register (or re-register) schedules for a workflow after deploy.
 * Returns the schedule handles to persist in workflow.settings.schedules.
 * Idempotent at the caller level: call unscheduleStored first on re-publish.
 */
export async function scheduleWorkflowTriggers(workflow: WorkflowData): Promise<ScheduleHandle[]> {
    const queue: QueueService = await queueServiceReady;
    if (!queue.schedule) throw new Error('Scheduler not available (provider has no schedule())');

    const cfg = parseTriggerConfig(workflow);
    const { dataChange, scheduled } = needsSchedule(workflow.triggerType);
    const handles: ScheduleHandle[] = [];

    if (dataChange) {
        const intervalSec = Number(cfg.pollingInterval ?? 30);
        handles.push(await queue.schedule(DC_JOB(workflow.id), { workflowId: workflow.id }, { cron: pollingIntervalToCron(intervalSec) }));
    }
    if (scheduled) {
        const cron = cfg.cronExpression || cfg.cron || '* * * * *';
        handles.push(await queue.schedule(SCHEDULED_JOB(workflow.id), { workflowId: workflow.id }, { cron }));
    }
    return handles;
}

/** Tear down schedules by their stored handles. */
export async function unscheduleWorkflowTriggers(handles: ScheduleHandle[]): Promise<void> {
    const queue: QueueService = await queueServiceReady;
    if (!queue.unschedule) return;
    for (const h of handles) {
        try {
            await queue.unschedule(h.scheduleId);
        } catch {
            // best-effort teardown
        }
    }
}

/** Persist schedule handles into the workflow's settings JSON (no D1 migration). */
export function withScheduleMeta(settings: string | null, handles: ScheduleHandle[]): string {
    let parsed: Record<string, any> = {};
    try { parsed = settings ? JSON.parse(settings) : {}; } catch { parsed = {}; }
    parsed.schedules = handles;
    return JSON.stringify(parsed);
}

/** Extract stored schedule handles from settings JSON. */
export function readScheduleMeta(settings: string | null): ScheduleHandle[] {
    try {
        const parsed = settings ? JSON.parse(settings) : {};
        return Array.isArray(parsed.schedules) ? parsed.schedules : [];
    } catch {
        return [];
    }
}
