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
