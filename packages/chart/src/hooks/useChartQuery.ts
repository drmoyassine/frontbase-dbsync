import { useQuery } from '@tanstack/react-query';
import type { ComponentDataBinding } from '../types';

interface UseChartQueryProps {
    mode: 'builder' | 'edge';
    binding: ComponentDataBinding;
    initialData?: any[];
    enabled?: boolean;
}

function resolveEnvVars(template: string): string {
    if (typeof window === 'undefined') {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            return (process.env as Record<string, string>)[key] || '';
        });
    } else {
        return template;
    }
}

/** Build the [{field, operator, value}] filter list the data APIs expect. */
function buildFilterList(binding: ComponentDataBinding) {
    if (!binding.filtering?.filters) return [];
    return Object.entries(binding.filtering.filters)
        .filter(([_, v]) => v != null && v !== '')
        .map(([field, value]) => ({
            field,
            operator: '==',
            value: typeof value === 'object' && value && 'value' in value ? (value as any).value : value,
        }));
}

async function fetchAggregateFromBuilder(binding: ComponentDataBinding) {
    const cfg = binding.chartConfig!;
    const params = new URLSearchParams();
    params.append('category', cfg.category!);
    params.append('aggregation', cfg.aggregation || 'count');
    if (cfg.value) params.append('value', cfg.value);
    params.append('sort', cfg.sort || 'none');
    params.append('limit', String(cfg.maxRows || 10));
    const filterList = buildFilterList(binding);
    if (filterList.length > 0) params.append('filters', JSON.stringify(filterList));

    const response = await fetch(
        `/api/sync/datasources/${binding.dataSourceId}/tables/${binding.tableName}/aggregate/?${params}`
    );
    if (!response.ok) {
        throw new Error('Failed to fetch chart data');
    }
    const result = await response.json();
    return result.records || [];
}

async function fetchFromBuilder(binding: ComponentDataBinding) {
    // Charts aggregate in the database (GROUP BY) so counts/sums are correct for
    // the whole table rather than a fetched page.
    if (binding.chartConfig?.category) {
        return fetchAggregateFromBuilder(binding);
    }

    const params = new URLSearchParams();
    // Default limit to 10 for charts, or use pageSize if pagination enabled
    const limit = binding.pagination?.enabled ? binding.pagination.pageSize : 10;
    params.append('limit', String(limit));
    params.append('offset', '0');

    if (binding.sorting?.column) {
        params.append('sort', binding.sorting.column);
        params.append('order', binding.sorting.direction || 'asc');
    }

    // Add filters
    if (binding.filtering?.filters) {
        const filterList = Object.entries(binding.filtering.filters)
            .filter(([_, v]) => v != null && v !== '')
            .map(([field, value]) => ({
                field,
                operator: '==',
                value: typeof value === 'object' && 'value' in value ? (value as any).value : value,
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
    return result.records || [];
}

async function fetchFromEdge(binding: ComponentDataBinding) {
    const dataRequest = binding.dataRequest;
    if (!dataRequest) {
        return [];
    }

    const queryConfig = dataRequest.queryConfig;
    const strategy = dataRequest.fetchStrategy || 'proxy';

    // Chart aggregation: the publish step bakes a GROUP BY request (exec_sql for
    // Supabase-direct, or a SQL queryConfig for the proxy). Send it as-is and
    // return the already-aggregated [{category, value}] rows.
    if (binding.chartConfig?.category && (queryConfig as any)?.isChartAggregate) {
        if (strategy === 'direct') {
            const url = resolveEnvVars(dataRequest.url);
            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(dataRequest.headers || {})) {
                headers[key] = resolveEnvVars(value as string);
            }
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(dataRequest.body || {}),
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch chart data (HTTP ${response.status})`);
            }
            return (await response.json()) || [];
        }
        const datasourceId = dataRequest.datasourceId || binding.dataSourceId;
        const response = await fetch('/api/data/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dataRequest: {
                    fetchStrategy: 'proxy',
                    datasourceId,
                    method: 'POST',
                    queryConfig: dataRequest.queryConfig || {},
                    body: dataRequest.body || {},
                    resultPath: dataRequest.resultPath ?? '',
                    flattenRelations: false,
                },
            }),
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch chart data');
        }
        return result.data?.rows || result.data || [];
    }
    const limit = binding.pagination?.enabled ? binding.pagination.pageSize : 10;

    // Build query body
    const queryBody: Record<string, any> = {
        table_name: queryConfig?.tableName || binding.tableName,
        columns: queryConfig?.columns || '*',
        joins: queryConfig?.joins || [],
        page: 1,
        page_size: limit,
        filters: [],
    };

    if (binding.sorting?.column) {
        queryBody.sort_col = binding.sorting.column;
        queryBody.sort_dir = binding.sorting.direction || 'asc';
    }

    if (strategy === 'direct') {
        const url = resolveEnvVars(dataRequest.url);
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(dataRequest.headers || {})) {
            headers[key] = resolveEnvVars(value as string);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(queryBody),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch data (HTTP ${response.status})`);
        }

        const result = await response.json();
        return result.rows || result.data || [];
    } else {
        const datasourceId = dataRequest.datasourceId || binding.dataSourceId;
        const response = await fetch('/api/data/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dataRequest: {
                    fetchStrategy: 'proxy',
                    datasourceId,
                    method: 'POST',
                    queryConfig: dataRequest.queryConfig || {},
                    body: queryBody,
                    resultPath: dataRequest.resultPath || 'rows',
                    flattenRelations: dataRequest.flattenRelations ?? false,
                },
            }),
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch data');
        }
        return result.data?.rows || result.data || [];
    }
}

export function useChartQuery({
    mode,
    binding,
    initialData,
    enabled = true,
}: UseChartQueryProps) {
    return useQuery({
        queryKey: ['chart-data-v2', mode, binding.dataSourceId, binding.tableName, binding.sorting, binding.filtering, binding.chartConfig],
        queryFn: async () => {
            if (!binding.tableName) return [];
            if (mode === 'builder') {
                return fetchFromBuilder(binding);
            } else {
                return fetchFromEdge(binding);
            }
        },
        initialData: initialData,
        enabled: enabled && !!binding.tableName,
        staleTime: 5 * 60 * 1000, // 5 minutes per AGENTS.md 7.2
        refetchOnWindowFocus: false,
        retry: 1, // standard retry limit
        refetchInterval: binding.refreshInterval && binding.refreshInterval > 0
            ? binding.refreshInterval * 1000
            : false,
    });
}
