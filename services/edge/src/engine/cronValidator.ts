/**
 * Cron Expression Validator (Automations A2)
 *
 * Dependency-free cron validation + next-run calculation.
 * Supports standard 5-field cron (minute, hour, day-of-month, month, day-of-week).
 * QStash granularity is ≥ 1 minute, so seconds are intentionally unsupported.
 *
 * No external dependency so the bundle stays small and works across Node / Bun / CF.
 */

export interface CronValidationResult {
    valid: boolean;
    error?: string;
    nextRuns?: string[];
    intervalDescription?: string;
}

const SHORTCUTS: Record<string, string> = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
};

const FIELD_RANGES: Array<{ min: number; max: number }> = [
    { min: 0, max: 59 }, // minute
    { min: 0, max: 23 }, // hour
    { min: 1, max: 31 }, // day-of-month
    { min: 1, max: 12 }, // month
    { min: 0, max: 7 }, // day-of-week (0 and 7 both = Sunday)
];

/**
 * Parse one field (e.g. a step like slash-15, a range 1-5, a list 0,30, or a 9)
 * into a set of integers.
 */
function parseField(field: string, idx: number): Set<number> {
    const range = FIELD_RANGES[idx];
    const result = new Set<number>();

    if (field === '*') {
        for (let i = range.min; i <= range.max; i++) result.add(i);
        return result;
    }

    for (const part of field.split(',')) {
        let step = 1;
        const slashIdx = part.indexOf('/');
        let base = part;
        if (slashIdx >= 0) {
            step = parseInt(part.substring(slashIdx + 1), 10);
            if (!Number.isFinite(step) || step <= 0) {
                throw new Error(`Invalid step in "${part}"`);
            }
            base = part.substring(0, slashIdx);
        }

        let lo: number;
        let hi: number;
        if (base === '*') {
            lo = range.min;
            hi = range.max;
        } else if (base.includes('-')) {
            const [a, b] = base.split('-');
            lo = parseInt(a, 10);
            hi = parseInt(b, 10);
        } else {
            lo = parseInt(base, 10);
            hi = slashIdx >= 0 ? range.max : lo;
        }

        if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
            throw new Error(`Invalid value "${part}"`);
        }
        if (lo < range.min || hi > range.max || lo > hi) {
            throw new Error(`Value "${part}" out of range [${range.min}-${range.max}]`);
        }

        for (let v = lo; v <= hi; v += step) result.add(v);
    }

    // Normalize day-of-week 7 -> 0
    if (idx === 4 && result.has(7)) {
        result.delete(7);
        result.add(0);
    }

    return result;
}

/**
 * Parse a cron expression into five sets.
 */
export function parseCron(cron: string): {
    minute: Set<number>;
    hour: Set<number>;
    dom: Set<number>;
    month: Set<number>;
    dow: Set<number>;
} {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
        throw new Error(`Expected 5 fields, got ${parts.length}`);
    }
    return {
        minute: parseField(parts[0], 0),
        hour: parseField(parts[1], 1),
        dom: parseField(parts[2], 2),
        month: parseField(parts[3], 3),
        dow: parseField(parts[4], 4),
    };
}

/**
 * Compute the next run time after `from`.
 * Simple iterative search with a safety bound of 366 days.
 */
function nextRun(cron: ReturnType<typeof parseCron>, from: Date): Date {
    const MAX_ITERS = 366 * 24 * 60; // ~one year of minutes
    const d = new Date(from.getTime());
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1); // start from the next minute

    for (let i = 0; i < MAX_ITERS; i++) {
        const month = d.getMonth() + 1;
        if (!cron.month.has(month)) {
            d.setMonth(d.getMonth() + 1, 1);
            d.setHours(0, 0, 0, 0);
            continue;
        }
        const dom = d.getDate();
        const dow = d.getDay();
        // dom and dow: cron fires when EITHER matches (POSIX rule) when both are restricted.
        const domMatch = cron.dom.has(dom);
        const dowMatch = cron.dow.has(dow);
        const dayOk = domMatch && dowMatch;
        if (!dayOk) {
            d.setDate(d.getDate() + 1);
            d.setHours(0, 0, 0, 0);
            continue;
        }
        const hour = d.getHours();
        if (!cron.hour.has(hour)) {
            d.setHours(d.getHours() + 1, 0, 0, 0);
            continue;
        }
        const minute = d.getMinutes();
        if (!cron.minute.has(minute)) {
            d.setMinutes(d.getMinutes() + 1, 0, 0);
            continue;
        }
        return d;
    }
    throw new Error('No matching run within the next year');
}

