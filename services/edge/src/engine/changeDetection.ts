/**
 * Change Detection Engine (Phase 3 — option B)
 *
 * PK-keyed diff of the watched table between two polls. Classifies each
 * changed primary key as insert / update / delete. Strategy is driven by
 * whether a `timestampColumn` is configured:
 *
 *  - watermark : the poller fetches only rows with ts > lastWatermark, so the
 *                "current" set is already the changed rows; deletes are found
 *                via periodic id-set reconciliation (caller-supplied).
 *  - id-set    : compares the full id sets between polls → inserts + deletes;
 *                updates are NOT detectable without a content hash (caller
 *                decides; we surface them only when row content is available).
 *
 * First run seeds the baseline silently and fires NOTHING — deploying a
 * data_change trigger on a 50k-row table must not fire 50k inserts.
 */

export interface Row {
    [key: string]: unknown;
}

export interface ChangeSet {
    inserts: Row[];
    updates: Row[];
    deletes: Row[]; // rows present in `prev` but missing in `current`
    /** True on the very first poll (no prior baseline). No changes are emitted. */
    seeded: boolean;
}

export interface DetectOptions {
    /** Primary key column name (default 'id'). */
    keyColumn?: string;
    /**
     * Watermark mode: when true, `current` already contains only changed rows
     * (the poller filtered by ts > watermark). Each row is then classified as
     * insert-or-update by whether its PK existed in the previous snapshot.
     */
    watermark?: boolean;
}

const DEFAULT_KEY = 'id';

function keyOf(row: Row, keyColumn: string): string {
    const k = row[keyColumn];
    return k === undefined || k === null ? '' : String(k);
}

/**
 * Diff a current rowset against the previous snapshot.
 *
 * @param current  rows fetched this tick (in watermark mode: only changed rows)
 * @param prev     the previous snapshot (PK → row), or null on first run
 */
export function detectChanges(
    current: Row[],
    prev: Map<string, Row> | null,
    opts: DetectOptions = {}
): ChangeSet {
    const keyColumn = opts.keyColumn || DEFAULT_KEY;

    // First run: seed the baseline, emit nothing.
    if (!prev) {
        return { inserts: [], updates: [], deletes: [], seeded: true };
    }

    const inserts: Row[] = [];
    const updates: Row[] = [];

    for (const row of current) {
        const k = keyOf(row, keyColumn);
        if (!k) continue;
        if (prev.has(k)) {
            // Present in both. Only watermark mode can PROVE it changed (the row
            // was returned by a ts>watermark filter). In id-set mode we have no
            // content signal, so we treat it as unchanged (no false "update" fire).
            if (opts.watermark) updates.push(row);
        } else {
            inserts.push(row);
        }
    }

    // Deletes: PKs in prev but not in current.
    //  - watermark mode: current only holds changed rows, so we CANNOT infer
    //    deletes from it — leave deletes empty (reconciliation handles them).
    //  - id-set mode: current is the full set, so missing PKs are deletes.
    const deletes: Row[] = [];
    if (!opts.watermark) {
        const currentKeys = new Set(current.map((r) => keyOf(r, keyColumn)));
        for (const [k, row] of prev) {
            if (!currentKeys.has(k)) deletes.push(row);
        }
    }

    return { inserts, updates, deletes, seeded: false };
}

/** Build a PK→row snapshot from a rowset (the baseline for the next tick). */
export function buildSnapshot(rows: Row[], keyColumn = DEFAULT_KEY): Map<string, Row> {
    const snap = new Map<string, Row>();
    for (const row of rows) {
        const k = keyOf(row, keyColumn);
        if (k) snap.set(k, row);
    }
    return snap;
}

/** Merge a batch of changed rows into an existing snapshot (for watermark mode). */
export function mergeIntoSnapshot(
    snapshot: Map<string, Row>,
    rows: Row[],
    keyColumn = DEFAULT_KEY
): Map<string, Row> {
    for (const row of rows) {
        const k = keyOf(row, keyColumn);
        if (k) snapshot.set(k, row);
    }
    return snapshot;
}

/** Remove deleted PKs from a snapshot (used by id-set reconciliation). */
export function removeFromSnapshot(snapshot: Map<string, Row>, keys: string[]): Map<string, Row> {
    for (const k of keys) snapshot.delete(k);
    return snapshot;
}
