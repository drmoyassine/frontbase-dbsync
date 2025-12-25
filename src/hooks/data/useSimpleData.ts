import { useCallback, useEffect, useState, useMemo } from 'react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useTableData, useTableSchema, useGlobalSchema } from '@/hooks/useDatabase';
import { debug } from '@/lib/debug';

export interface FilterConfig {
    id: string;
    column: string;
    filterType: 'dropdown' | 'multiselect' | 'text' | 'number' | 'dateRange' | 'boolean';
    options?: string[];
    value?: any;
    label?: string;
}

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
    columnOverrides: Record<string, {
        displayName?: string;
        visible?: boolean;
        displayType?: 'text' | 'badge' | 'date' | 'boolean' | 'currency' | 'percentage' | 'image' | 'link';
        dateFormat?: string;
    }>;
    columnOrder?: string[];
    searchColumns?: string[];
    frontendFilters?: FilterConfig[];
    rpcName?: string;
    params?: Record<string, any>;
}

export interface UseSimpleDataOptions {
    componentId: string;
    binding?: ComponentDataBinding | null;
    autoFetch?: boolean;
}

export interface UseSimpleDataResult {
    data: any[];
    count: number;
    loading: boolean;
    error: string | null;
    schema: any;
    currentSorting: { column?: string; direction?: 'asc' | 'desc' };
    currentPagination: { page: number; pageSize: number };
    refetch: () => Promise<void>;
    setFilters: (filters: Record<string, any>) => void;
    setSorting: (column: string, direction: 'asc' | 'desc') => void;
    setPagination: (page: number, pageSize?: number) => void;
    setSearchQuery: (query: string) => void;
}

export function useSimpleData({
    componentId,
    binding,
    autoFetch = true
}: UseSimpleDataOptions): UseSimpleDataResult {
    const { connected, initialize } = useDataBindingStore();

    // Local state
    const [filters, setFiltersState] = useState<Record<string, any>>({});
    const [sorting, setSortingState] = useState<{ column?: string; direction?: 'asc' | 'desc' }>({});
    const [pagination, setPaginationState] = useState({ page: 0, pageSize: 20 });
    const [searchQuery, setSearchQueryState] = useState('');

    // Initialize connection
    useEffect(() => {
        if (!connected) initialize();
    }, [connected, initialize]);

    // Derived params for React Query
    const queryParams = useMemo(() => {
        if (!binding?.tableName) return null;

        return {
            page: binding.pagination.enabled ? (pagination.page + 1) : undefined, // API is 1-based? API offset handled in hook
            pageSize: binding.pagination.enabled ? (binding.pagination.pageSize || pagination.pageSize) : undefined,
            sort: (sorting.column || binding.sorting.column) ? {
                column: sorting.column || binding.sorting.column!,
                direction: sorting.direction || binding.sorting.direction || 'asc'
            } : null,
            filters: {
                ...binding.filtering.filters,
                ...filters,
                ...(searchQuery && binding.filtering.searchEnabled ? {
                    // Search logic: needs to know columns. Hook logic simplistic? 
                    // databaseApi passes filters directly.
                    // Special 'search' filter? Or manual OR?
                    // Backend needs to handle 'search' key or we define it here.
                    // The original queryData handled search by client-side filtering? 
                    // NO, database-api passes search query?
                    // database-api router handles 'filters'.
                    // For search, we typically need to filter on specific columns.
                    // Passing 'search' key to backend if supported.
                    search: searchQuery
                } : {})
            }
        };
    }, [binding, filters, sorting, pagination, searchQuery]);

    // React Query Hooks
    const {
        data: globalSchema,
        isLoading: isGlobalSchemaLoading,
        error: globalSchemaError
    } = useGlobalSchema();

    const { data: schema } = useTableSchema(binding?.tableName || null);

    const {
        data: queryResult,
        isLoading: isTableLoading,
        error: queryError,
        refetch: refetchQuery
    } = useTableData(binding?.tableName || null, queryParams || {});

    // Ensure array data
    const data = useMemo(() => Array.isArray(queryResult?.rows) ? queryResult.rows : [], [queryResult]);
    const count = queryResult?.total || 0;

    // Combine errors and loading states
    const error = (globalSchemaError instanceof Error ? globalSchemaError.message : null) ||
        (queryError instanceof Error ? queryError.message : null);

    const isLoading = isGlobalSchemaLoading || isTableLoading;

    // Actions
    const setFilters = useCallback((newFilters: Record<string, any>) => {
        setFiltersState(newFilters);
        setPaginationState(prev => ({ ...prev, page: 0 }));
    }, []);

    const setSorting = useCallback((column: string, direction: 'asc' | 'desc') => {
        setSortingState({ column, direction });
    }, []);

    const setPagination = useCallback((page: number, pageSize?: number) => {
        setPaginationState(prev => ({ page, pageSize: pageSize ?? prev.pageSize }));
    }, []);

    const setSearchQuery = useCallback((query: string) => {
        setSearchQueryState(query);
        setPaginationState(prev => ({ ...prev, page: 0 }));
    }, []);

    // Wrapper for refetch that returns Promise<void>
    const refetchWrapper = useCallback(async () => {
        await refetchQuery();
    }, [refetchQuery]);

    return {
        data,
        count,
        loading: isLoading,
        error,
        schema,
        currentSorting: sorting,
        currentPagination: pagination,
        refetch: refetchWrapper,
        setFilters,
        setSorting,
        setPagination,
        setSearchQuery
    };
}
