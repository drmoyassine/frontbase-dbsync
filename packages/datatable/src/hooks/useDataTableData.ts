import { useQuery } from '@tanstack/react-query';
import type { DataTableBinding, DataFetcherConfig, DataFetcherResult, DataRequest } from '../types';

/**
 * Resolve {{ENV_VAR}} placeholders in a string
 */
function resolveEnvVars(template: string): string {
    if (typeof window === 'undefined') {
        // Server-side: use process.env
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            return (process.env as Record<string, string>)[key] || '';
        });
    } else {
        // Client-side: env vars should already be resolved in pre-rendered HTML
        return template;
    }
}

/**
 * Fetch data from FastAPI (builder mode)
 */
async function fetchFromBuilder(config: DataFetcherConfig): Promise<DataFetcherResult> {
    const { binding, page, pageSize, sortColumn, sortDirection, filters, searchQuery } = config;

    const params = new URLSearchParams();
    params.append('limit', String(pageSize));
    params.append('offset', String(page * pageSize));

    if (sortColumn) {
        params.append('sort', sortColumn);
        params.append('order', sortDirection || 'asc');
    }

    if (searchQuery) {
        params.append('search', searchQuery);
    }

    if (binding.searchColumns?.length) {
        params.append('search_cols', JSON.stringify(binding.searchColumns));
    }

    // Add filters
    if (filters) {
        const filterList = Object.entries(filters)
            .filter(([k, v]) => k !== 'search' && v != null && v !== '')
            .map(([field, value]) => ({
                field,
                operator: '==',
                value: typeof value === 'object' && 'value' in value ? value.value : value,
            }));
        if (filterList.length > 0) {
            params.append('filters', JSON.stringify(filterList));
        }
    }

    const response = await fetch(
        `/api/sync/datasources/${binding.dataSourceId}/tables/${binding.tableName}/data?${params}`
    );

    if (!response.ok) {
        throw new Error('Failed to fetch data');
    }

    const result = await response.json();
    return {
        data: result.records || [],
        total: result.total || 0,
    };
}

/**
 * Fetch data from Edge /api/data/execute (edge mode)
 */
async function fetchFromEdge(config: DataFetcherConfig): Promise<DataFetcherResult> {
    const { binding, page, pageSize, sortColumn, sortDirection, filters, searchQuery } = config;
    const dataRequest = binding.dataRequest;

    if (!dataRequest?.url) {
        return { data: [], total: 0 };
    }

    const queryConfig = dataRequest.queryConfig;

    // Build filters for RPC
    const filterList = filters
        ? Object.entries(filters)
            .filter(([_, v]) => v !== undefined && v !== null && v !== '')
            .map(([column, value]) => {
                const filterConfig = binding.frontendFilters?.find((f) => f.column === column);
                return {
                    column,
                    filterType: filterConfig?.filterType || 'text',
                    value,
                };
            })
        : [];

    // Determine RPC name based on search
    const rpcName = searchQuery ? 'frontbase_search_rows' : 'frontbase_get_rows';
    const rpcUrl = dataRequest.url.replace('frontbase_get_rows', rpcName);

    // Build RPC body
    const rpcBody: Record<string, any> = {
        table_name: queryConfig?.tableName || binding.tableName,
        columns: queryConfig?.columns,
        joins: queryConfig?.joins || [],
        page: page + 1, // RPC uses 1-based pages
        page_size: pageSize,
        filters: filterList,
    };

    if (searchQuery) {
        rpcBody.search_query = searchQuery;
        rpcBody.search_cols = queryConfig?.searchColumns || [];
    } else {
        rpcBody.sort_col = sortColumn || queryConfig?.sortColumn || null;
        rpcBody.sort_dir = sortDirection || queryConfig?.sortDirection || 'asc';
    }

    // Resolve env vars in URL and headers
    const url = resolveEnvVars(rpcUrl);
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(dataRequest.headers || {})) {
        headers[key] = resolveEnvVars(value);
    }

    const response = await fetch('/api/data/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            dataRequest: {
                ...dataRequest,
                url,
                method: 'POST',
                headers,
                body: rpcBody,
            },
        }),
    });

    const result = await response.json();

    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch data');
    }

    const rows = result.data?.rows || result.data || [];
    const total = result.data?.total ?? result.total ?? rows.length;

    return { data: rows, total };
}

interface UseDataTableDataOptions {
    mode: 'builder' | 'edge';
    binding: DataTableBinding;
    page: number;
    pageSize: number;
    sortColumn?: string | null;
    sortDirection?: 'asc' | 'desc';
    filters?: Record<string, any>;
    searchQuery?: string;
    initialData?: any[];
    enabled?: boolean;
}

/**
 * React Query hook for DataTable data fetching
 * Works in both builder and edge modes
 */
export function useDataTableData({
    mode,
    binding,
    page,
    pageSize,
    sortColumn,
    sortDirection,
    filters,
    searchQuery,
    initialData,
    enabled = true,
}: UseDataTableDataOptions) {
    return useQuery({
        queryKey: [
            'datatable',
            mode,
            binding.tableName,
            binding.dataSourceId,
            page,
            pageSize,
            sortColumn,
            sortDirection,
            filters,
            searchQuery,
        ],
        queryFn: async () => {
            const config: DataFetcherConfig = {
                mode,
                binding,
                page,
                pageSize,
                sortColumn: sortColumn || undefined,
                sortDirection,
                filters,
                searchQuery,
            };

            if (mode === 'builder') {
                return fetchFromBuilder(config);
            } else {
                return fetchFromEdge(config);
            }
        },
        initialData: initialData
            ? { data: initialData, total: initialData.length }
            : undefined,
        enabled: enabled && !!binding.tableName,
        staleTime: 60_000, // 1 minute
        refetchOnWindowFocus: false,
    });
}
