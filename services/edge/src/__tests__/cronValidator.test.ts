import { describe, it, expect } from 'vitest';
import {
    validateCron,
    pollingIntervalToCron,
    describeInterval,
    parseCronFields,
    isHighFrequencyCron,
    parseCron,
} from '../engine/cronValidator.js';

describe('cronValidator', () => {
    describe('validateCron', () => {
        it('accepts valid standard cron expressions', () => {
            const result = validateCron('0 * * * *');
            expect(result.valid).toBe(true);
            expect(result.nextRuns).toHaveLength(5);
        });

        it('expands cron shortcuts', () => {
            const result = validateCron('@daily');
            expect(result.valid).toBe(true);
            expect(result.nextRuns).toBeDefined();
            expect(result.nextRuns!.length).toBeGreaterThan(0);
        });

        it('rejects invalid cron expressions', () => {
            const result = validateCron('not a cron');
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('rejects empty input', () => {
            const result = validateCron('');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('required');
        });

        it('returns 5 next run times as valid ISO strings', () => {
            const result = validateCron('0 9 * * *');
            expect(result.valid).toBe(true);
            expect(result.nextRuns).toHaveLength(5);
            result.nextRuns!.forEach((run) => {
                expect(new Date(run).toISOString()).toBe(run);
            });
        });

        it('handles complex cron expressions', () => {
            const result = validateCron('*/15 9-17 * * 1-5');
            expect(result.valid).toBe(true);
            expect(result.nextRuns).toBeDefined();
        });

        it('rejects out-of-range values', () => {
            expect(validateCron('99 * * * *').valid).toBe(false);
            expect(validateCron('* 99 * * *').valid).toBe(false);
        });

        it('rejects expressions with too few fields', () => {
            const result = validateCron('0 9 *');
            expect(result.valid).toBe(false);
        });
    });

    describe('parseCron', () => {
        it('parses every-minute expression', () => {
            const parsed = parseCron('* * * * *');
            expect(parsed.minute.size).toBe(60);
            expect(parsed.hour.size).toBe(24);
        });

        it('parses step values', () => {
            const parsed = parseCron('*/15 * * * *');
            expect([...parsed.minute].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
        });

        it('parses ranges', () => {
            const parsed = parseCron('* 9-17 * * *');
            expect(parsed.hour.size).toBe(9);
            expect(parsed.hour.has(9)).toBe(true);
            expect(parsed.hour.has(17)).toBe(true);
        });

        it('normalizes dow 7 to 0', () => {
            const parsed = parseCron('* * * * 7');
            expect(parsed.dow.has(0)).toBe(true);
            expect(parsed.dow.has(7)).toBe(false);
        });
    });

    describe('pollingIntervalToCron', () => {
        it('converts sub-minute seconds to 1-minute cron', () => {
            expect(pollingIntervalToCron(30)).toBe('*/1 * * * *');
            expect(pollingIntervalToCron(45)).toBe('*/1 * * * *');
        });

        it('converts whole minutes', () => {
            expect(pollingIntervalToCron(60)).toBe('*/1 * * * *');
            expect(pollingIntervalToCron(120)).toBe('*/2 * * * *');
            expect(pollingIntervalToCron(300)).toBe('*/5 * * * *');
        });

        it('floors to minimum 1 minute', () => {
            expect(pollingIntervalToCron(0)).toBe('*/1 * * * *');
        });

        it('handles non-positive / NaN input', () => {
            expect(pollingIntervalToCron(NaN)).toBe('*/1 * * * *');
            expect(pollingIntervalToCron(-10)).toBe('*/1 * * * *');
        });
    });

    describe('describeInterval', () => {
        it('describes daily midnight schedule', () => {
            const desc = describeInterval('0 0 * * *');
            expect(desc.toLowerCase()).toContain('daily');
            expect(desc).toContain('0:00');
        });

        it('describes a specific daily hour', () => {
            const desc = describeInterval('0 9 * * *');
            expect(desc.toLowerCase()).toContain('daily');
            expect(desc).toContain('9:00');
        });

        it('describes weekday schedules', () => {
            const desc = describeInterval('0 9 * * 1-5');
            expect(desc.toLowerCase()).toContain('weekday');
        });

        it('describes every-N-minutes schedules', () => {
            expect(describeInterval('*/5 * * * *').toLowerCase()).toContain('every 5 minute');
        });

        it('describes every-minute schedules', () => {
            expect(describeInterval('* * * * *').toLowerCase()).toContain('every minute');
        });

        it('handles invalid expressions gracefully', () => {
            expect(describeInterval('invalid')).toBe('Custom schedule');
        });
    });

    describe('parseCronFields', () => {
        it('parses standard cron into components', () => {
            const result = parseCronFields('0 9 * * 1');
            expect(result).toEqual({
                minute: '0',
                hour: '9',
                day: '*',
                month: '*',
                weekday: '1',
            });
        });

        it('returns null for invalid format', () => {
            expect(parseCronFields('0 9 *')).toBeNull();
            expect(parseCronFields('')).toBeNull();
        });
    });

    describe('isHighFrequencyCron', () => {
        it('detects every-minute schedules as high frequency', () => {
            expect(isHighFrequencyCron('* * * * *')).toBe(true);
        });

        it('detects */N (N<5) as high frequency', () => {
            expect(isHighFrequencyCron('*/1 * * * *')).toBe(true);
            expect(isHighFrequencyCron('*/4 * * * *')).toBe(true);
        });

        it('returns false for normal frequencies', () => {
            expect(isHighFrequencyCron('*/5 * * * *')).toBe(false);
            expect(isHighFrequencyCron('0 * * * *')).toBe(false);
            expect(isHighFrequencyCron('0 9 * * *')).toBe(false);
        });

        it('returns false for invalid expressions', () => {
            expect(isHighFrequencyCron('invalid')).toBe(false);
        });
    });
});
