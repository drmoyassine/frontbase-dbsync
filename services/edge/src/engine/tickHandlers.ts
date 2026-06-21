/**
 * Tick Handlers (Phase 3 — the missing piece)
 *
 * Registers and implements the job handlers for scheduled and data_change
 * triggers. When QStash/BullMQ pings /api/queue/process?jobName=dc:<id> or
 * sched:<id>, these handlers execute the workflow.
 *
 * Handlers are registered on boot by iterating active workflows that need
 * scheduling (via registerTickHandlers()).
 */

import type { WorkflowData } from '../storage/IStateProvider.js';
import { queueServiceReady } from '../services/queue/index.js';
import { DC_JOB, SCHEDULED_JOB, parseTriggerConfig, needsSchedule } from './scheduler.js';
import { pollDataChanges, type PollerConfig } from './dataChangePoller.js';
import { executeWorkflow } from './runtime.js';
import { stateProvider } from '../storage/index.js';
import { acquireExecutionGuards } from './executionGuards.js';
import { dispatchByMode } from './queryDispatch.js';
import type { RowsQuery } from '@frontbase/types';

/**
 * Build the RowsQuery for a data_change poll (watermark filter).
 * Uses the Phase-0 contract so the poller is datasource-agnostic.
 */
function buildPollQuery(config: PollerConfig, watermark: string | null): RowsQuery {
    const filter = config.timestampColumn && watermark
        ? { column: config.timestampColumn, op: 'gt' as const, value: watermark }
        : null;

    return {
        kind: 'rows',
        table: config.table,
        columns: config.timestampColumn ? `${config.keyColumn || 'id'},${config.timestampColumn}` : config.keyColumn || 'id',
        filters: filter ? [filter] : [],
        pageSize: config.pageSize || 1000,
        page: 0,
    };
}

/**
 * Fetch rows via the Phase-0 dispatch (datasource-agnostic).
 * This is the injectable fetchRows implementation for pollDataChanges.
 */
async function fetchRowsViaDispatch(
    datasourceId: string,
    query: RowsQuery
): Promise<Record<string, any>[]> {
    const result = await dispatchByMode(
        { queryConfig: query as any, datasourceId },
        '_default'
    );
    return (result.data || []) as Record<string, any>[];
}

/**
 * Handler for data_change tick (jobName = dc:<workflowId>).
 *
 * 1. Parse trigger config to get datasource/table/timestampColumn
 * 2. Fetch rows via Phase-0 dispatch
 * 3. Run pollDataChanges to diff vs baseline
 * 4. If changes, execute workflow with guards (one fire per change or batched)
 */
export async function handleDataChangeTick(workflowId: string): Promise<void> {
    const workflow = await stateProvider.getWorkflowById(workflowId, '_default');
    if (!workflow || !workflow.isActive) {
        console.log(`[Tick] Workflow ${workflowId} not found or inactive, skipping`);
        return;
    }

    const cfg = parseTriggerConfig(workflow);
    const datasourceId = cfg.dataSource as string;
    const table = cfg.table as string;

    if (!datasourceId || !table) {
        console.error(`[Tick] Workflow ${workflowId} missing dataSource or table in triggerConfig`);
        return;
    }

    const pollerConfig: PollerConfig = {
        workflowId,
        table,
        timestampColumn: cfg.timestampColumn as string | undefined,
        keyColumn: cfg.keyColumn as string | undefined,
        pageSize: cfg.pageSize ? Number(cfg.pageSize) : 1000,
    };

    // Fetch rows via the Phase-0 dispatch (datasource-agnostic)
    const fetchRows = async (q: { columns?: string; filter?: { column: string; op: 'gt'; value: string } | null; pageSize: number }) => {
        const query = buildPollQuery(pollerConfig, q.filter?.value || null);
        return fetchRowsViaDispatch(datasourceId, query);
    };

    const result = await pollDataChanges(pollerConfig, fetchRows);

    // First run (seeding) — no fire
    if (result.seeded) {
        console.log(`[Tick] Workflow ${workflowId}: first run seeded baseline (${result.changeSet.inserts.length + result.changeSet.updates.length + result.changeSet.deletes.length} rows)`);
        return;
    }

    const { inserts, updates, deletes } = result.changeSet;
    const totalChanges = inserts.length + updates.length + deletes.length;

    if (totalChanges === 0) {
        console.log(`[Tick] Workflow ${workflowId}: no changes detected`);
        return;
    }

    console.log(`[Tick] Workflow ${workflowId}: ${inserts.length} inserts, ${updates.length} updates, ${deletes.length} deletes`);

    // Execute workflow for each change type (or batch all — design choice)
    // For now, execute once per distinct operation type
    const settings = JSON.parse(workflow.settings || '{}');

    if (inserts.length > 0) {
        await executeWithGuards(workflow, { changes: inserts, operation: 'insert', count: inserts.length }, settings);
    }
    if (updates.length > 0) {
        await executeWithGuards(workflow, { changes: updates, operation: 'update', count: updates.length }, settings);
    }
    if (deletes.length > 0) {
        await executeWithGuards(workflow, { changes: deletes, operation: 'delete', count: deletes.length }, settings);
    }
}

