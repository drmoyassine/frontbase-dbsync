/**
 * @frontbase/types — shared types for data-bound UI components.
 *
 * Single source of truth for the data-binding contract used by the
 * Chart, Grid and KPICard packages (and any future data component).
 * Keep this dependency-free so every package can consume it cheaply.
 */

/**
 * Per-column display configuration set in the Builder.
 */
export interface ColumnOverride {
    visible?: boolean;
    displayName?: string;
    displayType?: 'text' | 'badge' | 'date' | 'currency' | 'percentage' | 'image' | 'link';
}

export type HiddenFilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'in' | 'is_null' | 'not_null'
  | 'is_before' | 'is_after' | 'is_on_or_before' | 'is_on_or_after'
  | 'is_within_last_days' | 'is_today';

export interface HiddenFilter {
  id: string;
  column: string;
  operator: HiddenFilterOperator;
  value?: string;
  previewValue?: string;
}

/**
 * The unified data-binding object passed by the Builder at design time and
 * baked by the Edge publisher (carrying a `dataRequest`) at publish time.
 */
export interface ComponentDataBinding {
    componentId: string;
    dataSourceId: string;
    tableName: string;
    refreshInterval?: number;
    pagination: {
        enabled: boolean;
        pageSize: number;
        page: number;
    };
    sorting: {
        enabled: boolean;
        column?: string;
        direction?: 'asc' | 'desc';
    };
    filtering: {
        searchEnabled: boolean;
        filters: Record<string, any>;
    };
    columnOverrides: Record<string, ColumnOverride>;
    columnOrder?: string[];
    hiddenFilters?: HiddenFilter[];
    _resolvedHiddenFilters?: any[];
    _pendingHiddenFilters?: any[];
    dataRequest?: any;
    chartConfig?: {
        /** Column to group by — the X-axis / pie-slice category. */
        category?: string;
        /** Aggregation applied per category. 'count' needs no value column. */
        aggregation?: 'count' | 'sum' | 'average' | 'min' | 'max';
        /** Numeric column to aggregate. Required for everything except 'count'. */
        value?: string;
        /** Sort categories by aggregated value. */
        sort?: 'none' | 'asc' | 'desc';
        variant?: 'vertical' | 'horizontal';
        maxRows?: number;
    };
}

export interface WireFilter {
    column: string;
    op?: string;
    filterType?: string;
    value?: any;
}

export function resolveDateOperator(filter: { column: string; op?: string; value?: any }): WireFilter[] {
    const { column, op, value } = filter;
    
    if (op === 'is_before') return [{ column, op: 'lt', value }];
    if (op === 'is_after') return [{ column, op: 'gt', value }];
    if (op === 'is_on_or_before') return [{ column, op: 'lte', value }];
    if (op === 'is_on_or_after') return [{ column, op: 'gte', value }];

    if (op === 'is_within_last_days') {
        const days = parseInt(value || '0', 10);
        if (isNaN(days) || days <= 0) return []; // Invalid, drop it
        const date = new Date();
        date.setUTCDate(date.getUTCDate() - days);
        return [{ column, op: 'gte', value: date.toISOString() }];
    }

    if (op === 'is_today') {
        const start = new Date();
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 1);
        return [
            { column, op: 'gte', value: start.toISOString() },
            { column, op: 'lt', value: end.toISOString() }
        ];
    }

    return [{ column, op, value }];
}
