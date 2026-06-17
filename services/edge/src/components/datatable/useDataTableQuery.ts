/**
 * useDataTableQuery - React Query hook for DataTable data fetching
 * 
 * Provides client-side caching with 5-minute staleTime per AGENTS.md Section 7.2.
 * Works alongside server-side Redis caching (60s TTL).
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DataTableBinding } from './types';
import { resolveDateOperator } from '@frontbase/types';

interface UseDataTableQueryOptions {
    binding: DataTableBinding;
    page: number;
    pageSize: number;
    sortColumn: string | null;
    sortDirection: 'asc' | 'desc';
    search: string;
    filters: Record<string, any>;
    initialData?: any[];
    initialTotal?: number;
    resolvedHiddenFilters?: any[];
}

/**
 * Resolves variables in a template string on the client using the global VariableStore.
 */
function resolveClientTemplate(template: string, store: { get(scope: string, key: string): any }): string {
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr) => {
        const [scope, ...rest] = String(expr).trim().split('.');
        const val = store.get(scope, rest.join('.'));
        return val !== undefined && val !== null ? String(val) : '';
    });
}


interface DataTableResult {
    rows: any[];
    total: number;
}

// Debug logger
function logDebug(message: string, data?: any) {
    console.log(`%c[DataTable Debug] ${message}`, 'background: #007bff; color: white; padding: 2px 4px; border-radius: 2px;', data || '');
}

/**
 * Build the fetch request based on binding configuration
 */
async function fetchTableData(options: UseDataTableQueryOptions): Promise<DataTableResult> {
    const { binding, page, pageSize, sortColumn, sortDirection, search, filters } = options;
    const tableName = binding.dataRequest?.queryConfig?.tableName || binding.tableName || 'unknown';

    logDebug(`Fetching fresh data for table: ${tableName}`, { page, sortColumn, search });

    const startTime = performance.now();
    const queryConfig = binding.dataRequest?.queryConfig;

    if (queryConfig?.useRpc) {
        // Use RPC: frontbase_get_rows via direct fetch or edge proxy
        const effectiveSortCol = sortColumn || queryConfig.sortColumn || null;
        const effectiveSortDir = sortDirection || queryConfig.sortDirection || 'asc';

        // Build filters from current filterValues state
        const filterList = Object.entries(filters).map(([column, value]) => {
            const filterConfig = (binding.frontendFilters || queryConfig.frontendFilters || [])
                .find((f: any) => f.column === column);
            return {
                column,
                filterType: filterConfig?.filterType || 'text',
                value
            };
        }).filter(f => f.value !== undefined && f.value !== null && f.value !== '');

        // If search is active, use frontbase_search_rows instead
        const rpcName = search ? 'frontbase_search_rows' : 'frontbase_get_rows';
        const rpcUrl = (binding.dataRequest?.url || '').replace('frontbase_get_rows', rpcName);

        // Build RPC body
        const rpcBody: any = {
            table_name: queryConfig.tableName,
            columns: queryConfig.columns,
            joins: queryConfig.joins || [],
            page: page + 1, // RPC uses 1-based pages
            page_size: pageSize
        };

        if (search) {
            rpcBody.search_query = search;
            rpcBody.search_cols = (queryConfig.searchColumns?.length || 0) > 0
                ? queryConfig.searchColumns
                : [];
        } else {
            rpcBody.sort_col = effectiveSortCol;
            rpcBody.sort_dir = effectiveSortDir;
        }

        rpcBody.filters = [...filterList, ...(options.resolvedHiddenFilters || [])];

        // Strategy factory: route based on publish-time decision
        const strategy = binding.dataRequest?.fetchStrategy || 'proxy';
        let response: Response;

        if (strategy === 'direct') {
            // Direct: browser → datasource (Supabase PostgREST, CORS-enabled)
            logDebug(`Strategy: direct → ${rpcUrl.substring(0, 80)}...`);
            response = await fetch(rpcUrl, {
                method: 'POST',
                headers: binding.dataRequest?.headers as Record<string, string> || {},
                body: JSON.stringify(rpcBody),
            });
        } else {
            // Proxy: browser → edge /api/data/execute → datasource
            // Only send datasourceId + query — credentials resolved server-side
            const datasourceId = (binding.dataRequest as any)?.datasourceId || binding.datasourceId;
            logDebug(`Strategy: proxy → /api/data/execute (ds: ${datasourceId})`);
            response = await fetch('/api/data/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataRequest: {
                        fetchStrategy: 'proxy',
                        datasourceId,
                        method: 'POST',
                        queryConfig: binding.dataRequest?.queryConfig || {},
                        body: rpcBody,
                        resultPath: binding.dataRequest?.resultPath || 'rows',
                        flattenRelations: binding.dataRequest?.flattenRelations ?? false,
                    }
                })
            });
        }

        const result = await response.json();
        const duration = (performance.now() - startTime).toFixed(2);

        if (strategy === 'direct') {
            // Direct fetch returns RPC response shape: { rows: [...], total: N }
            const rows = result.rows || result.data || [];
            const total = result.total ?? rows.length;
            logDebug(`Fetch complete in ${duration}ms`, { rows: rows.length, total });
            return { rows, total };
        } else {
            // Proxy returns edge wrapper: { success, data: { rows, total } }
            if (result.success) {
                const rows = result.data?.rows || result.data || [];
                const total = result.data?.total ?? result.total ?? rows.length;
                logDebug(`Fetch complete in ${duration}ms`, { rows: rows.length, total });
                return { rows, total };
            } else {
                const errMsg = typeof result.error === 'object' ? (result.error.message || JSON.stringify(result.error)) : result.error;
                logDebug(`Fetch failed in ${duration}ms`, result.error);
                throw new Error(errMsg || 'Failed to fetch data');
            }
        }
    } else if (binding.dataRequest?.url) {
        // ... legacy code ...
        // Legacy: Use the pre-computed URL
        const response = await fetch('/api/data/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataRequest: binding.dataRequest })
        });
        const result = await response.json();
        if (result.success) {
            const rows = result.data?.rows || result.data || [];
            const total = result.data?.total ?? rows.length;
            return { rows, total };
        } else {
            const errMsg = typeof result.error === 'object' ? (result.error?.message || JSON.stringify(result.error)) : result.error;
            throw new Error(errMsg || 'Failed to fetch data');
        }
    } else if (binding.tableName) {
        // Fallback to simple data API
        const response = await fetch(`/api/data/${binding.tableName}`);
        const result = await response.json();
        if (result.success) {
            return { rows: result.data || [], total: result.data?.length || 0 };
        } else {
            const errMsg = typeof result.error === 'object' ? (result.error?.message || JSON.stringify(result.error)) : result.error;
            throw new Error(errMsg || 'Failed to fetch data');
        }
    }

    return { rows: [], total: 0 };
}

