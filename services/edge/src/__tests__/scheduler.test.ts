/**
 * Phase 3 — scheduler helper tests (pure).
 */

import { describe, it, expect } from 'vitest';
import {
    pollingIntervalToCron,
    needsSchedule,
    withScheduleMeta,
    readScheduleMeta,
    DC_JOB,
    SCHEDULED_JOB,
} from '../engine/scheduler';

describe('pollingIntervalToCron', () => {
    it('floors sub-minute intervals to 1 minute', () => {
        expect(pollingIntervalToCron(10)).toBe('*/1 * * * *');
        expect(pollingIntervalToCron(30)).toBe('*/1 * * * *');
        expect(pollingIntervalToCron(59)).toBe('*/1 * * * *');
    });
    it('rounds up to whole minutes', () => {
        expect(pollingIntervalToCron(60)).toBe('*/1 * * * *');
        expect(pollingIntervalToCron(120)).toBe('*/2 * * * *');
        expect(pollingIntervalToCron(300)).toBe('*/5 * * * *');
    });
    it('defaults missing/zero to 1 minute', () => {
        expect(pollingIntervalToCron(0)).toBe('*/1 * * * *');
        expect(pollingIntervalToCron(undefined as any)).toBe('*/1 * * * *');
    });
});

describe('needsSchedule', () => {
    it('detects data_change', () => {
        expect(needsSchedule('data_change').dataChange).toBe(true);
        expect(needsSchedule('manual').dataChange).toBe(false);
    });
    it('detects scheduled', () => {
        expect(needsSchedule('scheduled').scheduled).toBe(true);
    });
    it('handles multi-trigger (comma-separated)', () => {
        const n = needsSchedule('manual, scheduled');
        expect(n.scheduled).toBe(true);
        expect(n.dataChange).toBe(false);
    });
});

describe('schedule meta (settings JSON)', () => {
    it('round-trips handles through settings', () => {
        const handles = [
            { scheduleId: 'sch-1', jobName: DC_JOB('wf-1') },
            { scheduleId: 'sch-2', jobName: SCHEDULED_JOB('wf-1') },
        ];
        const raw = withScheduleMeta('{"rate_limit_max":60}', handles);
        expect(JSON.parse(raw).rate_limit_max).toBe(60);
        expect(readScheduleMeta(raw)).toEqual(handles);
    });

    it('reads from empty/corrupt settings safely', () => {
        expect(readScheduleMeta(null)).toEqual([]);
        expect(readScheduleMeta('{not json')).toEqual([]);
        expect(readScheduleMeta('{}')).toEqual([]);
    });
});