/**
 * Validate a cron expression and return the next 5 run times (UTC ISO strings).
 */
export function validateCron(cron: string): CronValidationResult {
    if (!cron || typeof cron !== 'string' || !cron.trim()) {
        return { valid: false, error: 'Cron expression is required' };
    }

    const expression = SHORTCUTS[cron.trim().toLowerCase()] || cron.trim();

    try {
        const parsed = parseCron(expression);
        const nextRuns: string[] = [];
        let cursor = new Date();
        for (let i = 0; i < 5; i++) {
            cursor = nextRun(parsed, cursor);
            nextRuns.push(cursor.toISOString());
        }
        return {
            valid: true,
            nextRuns,
            intervalDescription: describeInterval(expression),
        };
    } catch (e: any) {
        return {
            valid: false,
            error: e?.message || 'Invalid cron expression',
        };
    }
}

/**
 * Convert a polling interval (seconds) to a cron expression.
 * Floors to a minimum of 1 minute (QStash minimum granularity).
 */
export function pollingIntervalToCron(seconds: number): string {
    const safe = Number(seconds) > 0 ? seconds : 60;
    const minutes = Math.max(1, Math.ceil(safe / 60));
    return `*/${minutes} * * * *`;
}

/**
 * Human-readable description of the cron interval.
 */
export function describeInterval(cron: string): string {
    try {
        const parts = cron.trim().split(/\s+/);
        if (parts.length !== 5) return 'Custom schedule';

        const [minute, hour, , , dow] = parts;

        if (minute === '0' && hour !== '*' && !hour.includes('/') && !hour.includes(',') && !hour.includes('-')) {
            if (dow === '*') return `Runs daily at ${hour}:00 UTC`;
            if (dow === '0' || dow === '7') return `Runs every Sunday at ${hour}:00 UTC`;
            if (dow === '1-5') return `Runs weekdays at ${hour}:00 UTC`;
            return `Runs weekly (dow ${dow}) at ${hour}:00 UTC`;
        }
        if (minute.startsWith('*/') && hour === '*' && parts[2] === '*') {
            const n = parseInt(minute.substring(2), 10);
            if (Number.isFinite(n)) return `Runs every ${n} minute${n === 1 ? '' : 's'}`;
        }
        if (minute === '*' && hour === '*') return 'Runs every minute';
        if (hour.startsWith('*/') && minute === '0') {
            const n = parseInt(hour.substring(2), 10);
            if (Number.isFinite(n)) return `Runs every ${n} hour${n === 1 ? '' : 's'}`;
        }
        return 'Custom schedule';
    } catch {
        return 'Unknown schedule';
    }
}

/**
 * Parse a cron expression into its component fields as strings.
 */
export function parseCronFields(cron: string): {
    minute: string;
    hour: string;
    day: string;
    month: string;
    weekday: string;
} | null {
    const parts = (cron || '').trim().split(/\s+/);
    if (parts.length !== 5) return null;
    return {
        minute: parts[0],
        hour: parts[1],
        day: parts[2],
        month: parts[3],
        weekday: parts[4],
    };
}

/**
 * Whether a cron expression runs more frequently than every 5 minutes.
 */
export function isHighFrequencyCron(cron: string): boolean {
    try {
        const parsed = parseCron(SHORTCUTS[cron.trim().toLowerCase()] || cron);
        // Sort minute values; if the minimum gap is < 5, treat as high frequency.
        const mins = [...parsed.minute].sort((a, b) => a - b);
        if (mins.length === 60) return true;
        for (let i = 1; i < mins.length; i++) {
            if (mins[i] - mins[i - 1] < 5) return true;
        }
        return mins.length > 0 && (60 - mins[mins.length - 1] + mins[0]) < 5;
    } catch {
        return false;
    }
}