/**
 * React Query hook for DataTable data fetching with caching
 */
export function useDataTableQuery(options: UseDataTableQueryOptions) {
    const { binding, page, sortColumn, sortDirection, search, filters, initialData = [], initialTotal = 0 } = options;

    const [storeVersion, setStoreVersion] = useState(0);

    useEffect(() => {
        const store = typeof window !== 'undefined' ? (window as any).__VARIABLE_STORE__ : null;
        if (!store) return;
        return store.subscribe(() => {
            setStoreVersion((v) => v + 1);
        });
    }, []);

    const resolvedHiddenFilters = useMemo(() => {
        const resolvedList = [...(binding._resolvedHiddenFilters || [])];
        const pendingList = binding._pendingHiddenFilters || [];
        const store = typeof window !== 'undefined' ? (window as any).__VARIABLE_STORE__ : null;

        for (const filter of pendingList) {
            const operator = filter.operator;
            if (operator === 'is_null' || operator === 'not_null') {
                resolvedList.push({
                    column: filter.column,
                    op: operator,
                });
                continue;
            }

            const value = filter.value;
            let resolvedVal: any = '';
            if (typeof value === 'string') {
                if (store) {
                    resolvedVal = resolveClientTemplate(value, store);
                } else {
                    resolvedVal = filter.previewValue || '';
                }
            } else {
                resolvedVal = value;
            }

            // Date operators desugar to lt/lte/gt/gte (UTC) via the shared helper,
            // which also emits the two-bound range for is_today.
            const dateExpanded = resolveDateOperator({ column: filter.column, op: operator, value: resolvedVal });
            if (dateExpanded !== null) {
                resolvedList.push(...dateExpanded);
                continue;
            }

            if (resolvedVal !== undefined && resolvedVal !== null && String(resolvedVal).trim() !== '') {
                if (operator === 'in') {
                    resolvedVal = String(resolvedVal).split(',').map((s: string) => s.trim()).filter(Boolean);
                }
                resolvedList.push({
                    column: filter.column,
                    op: operator,
                    value: resolvedVal
                });
            }
        }
        return resolvedList;
    }, [binding._resolvedHiddenFilters, binding._pendingHiddenFilters, storeVersion]);

    const tableName = binding.dataRequest?.queryConfig?.tableName || binding.tableName || 'unknown';

    const queryKey = [
        'datatable',
        tableName,
        page,
        sortColumn,
        sortDirection,
        search,
        JSON.stringify(filters),
        JSON.stringify(resolvedHiddenFilters)
    ];

    const isDefaultState = page === 0 && !sortColumn && !search && Object.keys(filters).length === 0;

    const query = useQuery({
        queryKey,
        queryFn: () => fetchTableData({ ...options, resolvedHiddenFilters }),
        staleTime: 5 * 60 * 1000, // 5 minutes per AGENTS.md Section 7.2
        gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
        refetchOnWindowFocus: false,
        retry: 1,
        // Use SSR data as initial cache (prevents fetch on mount)
        initialData: (isDefaultState && initialData.length > 0)
            ? { rows: initialData, total: initialTotal }
            : undefined,
    });

    if (query.isStale && !query.isFetching && !query.isLoading) {
        // logDebug('Data is stale but available', { staleTime: 5 * 60 * 1000 });
    }

    if (query.data && !query.isFetching) {
        // logDebug('Serving from cache', { queryKey });
    }

    return {
        data: query.data?.rows || [],
        total: query.data?.total ?? initialTotal,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isStale: query.isStale,
        error: query.error ? (query.error as Error).message : null,
        refetch: query.refetch,
    };
}
