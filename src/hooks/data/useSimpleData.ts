import { useCallback, useEffect, useState } from 'react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { debug } from '@/lib/debug';

export interface FilterConfig {
    id: string;
    column: string;
    filterType: 'dropdown' | 'multiselect' | 'text' | 'number' | 'dateRange' | 'boolean';
    options?: string[]; // For dropdown/multiselect, auto-fetched
    value?: any; // Current filter value
    label?: string; // Custom label for the filter  
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
    // NEW: Column order for drag-and-drop
    columnOrder?: string[];

    // NEW: Search column selection (if undefined, search all text columns)
    searchColumns?: string[];

    // NEW: Frontend filters
    frontendFilters?: FilterConfig[];
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
    const {
        connected,
        dataCache,
        loadingStates,
        errors,
        schemas,
        counts,
        queryData,
        loadTableSchema,
        initialize
    } = useDataBindingStore();

    // Local state for filters, sorting, and pagination
    const [filters, setFiltersState] = useState<Record<string, any>>({});
    const [sorting, setSortingState] = useState<{ column?: string; direction?: 'asc' | 'desc' }>({});
    const [pagination, setPaginationState] = useState({ page: 0, pageSize: 20 });
    const [searchQuery, setSearchQueryState] = useState('');

    // Get current data, loading, and error states
    const data = dataCache.get(componentId) || [];
    const loading = loadingStates.get(componentId) || false;
    const error = errors.get(componentId) || null;
    const count = counts.get(componentId) || 0;
    const schema = binding?.tableName ? schemas.get(binding.tableName) : null;

    // Auto fetch data when connected and binding is set
    useEffect(() => {
        if (!connected) {
            // Initialize to sync with dashboard store
            initialize();
        }
    }, [connected, initialize]);

    // Memoize binding dependencies separately to prevent circular updates
    const bindingKey = binding ? `${binding.tableName}-${binding.componentId}` : null;
    const paginationKey = `${pagination.page}-${pagination.pageSize}`;
    const sortingKey = `${sorting.column || ''}-${sorting.direction || ''}`;
    const filtersKey = JSON.stringify(filters);

    // Build effective binding with current state - properly memoized and debounced
    const getEffectiveBinding = useCallback((): ComponentDataBinding | null => {
        if (!binding || !binding.tableName) return null;

        const effectiveBinding = {
            ...binding,
            pagination: {
                enabled: binding.pagination.enabled,
                pageSize: pagination.pageSize,
                page: pagination.page,
            },
            sorting: {
                enabled: binding.sorting.enabled,
                column: sorting.column || binding.sorting.column,
                direction: sorting.direction || binding.sorting.direction,
            },
            filtering: {
                searchEnabled: binding.filtering.searchEnabled,
                filters: {
                    ...binding.filtering.filters,
                    ...filters,
                    ...(searchQuery && binding.filtering.searchEnabled ? { search: searchQuery } : {}),
                },
            },
        };

        console.log('[useSimpleData] getEffectiveBinding:', {
            localSorting: sorting,
            bindingSorting: binding.sorting,
            effectiveSorting: effectiveBinding.sorting
        });

        return effectiveBinding;
    }, [binding, pagination, sorting, filters, searchQuery]);

    // Fetch data function - memoized and debounced to prevent excessive calls
    const fetchData = useCallback(async () => {
        const effectiveBinding = getEffectiveBinding();
        if (!effectiveBinding || !connected) {
            return;
        }

        // Determine mode: builder if on /builder route, otherwise published
        const mode = window.location.pathname.startsWith('/builder') ? 'builder' : 'published';

        try {
            await queryData(componentId, effectiveBinding);
        } catch (error) {
            debug.error('SIMPLE_DATA', 'Fetch error:', error);
        }
    }, [componentId, getEffectiveBinding, connected, queryData]);

    // Load schema when table changes - only once per table
    useEffect(() => {
        if (binding?.tableName && connected && !schema) {
            loadTableSchema(binding.tableName);
        }
    }, [binding?.tableName, connected, schema, loadTableSchema]);

    // Auto-fetch data with optimized debouncing
    useEffect(() => {
        if (!autoFetch || !binding?.tableName || !connected) {
            return;
        }

        // Longer debounce to prevent excessive calls during rapid state changes
        const timeoutId = setTimeout(() => {
            fetchData();
        }, 300);
        return () => clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoFetch, bindingKey, paginationKey, sortingKey, filtersKey, searchQuery, connected]);

    // Action functions
    const setFilters = useCallback((newFilters: Record<string, any>) => {
        setFiltersState(newFilters);
        setPaginationState(prev => ({ ...prev, page: 0 })); // Reset to first page
    }, []);

    const setSorting = useCallback((column: string, direction: 'asc' | 'desc') => {
        console.log('[useSimpleData] setSorting called:', { column, direction });
        setSortingState({ column, direction });
    }, []);

    const setPagination = useCallback((page: number, pageSize?: number) => {
        setPaginationState(prev => ({
            page,
            pageSize: pageSize ?? prev.pageSize
        }));
    }, []);

    const setSearchQuery = useCallback((query: string) => {
        setSearchQueryState(query);
        setPaginationState(prev => ({ ...prev, page: 0 })); // Reset to first page
    }, []);

    const refetch = useCallback(async () => {
        await fetchData();
    }, [fetchData]);

    return {
        data: Array.isArray(data) ? data : [],
        count,
        loading,
        error,
        schema,
        refetch,
        setFilters,
        setSorting,
        setPagination,
        setSearchQuery,
        currentSorting: sorting,
        currentPagination: pagination,
    };
}
