/**
 * Data-Change Poller (Phase 3 — the tick body)
 *
 * Runs on each schedule tick for a data_change_trigger workflow. Fetches the
 * watched table (via an injected `fetchRows` so it's datasource-agnostic and
 * unit-testable), diffs against the persisted baseline using option-B PK
 * classification, and emits one execution per changed row (or a batched fire
 * — caller's choice via `onChanges`).
 *
 * First run seeds the baseline silently (no fire).
 */

import type { Row } from './changeDetection.js';
import { detectChanges, buildSnapshot, type ChangeSet } from './changeDetection.js';
import { cacheProvider } from '../cache/index.js';

export interface PollerConfig {
    workflowId: string;
    table: string;
    /** Configured watermark column (user-chosen in the node panel). */
    timestampColumn?: string;
    /** Primary key column (default 'id'). */
    keyColumn?: string;
    /** Page size for fetches (default 1000). */
    pageSize?: number;
}

export interface PollerResult {
    changeSet: ChangeSet;
    /** True if this was the seeding run (no fire). */
    seeded: boolean;
}

export type FetchRowsFn = (q: {
    columns?: string;
    filter?: { column: string; op: 'gt'; value: string } | null;
    pageSize: number;
}) => Promise<Row[]>;

const BASELINE_KEY = (id: string) => `wf:${id}:dc:snapshot`;
const WATERMARK_KEY = (id: string) => `wf:${id}:dc:watermark`;

async function readBaseline(workflowId: string, keyColumn: string): Promise<Map<string, Row> | null> {
    try {
        const raw = await cacheProvider.get<string>(BASELINE_KEY(workflowId));
        if (!raw) return null;
        const arr = JSON.parse(raw) as Row[];
        return buildSnapshot(arr, keyColumn);
    } catch {
        return null;
    }
}

async function writeBaseline(workflowId: string, snapshot: Map<string, Row>): Promise<void> {
    try {
        await cacheProvider.setex(BASELINE_KEY(workflowId), 0 /* no TTL */, JSON.stringify([...snapshot.values()]));
    } catch {
        // best-effort persistence
    }
}

/**
 * Run one poll. Fetches rows, classifies changes, updates the baseline.
 * Does NOT fire executions itself — returns the ChangeSet so the caller
 * (the tick handler) can apply guards + executeWorkflow per change.
 */
export async function pollDataChanges(
    config: PollerConfig,
    fetchRows: FetchRowsFn,
): Promise<PollerResult> {
    const keyColumn = config.keyColumn || 'id';
    const pageSize = config.pageSize || 1000;
    const watermarkCol = config.timestampColumn;

    const prev = await readBaseline(config.workflowId, keyColumn);
    const hasBaseline = prev !== null;

    // Fetch: watermark mode fetches only changed rows; otherwise the full id set.
    const rows = await fetchRows({
        columns: watermarkCol ? `${keyColumn},${watermarkCol}` : keyColumn,
        filter: watermarkCol && hasBaseline
            ? { column: watermarkCol, op: 'gt', value: (await readWatermark(config.workflowId)) || '' }
            : null,
        pageSize,
    });

    const changeSet = detectChanges(rows, prev, { keyColumn, watermark: !!watermarkCol });

    if (changeSet.seeded) {
        // First run: persist baseline, emit nothing.
        await writeBaseline(config.workflowId, buildSnapshot(rows, keyColumn));
        if (watermarkCol) await writeWatermark(config.workflowId, rows, watermarkCol);
        return { changeSet, seeded: true };
    }

    // Update baseline for next tick.
    const next = prev ? new Map(prev) : new Map<string, Row>();
    for (const r of [...changeSet.inserts, ...changeSet.updates]) {
        next.set(String(r[keyColumn]), r);
    }
    for (const r of changeSet.deletes) {
        next.delete(String(r[keyColumn]));
    }
    await writeBaseline(config.workflowId, next);
    if (watermarkCol) await writeWatermark(config.workflowId, rows, watermarkCol);

    return { changeSet, seeded: false };
}

async function readWatermark(workflowId: string): Promise<string | null> {
    try {
        return await cacheProvider.get<string>(WATERMARK_KEY(workflowId));
    } catch {
        return null;
    }
}

async function writeWatermark(workflowId: string, rows: Row[], watermarkCol: string): Promise<void> {
    let max = '';
    for (const r of rows) {
        const v = r[watermarkCol];
        if (v !== undefined && v !== null && String(v) > max) max = String(v);
    }
    if (max) {
        try {
            await cacheProvider.setex(WATERMARK_KEY(workflowId), 0, max);
        } catch {
            // best-effort
        }
    }
}