/**
 * Handler for scheduled tick (jobName = sched:<workflowId>).
 *
 * Fires the workflow with { timestamp, scheduledTime } payload.
 */
export async function handleScheduledTick(workflowId: string): Promise<void> {
    const workflow = await stateProvider.getWorkflowById(workflowId, '_default');
    if (!workflow || !workflow.isActive) {
        console.log(`[Tick] Workflow ${workflowId} not found or inactive, skipping`);
        return;
    }

    const timestamp = new Date().toISOString();
    console.log(`[Tick] Workflow ${workflowId}: scheduled fire at ${timestamp}`);

    const settings = JSON.parse(workflow.settings || '{}');
    await executeWithGuards(workflow, { timestamp, scheduledTime: timestamp }, settings);
}

/**
 * Execute a workflow with execution guards (rate-limit, cooldown, debounce, concurrency).
 */
async function executeWithGuards(
    workflow: WorkflowData,
    triggerPayload: Record<string, any>,
    settings: Record<string, any>
): Promise<void> {
    const guard = await acquireExecutionGuards(workflow.id, settings as any, { rateLimitAlwaysOn: true });
    if (!guard.allowed) {
        console.log(`[Tick] Workflow ${workflow.id} blocked by guard: ${guard.body?.message || 'unknown'}`);
        return;
    }

    try {
        const inputParameters = {
            triggerType: workflow.triggerType,
            triggerPayload,
            parameters: (settings.parameters || {}) as Record<string, any>,
        };
        await executeWorkflow(
            `tick-${workflow.id}-${Date.now()}`,
            workflow,
            inputParameters,
            settings as any
        );
    } finally {
        guard.release();
    }
}

/**
 * Register tick handlers for all active workflows that need scheduling.
 *
 * Called on edge boot to ensure that when QStash/BullMQ pings back with
 * dc:<id> or sched:<id>, the handlers are ready.
 *
 * This is idempotent — calling it multiple times is safe (handlers are
 * stored in a Map and overwritten if re-registered).
 */
export async function registerTickHandlers(): Promise<void> {
    try {
        const queue = await queueServiceReady;

        // Fetch all active workflows
        const workflows = await stateProvider.listWorkflows('_default');
        const activeWorkflows = workflows.filter((w) => w.isActive);

        let registered = 0;

        for (const workflow of activeWorkflows) {
            const { dataChange, scheduled } = needsSchedule(workflow.triggerType);

            if (dataChange) {
                const jobName = DC_JOB(workflow.id);
                queue.process(jobName, () => handleDataChangeTick(workflow.id));
                registered++;
            }

            if (scheduled) {
                const jobName = SCHEDULED_JOB(workflow.id);
                queue.process(jobName, () => handleScheduledTick(workflow.id));
                registered++;
            }
        }

        console.log(`[TickHandlers] Registered ${registered} tick handlers for ${activeWorkflows.length} active workflows`);
    } catch (e: any) {
        // In test environments or during early boot, listWorkflows might not be available
        console.warn(`[TickHandlers] Failed to register tick handlers (may be test env):`, e.message);
    }
}
