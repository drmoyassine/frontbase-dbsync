import { HiddenFilter } from '@/hooks/data/useSimpleData';

export interface WireFilter {
    column: string;
    op?: string;
    filterType?: string;
    value?: any;
}

/**
 * Resolves template variables in hidden filters against a provided context.
 * Used primarily for builder preview.
 */
export function resolveHiddenFilters(
    hidden: HiddenFilter[] | undefined,
    ctx: Record<string, any>,
    opts?: { dropUnresolved?: boolean }
): WireFilter[] {
    if (!hidden || hidden.length === 0) return [];

    return hidden.map(filter => {
        let finalValue = filter.value;

        // Very basic template resolution for builder preview
        if (finalValue && typeof finalValue === 'string' && finalValue.includes('{{')) {
            finalValue = finalValue.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, expr) => {
                const parts = expr.trim().split('.');
                let current = ctx;
                for (const part of parts) {
                    if (current == null) break;
                    current = current[part];
                }
                return current !== undefined && current !== null ? String(current) : '';
            });

        // Fallback to previewValue if resolution fails
            if (!finalValue || finalValue.trim() === '') {
                finalValue = filter.previewValue || '';
            }
        }

        const op = filter.operator;
        let resolvedValue = finalValue;
        
        if (op === 'is_before') return [{ column: filter.column, op: 'lt', value: resolvedValue }];
        if (op === 'is_after') return [{ column: filter.column, op: 'gt', value: resolvedValue }];
        if (op === 'is_on_or_before') return [{ column: filter.column, op: 'lte', value: resolvedValue }];
        if (op === 'is_on_or_after') return [{ column: filter.column, op: 'gte', value: resolvedValue }];

        if (op === 'is_within_last_days') {
            const days = parseInt(resolvedValue || '0', 10);
            if (isNaN(days) || days <= 0) return []; // Invalid, drop it
            const date = new Date();
            date.setUTCDate(date.getUTCDate() - days);
            return [{ column: filter.column, op: 'gte', value: date.toISOString() }];
        }

        if (op === 'is_today') {
            const start = new Date();
            start.setUTCHours(0, 0, 0, 0);
            const end = new Date(start);
            end.setUTCDate(end.getUTCDate() + 1);
            return [
                { column: filter.column, op: 'gte', value: start.toISOString() },
                { column: filter.column, op: 'lt', value: end.toISOString() }
            ];
        }

        return [{ column: filter.column, op: filter.operator, value: resolvedValue }];
    }).flat().filter(f => {
        // Drop unresolved unless it's is_null/not_null
        if (f.op === 'is_null' || f.op === 'not_null') return true;
        if (opts?.dropUnresolved && (!f.value || String(f.value).trim() === '')) return false;
        return true;
    });
}
