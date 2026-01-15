/**
 * DataTable Types
 */

export interface ColumnOverride {
    displayType?: 'text' | 'image' | 'link' | 'badge';
    displayName?: string;  // Custom label from builder Column Settings
    visible?: boolean;
    label?: string;  // Alias for displayName
}

export interface QueryConfig {
    baseUrl: string;
    selectParam: string;
    pageSize: number;
    sortColumn?: string;
    sortDirection?: 'asc' | 'desc';
    // Added for RPC support
    tableName?: string;
    columns?: string;
    joins?: any[];
    searchColumns?: string[];
    frontendFilters?: FilterConfig[];
    useRpc?: boolean;
    rpcUrl?: string;
}

// Filter configuration from builder
export interface FilterConfig {
    id: string;
    column: string;
    filterType: 'text' | 'dropdown' | 'multiselect' | 'number' | 'dateRange' | 'boolean';
    label?: string;
    value?: any;
    options?: { label: string; value: string }[];
    optionsDataRequest?: {
        url: string;
        method: string;
        headers: Record<string, string>;
        body: any;
    };
}

export interface DataTableBinding {
    tableName?: string;
    columnOrder?: string[];
    columnOverrides?: Record<string, ColumnOverride>;
    pagination?: { enabled: boolean; pageSize: number; page?: number };
    sorting?: { enabled: boolean; column?: string; direction?: 'asc' | 'desc' };
    filtering?: { searchEnabled: boolean; filtersEnabled?: boolean; filters?: Record<string, any> };
    frontendFilters?: FilterConfig[];
    dataRequest?: {
        url: string;
        method: string;
        headers: Record<string, string>;
        resultPath?: string;
        flattenRelations?: boolean;
        queryConfig?: QueryConfig;
    };
}

export interface DataTableProps {
    binding: DataTableBinding;
    initialData?: any[];
    initialTotal?: number;
    className?: string;
}
