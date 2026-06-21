/**
 * Phase 3 — change detection tests (option B: PK-keyed diff).
 */

import { describe, it, expect } from 'vitest';
import { detectChanges, buildSnapshot, mergeIntoSnapshot, removeFromSnapshot } from '../engine/changeDetection';

const rows = (objs: Array<Record<string, unknown>>) => objs;

describe('detectChanges — first run', () => {
    it('seeds the baseline and emits no changes', () => {
        const result = detectChanges(rows([{ id: 1 }, { id: 2 }, { id: 3 }]), null);
        expect(result.seeded).toBe(true);
        expect(result.inserts).toEqual([]);
        expect(result.updates).toEqual([]);
        expect(result.deletes).toEqual([]);
    });
});

describe('detectChanges — id-set mode (no watermark)', () => {
    const prev = buildSnapshot(rows([{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 3, v: 'c' }]));

    it('classifies inserts and deletes (updates are not detectable without content)', () => {
        // id-set mode: 1 present-in-both (unchanged — no content signal), 2 gone (delete), 4 new (insert)
        const current = rows([{ id: 1, v: 'a2' }, { id: 3, v: 'c' }, { id: 4, v: 'd' }]);
        const result = detectChanges(current, prev);
        expect(result.seeded).toBe(false);
        expect(result.inserts).toEqual([{ id: 4, v: 'd' }]);
        expect(result.updates).toEqual([]); // id=1 present in both but no content signal → unchanged
        expect(result.deletes.map((r) => r.id).sort()).toEqual([2]);
    });

    it('returns empty changes when nothing changed', () => {
        const result = detectChanges(rows([{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 3, v: 'c' }]), prev);
        expect(result.inserts).toHaveLength(0);
        expect(result.updates).toHaveLength(0);
        expect(result.deletes).toHaveLength(0);
    });

    it('honors a custom key column', () => {
        const p = buildSnapshot(rows([{ sku: 'x' }, { sku: 'y' }]), 'sku');
        const result = detectChanges(rows([{ sku: 'x' }, { sku: 'z' }]), p, { keyColumn: 'sku' });
        expect(result.inserts).toEqual([{ sku: 'z' }]);
        expect(result.deletes.map((r) => r.sku)).toEqual(['y']);
    });
});

describe('detectChanges — watermark mode', () => {
    const prev = buildSnapshot(rows([{ id: 1, v: 'a' }, { id: 2, v: 'b' }]));

    it('classifies current rows as insert/update but does NOT infer deletes', () => {
        // In watermark mode `current` only holds changed rows; id=2 was deleted
        // but we must not report it from the rowset — reconciliation handles deletes.
        const current = rows([{ id: 1, v: 'a2' }, { id: 3, v: 'c' }]);
        const result = detectChanges(current, prev, { watermark: true });
        expect(result.updates).toEqual([{ id: 1, v: 'a2' }]);
        expect(result.inserts).toEqual([{ id: 3, v: 'c' }]);
        expect(result.deletes).toEqual([]); // not inferred in watermark mode
    });
});

describe('snapshot helpers', () => {
    it('buildSnapshot dedupes by key (last wins)', () => {
        const snap = buildSnapshot(rows([{ id: 1, v: 'a' }, { id: 1, v: 'b' }]));
        expect(snap.get('1')).toEqual({ id: 1, v: 'b' });
    });

    it('mergeIntoSnapshot adds new keys', () => {
        const snap = buildSnapshot(rows([{ id: 1 }]));
        mergeIntoSnapshot(snap, rows([{ id: 2 }, { id: 3 }]));
        expect(snap.size).toBe(3);
    });

    it('removeFromSnapshot deletes keys', () => {
        const snap = buildSnapshot(rows([{ id: 1 }, { id: 2 }, { id: 3 }]));
        removeFromSnapshot(snap, ['1', '3']);
        expect(snap.size).toBe(1);
        expect(snap.has('2')).toBe(true);
    });
});
