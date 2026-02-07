/**
 * DataTable Component - React SSR with shadcn/ui styling
 * 
 * Features:
 * - Server-side pagination, sorting, and search
 * - displayType support (image, link, text)
 * - columnOrder from binding
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { ChevronUp, ChevronDown, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

// Import types and utilities from extracted files
import type { DataTableProps, FilterConfig } from './types';
import { getCellValue, renderCell, formatHeader } from './utils';
import { SearchableSelect } from './SearchableSelect';
import { SearchableMultiSelect } from './SearchableMultiSelect';
import { useDataTableQuery } from './useDataTableQuery';

export function DataTable({ binding, initialData = [], initialTotal = 0, className }: DataTableProps) {
    // UI Control State (pagination, sorting, filtering)
    const [currentPage, setCurrentPage] = useState(binding.pagination?.page || 0);
    const [sortColumn, setSortColumn] = useState(binding.sorting?.column || null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(binding.sorting?.direction || 'asc');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchDebounce, setSearchDebounce] = useState('');

    // Filter values state - keyed by filter column
    const [filterValues, setFilterValues] = useState<Record<string, any>>({});
    const [fetchedOptions, setFetchedOptions] = useState<Record<string, { label: string; value: string }[]>>({});

    // Pagination config
    const pageSize = binding.pagination?.pageSize || 20;

    // React Query for data fetching with caching (per AGENTS.md Section 4.1)
    const { data, total: totalCount, isLoading, error } = useDataTableQuery({
        binding,
        page: currentPage,
        pageSize,
        sortColumn,
        sortDirection,
        search: searchDebounce,
        filters: filterValues,
        initialData,
        initialTotal,
    });
    const loading = isLoading;

    // Check if filters are enabled
    const filtersEnabled = (binding.frontendFilters && binding.frontendFilters.length > 0) ||
        binding.filtering?.filtersEnabled;

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

    // Page change handler - useQuery auto-refetches when currentPage changes in query key
    const handlePageChange = useCallback((newPage: number) => {
        setCurrentPage(newPage);
    }, []);

    // Sort handler - useQuery auto-refetches when sortColumn/sortDirection change
    const handleSort = useCallback((column: string) => {
        if (!binding.sorting?.enabled) return;

        let newDir: 'asc' | 'desc' = 'asc';
        if (sortColumn === column) {
            newDir = sortDirection === 'asc' ? 'desc' : 'asc';
        }

        setSortColumn(column);
        setSortDirection(newDir);
        setCurrentPage(0);
    }, [binding.sorting?.enabled, sortColumn, sortDirection]);

    // Search debounce - useQuery auto-refetches when searchDebounce changes
    React.useEffect(() => {
        const timer = setTimeout(() => {
            if (searchDebounce !== searchQuery) {
                setSearchDebounce(searchQuery);
                setCurrentPage(0);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, searchDebounce]);

    // Fetch dynamic filter options (with cascading filter + search support)
    React.useEffect(() => {
        const fetchFilterOptions = async () => {
            if (!binding.frontendFilters) return;

            const newOptions: Record<string, { label: string; value: string }[]> = {};
            const queryConfig = binding.dataRequest?.queryConfig;

            for (const filter of binding.frontendFilters) {
                // Only fetch for dropdown/multiselect filters with optionsDataRequest
                if (!filter.optionsDataRequest) continue;
                if (!['dropdown', 'multiselect'].includes(filter.filterType)) continue;

                try {
                    // Build cascading filter context (exclude current filter)
                    const cascadingFilters = Object.entries(filterValues)
                        .filter(([col]) => col !== filter.column)
                        .filter(([, val]) => val !== undefined && val !== null && val !== '')
                        .map(([column, value]) => {
                            const filterConfig = binding.frontendFilters?.find(f => f.column === column);
                            return {
                                column,
                                filterType: filterConfig?.filterType || 'text',
                                value
                            };
                        });

                    // Build request body with cascading filters + search query
                    const requestBody: Record<string, any> = {
                        ...filter.optionsDataRequest.body,
                        filters: cascadingFilters
                    };

                    // Add search context if there's an active search
                    if (searchDebounce && searchDebounce.trim() !== '') {
                        requestBody.search_query = searchDebounce;
                        // Use searchColumns from queryConfig, or fallback to visible text columns
                        requestBody.search_cols = queryConfig?.searchColumns ||
                            columns.filter(col => !col.includes('.')); // Exclude FK columns as fallback
                    }

                    const response = await fetch('/api/data/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            dataRequest: {
                                ...filter.optionsDataRequest,
                                body: requestBody
                            }
                        })
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

            if (Object.keys(newOptions).length > 0) {
                setFetchedOptions(prev => ({ ...prev, ...newOptions }));
            }
        };

        fetchFilterOptions();
    }, [binding.frontendFilters, filterValues, searchDebounce, columns]);  // Re-fetch when filters OR search change



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
                            // useQuery auto-refetches when filterValues changes in query key
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
                                    <SearchableSelect
                                        value={value || ''}
                                        onChange={handleChange}
                                        options={fetchedOptions[filter.column] || filter.options || []}
                                        placeholder="All"
                                    />
                                )}
                                {filter.filterType === 'multiselect' && (
                                    <SearchableMultiSelect
                                        value={Array.isArray(value) ? value : []}
                                        onChange={handleChange}
                                        options={fetchedOptions[filter.column] || filter.options || []}
                                        placeholder="Select..."
                                    />
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
                                // useQuery auto-refetches when filterValues changes
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
