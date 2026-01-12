/**
 * DataTable Component - React SSR with shadcn/ui styling
 * 
 * Features:
 * - Server-side pagination, sorting, and search
 * - displayType support (image, link, text)
 * - columnOrder from binding
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '../lib/utils';
import { ChevronUp, ChevronDown, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

// Types
interface ColumnOverride {
    displayType?: 'text' | 'image' | 'link' | 'badge';
    displayName?: string;  // Custom label from builder Column Settings
    visible?: boolean;
    label?: string;  // Alias for displayName
}

interface QueryConfig {
    baseUrl: string;
    selectParam: string;
    pageSize: number;
    sortColumn?: string;
    sortDirection?: 'asc' | 'desc';
}

// Filter configuration from builder
interface FilterConfig {
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

interface DataTableBinding {
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

interface DataTableProps {
    binding: DataTableBinding;
    initialData?: any[];
    initialTotal?: number;
    className?: string;
}

// Get cell value - handles both flat RPC results and nested PostgREST results
function getCellValue(row: Record<string, any>, col: string): any {
    // 1. Direct key match (flat result like RPC with aliased columns)
    if (col in row) {
        return row[col];
    }

    // 2. Nested object (PostgREST embedded result like row.countries.country)
    if (col.includes('.')) {
        const parts = col.split('.');
        let value = row;
        for (const part of parts) {
            if (value == null) return undefined;
            value = value[part];
        }
        if (value !== undefined) return value;

        // 3. Last part only (RPC returns SELECT countries.country as just "country" in result)
        const lastPart = parts[parts.length - 1];
        if (lastPart in row) {
            return row[lastPart];
        }
    }

    return undefined;
}

// Cell renderer based on displayType
function renderCell(value: any, displayType?: string, columnKey?: string): React.ReactNode {
    if (value === null || value === undefined) {
        return <span className="text-muted-foreground">—</span>;
    }

    switch (displayType) {
        case 'image':
            return (
                <img
                    src={String(value)}
                    alt=""
                    className="h-10 w-10 object-cover rounded-md"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            );
        case 'link':
            return (
                <a
                    href={String(value)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate max-w-xs block"
                >
                    {String(value)}
                </a>
            );
        case 'badge':
            return (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    {String(value)}
                </span>
            );
        default:
            // Check if it looks like an image URL
            const strValue = String(value);
            if (strValue.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ||
                strValue.includes('supabase.co/storage')) {
                return (
                    <img
                        src={strValue}
                        alt=""
                        className="h-10 w-10 object-cover rounded-md"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                );
            }
            return <span className="truncate max-w-xs block">{strValue}</span>;
    }
}

// Format column header
function formatHeader(key: string, override?: ColumnOverride): string {
    // Check for custom label (builder uses 'displayName', alias 'label')
    if (override?.displayName) return override.displayName;
    if (override?.label) return override.label;

    // Auto-format: countries.flag → Countries › Flag
    return key
        .replace(/\./g, ' › ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

export function DataTable({ binding, initialData = [], initialTotal = 0, className }: DataTableProps) {
    // State
    const [data, setData] = useState<any[]>(initialData);
    const [totalCount, setTotalCount] = useState(initialTotal);
    const [loading, setLoading] = useState(initialData.length === 0);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(binding.pagination?.page || 0);
    const [sortColumn, setSortColumn] = useState(binding.sorting?.column || null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(binding.sorting?.direction || 'asc');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchDebounce, setSearchDebounce] = useState('');

    // Filter values state - keyed by filter column
    const [filterValues, setFilterValues] = useState<Record<string, any>>({});
    const [fetchedOptions, setFetchedOptions] = useState<Record<string, { label: string; value: string }[]>>({});

    // Check if filters are enabled
    const filtersEnabled = (binding.frontendFilters && binding.frontendFilters.length > 0) ||
        binding.filtering?.filtersEnabled;

    // Pagination config
    const pageSize = binding.pagination?.pageSize || 20;
    const paginationEnabled = binding.pagination?.enabled !== false;

    // Get columns from binding or auto-detect
    const columns = useMemo(() => {
        const order = binding.columnOrder || [];
        if (order.length > 0) {
            return order.filter(col => {
                const override = binding.columnOverrides?.[col];
                return override?.visible !== false;
            });
        }
        // Auto-detect from first data row
        if (data.length > 0) {
            return Object.keys(data[0]).filter(key =>
                !key.startsWith('_') && key !== 'id'
            );
        }
        return [];
    }, [binding.columnOrder, binding.columnOverrides, data]);

    // Build server-side query URL
    const buildQueryUrl = useCallback((page: number, sort?: string, sortDir?: string, search?: string, filters?: Record<string, any>) => {
        const queryConfig = binding.dataRequest?.queryConfig;
        if (!queryConfig?.baseUrl) return null;

        const params = new URLSearchParams();
        params.set('select', queryConfig.selectParam);

        // Pagination
        const limit = pageSize;
        const offset = page * pageSize;
        params.set('limit', String(limit));
        params.set('offset', String(offset));

        // Sorting
        const col = sort || sortColumn || queryConfig.sortColumn;
        const dir = sortDir || sortDirection || queryConfig.sortDirection || 'asc';
        if (col) {
            params.set('order', `${col}.${dir}`);
        }

        // Search (use PostgREST ilike on text columns)
        if (search && binding.filtering?.searchEnabled) {
            // Search across all visible text columns using 'or'
            const searchFilters: string[] = [];
            columns.forEach(col => {
                // Basic column name (not relations for now)
                if (!col.includes('.')) {
                    searchFilters.push(`${col}.ilike.*${search}*`);
                }
            });
            if (searchFilters.length > 0) {
                params.set('or', `(${searchFilters.join(',')})`);
            }
        }

        // Apply frontend filters
        const activeFilters = filters || filterValues;
        if (binding.frontendFilters && Object.keys(activeFilters).length > 0) {
            binding.frontendFilters.forEach(filter => {
                const value = activeFilters[filter.column];
                if (value === undefined || value === null || value === '') return;

                // Build PostgREST filter based on type
                switch (filter.filterType) {
                    case 'text':
                        params.set(filter.column, `ilike.*${value}*`);
                        break;
                    case 'dropdown':
                        params.set(filter.column, `eq.${value}`);
                        break;
                    case 'multiselect':
                        if (Array.isArray(value) && value.length > 0) {
                            params.set(filter.column, `in.(${value.join(',')})`);
                        }
                        break;
                    case 'number':
                        // For number range, value could be { min, max }
                        if (typeof value === 'object') {
                            if (value.min !== undefined) params.set(filter.column, `gte.${value.min}`);
                            if (value.max !== undefined) params.set(filter.column, `lte.${value.max}`);
                        } else {
                            params.set(filter.column, `eq.${value}`);
                        }
                        break;
                    case 'boolean':
                        params.set(filter.column, `eq.${value}`);
                        break;
                    default:
                        params.set(filter.column, `eq.${value}`);
                }
            });
        }

        return `${queryConfig.baseUrl}?${params.toString()}`;
    }, [binding, pageSize, sortColumn, sortDirection, columns, filterValues]);

    // Fetch data from server
    const fetchData = useCallback(async (page: number, sort?: string, sortDir?: string, search?: string) => {
        try {
            setLoading(true);
            setError(null);

            const queryConfig = binding.dataRequest?.queryConfig;

            if (queryConfig?.useRpc) {
                // Use RPC: frontbase_get_rows via /api/data/execute
                const effectiveSortCol = sort || sortColumn || queryConfig.sortColumn || null;
                const effectiveSortDir = sortDir || sortDirection || queryConfig.sortDirection || 'asc';

                // Build filters from filterValues
                const filters = Object.entries(filterValues).map(([column, value]) => {
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
                    // Search mode
                    rpcBody.search_query = search;
                    rpcBody.search_cols = queryConfig.searchColumns?.length > 0
                        ? queryConfig.searchColumns
                        : []; // RPC will auto-detect text columns
                } else {
                    // Normal mode with sorting
                    rpcBody.sort_col = effectiveSortCol;
                    rpcBody.sort_dir = effectiveSortDir;
                }

                // Always apply filters
                rpcBody.filters = filters;

                const response = await fetch('/api/data/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        dataRequest: {
                            ...binding.dataRequest,
                            url: rpcUrl,
                            method: 'POST',
                            body: rpcBody
                        }
                    })
                });

                const result = await response.json();
                if (result.success) {
                    // RPC returns { rows: [...], total: N, page: N }
                    const rows = result.data?.rows || result.data || [];
                    setData(rows);

                    // Total from RPC response
                    const total = result.data?.total ?? result.total ?? rows.length;
                    setTotalCount(total);
                } else {
                    setError(result.error || 'Failed to fetch data');
                }
            } else if (queryConfig?.baseUrl) {
                // Legacy: Direct PostgREST queries (fallback)
                const url = buildQueryUrl(page, sort, sortDir, search);
                if (!url) return;

                const response = await fetch('/api/data/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        dataRequest: {
                            ...binding.dataRequest,
                            url: url,
                            headers: {
                                ...binding.dataRequest?.headers,
                                'Prefer': 'count=exact'
                            }
                        }
                    })
                });

                const result = await response.json();
                if (result.success) {
                    setData(result.data || []);
                    if (typeof result.total === 'number') {
                        setTotalCount(result.total);
                    }
                } else {
                    setError(result.error || 'Failed to fetch data');
                }
            } else if (binding.dataRequest?.url) {
                // Legacy: Use the pre-computed URL
                const response = await fetch('/api/data/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dataRequest: binding.dataRequest })
                });
                const result = await response.json();
                if (result.success) {
                    const rows = result.data?.rows || result.data || [];
                    setData(rows);
                    setTotalCount(result.data?.total ?? rows.length);
                } else {
                    setError(result.error || 'Failed to fetch data');
                }
            } else if (binding.tableName) {
                // Fallback to simple data API
                const response = await fetch(`/api/data/${binding.tableName}`);
                const result = await response.json();
                if (result.success) {
                    setData(result.data || []);
                    setTotalCount(result.data?.length || 0);
                } else {
                    setError(result.error || 'Failed to fetch data');
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [binding, buildQueryUrl, pageSize, sortColumn, sortDirection, filterValues]);

    // Initial fetch
    React.useEffect(() => {
        if (initialData.length > 0 || typeof window === 'undefined') return;
        fetchData(currentPage, sortColumn || undefined, sortDirection, searchDebounce || undefined);
    }, []);

    // Fetch on page change
    const handlePageChange = useCallback((newPage: number) => {
        setCurrentPage(newPage);
        fetchData(newPage, sortColumn || undefined, sortDirection, searchDebounce || undefined);
    }, [fetchData, sortColumn, sortDirection, searchDebounce]);

    // Handle sort click
    const handleSort = useCallback((column: string) => {
        if (!binding.sorting?.enabled) return;

        let newDir: 'asc' | 'desc' = 'asc';
        if (sortColumn === column) {
            newDir = sortDirection === 'asc' ? 'desc' : 'asc';
        }

        setSortColumn(column);
        setSortDirection(newDir);
        setCurrentPage(0);
        fetchData(0, column, newDir, searchDebounce || undefined);
    }, [binding.sorting?.enabled, sortColumn, sortDirection, fetchData, searchDebounce]);

    // Handle search with debounce
    React.useEffect(() => {
        const timer = setTimeout(() => {
            if (searchDebounce !== searchQuery) {
                setSearchDebounce(searchQuery);
                setCurrentPage(0);
                fetchData(0, sortColumn || undefined, sortDirection, searchQuery || undefined);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Fetch dynamic filter options
    React.useEffect(() => {
        const fetchFilterOptions = async () => {
            if (!binding.frontendFilters) return;

            const newOptions: Record<string, { label: string; value: string }[]> = {};

            for (const filter of binding.frontendFilters) {
                if (filter.optionsDataRequest && !fetchedOptions[filter.column]) {
                    try {
                        const response = await fetch('/api/data/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dataRequest: filter.optionsDataRequest })
                        });
                        const result = await response.json();

                        let rawOptions: any[] = [];
                        if (result.success) {
                            // RPC frontbase_get_distinct_values returns a simple array via json_agg
                            rawOptions = result.data?.rows || result.data || [];
                        }

                        if (Array.isArray(rawOptions)) {
                            newOptions[filter.column] = rawOptions.map((val: any) => {
                                // Handle potential object wrapper or raw value
                                const strVal = (val !== null && typeof val === 'object') ? Object.values(val)[0] as string : String(val);
                                return {
                                    label: strVal,
                                    value: strVal
                                };
                            });
                        }
                    } catch (e) {
                        console.error("Error fetching options for", filter.column, e);
                    }
                }
            }

            if (Object.keys(newOptions).length > 0) {
                setFetchedOptions(prev => ({ ...prev, ...newOptions }));
            }
        };

        fetchFilterOptions();
    }, [binding.frontendFilters]);



    // Calculate total pages
    const totalPages = Math.ceil(totalCount / pageSize);

    // Loading state (overlay)
    const loadingOverlay = loading && data.length > 0 && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
    );

    // Initial loading state
    if (loading && data.length === 0) {
        return (
            <div className={cn("rounded-md border", className)}>
                <div className="p-8 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <div>Loading data...</div>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className={cn("rounded-md border border-red-200 bg-red-50", className)}>
                <div className="p-4 text-red-700">{error}</div>
            </div>
        );
    }

    return (
        <div className={cn("space-y-4", className)}>
            {/* Search bar */}
            {binding.filtering?.searchEnabled && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {loading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                </div>
            )}

            {/* Filters */}
            {filtersEnabled && binding.frontendFilters && binding.frontendFilters.length > 0 && (
                <div className="flex flex-wrap gap-3 p-3 rounded-md border bg-muted/30">
                    {binding.frontendFilters.map(filter => {
                        const label = filter.label || filter.column.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                        const value = filterValues[filter.column];

                        // Handle filter value change
                        const handleChange = (newValue: any) => {
                            const newFilterValues = { ...filterValues, [filter.column]: newValue };
                            // Remove empty values
                            if (newValue === '' || newValue === undefined || newValue === null ||
                                (Array.isArray(newValue) && newValue.length === 0)) {
                                delete newFilterValues[filter.column];
                            }
                            setFilterValues(newFilterValues);
                            setCurrentPage(0);
                            fetchData(0, sortColumn || undefined, sortDirection, searchDebounce || undefined);
                        };

                        return (
                            <div key={filter.id} className="flex flex-col gap-1 min-w-[150px]">
                                <label className="text-xs font-medium text-muted-foreground">{label}</label>
                                {filter.filterType === 'text' && (
                                    <input
                                        type="text"
                                        value={value || ''}
                                        onChange={(e) => handleChange(e.target.value)}
                                        placeholder={`Filter ${label}...`}
                                        className="px-2 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                )}
                                {filter.filterType === 'dropdown' && (
                                    <select
                                        value={value || ''}
                                        onChange={(e) => handleChange(e.target.value)}
                                        className="px-2 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        <option value="">All</option>
                                        {(fetchedOptions[filter.column] || filter.options || []).map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                )}
                                {filter.filterType === 'boolean' && (
                                    <select
                                        value={value === undefined ? '' : String(value)}
                                        onChange={(e) => handleChange(e.target.value === '' ? undefined : e.target.value === 'true')}
                                        className="px-2 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        <option value="">All</option>
                                        <option value="true">Yes</option>
                                        <option value="false">No</option>
                                    </select>
                                )}
                                {filter.filterType === 'number' && (
                                    <input
                                        type="number"
                                        value={value || ''}
                                        onChange={(e) => handleChange(e.target.value ? Number(e.target.value) : '')}
                                        placeholder={`Filter ${label}...`}
                                        className="px-2 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                )}
                            </div>
                        );
                    })}
                    {/* Clear filters button */}
                    {Object.keys(filterValues).length > 0 && (
                        <button
                            onClick={() => {
                                setFilterValues({});
                                setCurrentPage(0);
                                fetchData(0, sortColumn || undefined, sortDirection, searchDebounce || undefined);
                            }}
                            className="self-end px-3 py-1.5 text-xs rounded border border-input hover:bg-muted"
                        >
                            Clear Filters
                        </button>
                    )}
                </div>
            )}

            {/* Table */}
            <div className="rounded-md border overflow-auto relative">
                {loadingOverlay}
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            {columns.map(col => {
                                const override = binding.columnOverrides?.[col];
                                const isSortable = binding.sorting?.enabled;
                                const isSorted = sortColumn === col;

                                return (
                                    <th
                                        key={col}
                                        onClick={() => handleSort(col)}
                                        className={cn(
                                            "px-4 py-3 text-left font-medium text-muted-foreground",
                                            isSortable && "cursor-pointer hover:bg-muted/80 select-none"
                                        )}
                                    >
                                        <div className="flex items-center gap-1">
                                            {formatHeader(col, override)}
                                            {isSorted && (
                                                sortDirection === 'asc'
                                                    ? <ChevronUp className="h-4 w-4" />
                                                    : <ChevronDown className="h-4 w-4" />
                                            )}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {data.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-4 py-8 text-center text-muted-foreground"
                                >
                                    No data available
                                </td>
                            </tr>
                        ) : (
                            data.map((row, i) => (
                                <tr key={row.id || i} className="border-t hover:bg-muted/50">
                                    {columns.map(col => {
                                        const override = binding.columnOverrides?.[col];
                                        return (
                                            <td key={col} className="px-4 py-3">
                                                {renderCell(getCellValue(row, col), override?.displayType, col)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {paginationEnabled && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        {data.length > 0 ? (
                            <>Showing {currentPage * pageSize + 1} to {currentPage * pageSize + data.length} of {totalCount}</>
                        ) : (
                            <>No results</>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handlePageChange(Math.max(0, currentPage - 1))}
                            disabled={currentPage === 0 || loading}
                            className="p-2 rounded-md border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-sm">
                            Page {currentPage + 1} of {Math.max(1, totalPages)}
                        </span>
                        <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage >= totalPages - 1 || loading}
                            className="p-2 rounded-md border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DataTable;
