/**
 * Phase 3 — data-change poller tests (mocked cache + injected fetch).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory cache mock
const store = new Map<string, string>();
vi.mock('../cache/index.js', () => ({
    cacheProvider: {
        get: async (k: string) => store.get(k) ?? null,
        setex: async (k: string, _t: number, v: string) => { store.set(k, v); },
    },
}));

import { pollDataChanges } from '../engine/dataChangePoller';

beforeEach(() => store.clear());

describe('pollDataChanges — first run', () => {
    it('seeds the baseline and reports no changes (no fire)', async () => {
        const fetchRows = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
        const result = await pollDataChanges(
            { workflowId: 'wf-1', table: 't' },
            fetchRows as any,
        );
        expect(result.seeded).toBe(true);
        expect(result.changeSet.inserts).toEqual([]);
        // baseline persisted
        expect(store.get('wf:wf-1:dc:snapshot')).toBeDefined();
    });
});

describe('pollDataChanges — id-set mode (no watermark column)', () => {
    it('detects inserts and deletes, persists updated baseline', async () => {
        // Seed first
        await pollDataChanges({ workflowId: 'wf-2', table: 't' }, async () => [{ id: 1 }, { id: 2 }] as any);

        // Second poll: id=2 deleted, id=3 inserted
        const result = await pollDataChanges(
            { workflowId: 'wf-2', table: 't' },
            async () => [{ id: 1 }, { id: 3 }] as any,
        );
        expect(result.seeded).toBe(false);
        expect(result.changeSet.inserts.map((r) => r.id)).toEqual([3]);
        expect(result.changeSet.deletes.map((r) => r.id)).toEqual([2]);
        expect(result.changeSet.updates).toEqual([]);
    });
});

describe('pollDataChanges — watermark mode', () => {
    it('classifies current rows as insert/update and does not infer deletes', async () => {
        const wfId = 'wf-3';
        // Seed baseline with two rows
        await pollDataChanges({ workflowId: wfId, table: 't', timestampColumn: 'updated_at' }, async () => [
            { id: 1, updated_at: '2026-01-01T00:00:00Z' },
            { id: 2, updated_at: '2026-01-01T00:00:00Z' },
        ] as any);

        // Next poll returns only changed rows (id=1 updated, id=3 new) — id=2 deleted but not in set
        const result = await pollDataChanges(
            { workflowId: wfId, table: 't', timestampColumn: 'updated_at' },
            async (q: any) => {
                // the poller passes a gt filter; we ignore it and return canned rows
                void q;
                return [
                    { id: 1, updated_at: '2026-01-02T00:00:00Z' },
                    { id: 3, updated_at: '2026-01-02T00:00:00Z' },
                ] as any;
            },
        );
        expect(result.changeSet.updates.map((r: any) => r.id)).toEqual([1]);
        expect(result.changeSet.inserts.map((r: any) => r.id)).toEqual([3]);
        expect(result.changeSet.deletes).toEqual([]); // not inferred in watermark mode
    });

    it('passes a gt filter using the stored watermark', async () => {
        const wfId = 'wf-4';
        await pollDataChanges({ workflowId: wfId, table: 't', timestampColumn: 'ts' }, async () => [
            { id: 1, ts: '2026-01-01T00:00:00Z' },
        ] as any);

        const seen: any[] = [];
        await pollDataChanges(
            { workflowId: wfId, table: 't', timestampColumn: 'ts' },
            async (q: any) => { seen.push(q); return [{ id: 2, ts: '2026-01-02T00:00:00Z' }] as any; },
        );
        expect(seen[0].filter).toEqual({ column: 'ts', op: 'gt', value: '2026-01-01T00:00:00Z' });
    });
});
