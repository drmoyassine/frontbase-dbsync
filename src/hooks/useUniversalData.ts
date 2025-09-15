import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataBindingStore } from '@/stores/data-binding';
import { ComponentDataBinding, QueryResult, TableSchema } from '@/lib/data-sources/types';

export interface UseUniversalDataOptions {
  componentId: string;
  binding?: ComponentDataBinding;
  autoFetch?: boolean;
  refreshInterval?: number; // in seconds, 0 = realtime, -1 = manual
}

export interface UseUniversalDataResult {
  data: any[];
  count: number;
  loading: boolean;
  error: string | null;
  schema: TableSchema | null;
  
  // Actions
  refetch: () => Promise<void>;
  setFilters: (filters: any[]) => void;
  setSorting: (sorting: any[]) => void;
  setPagination: (pagination: { page: number; pageSize: number }) => void;
  
  // Pagination
  currentPage: number;
  pageSize: number;
  totalPages: number;
  
  // State
  filters: any[];
  sorting: any[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export function useUniversalData(options: UseUniversalDataOptions): UseUniversalDataResult {
  const {
    componentId,
    binding,
    autoFetch = true,
    refreshInterval = -1
  } = options;

  const store = useDataBindingStore();
  const intervalRef = useRef<NodeJS.Timeout>();
  
  // Local state
  const [filters, setFilters] = useState<any[]>([]);
  const [sorting, setSorting] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [lastResult, setLastResult] = useState<QueryResult>({ data: [], count: 0 });

  // Get state from store
  const loading = store.loading.get(`query-${componentId}`) || false;
  const error = store.errors.get(`query-${componentId}`) || null;
  const componentBinding = store.getComponentBinding(componentId);
  const schema = binding?.tableName ? store.schemas.get(binding.tableName) : null;

  // Set component binding when provided
  useEffect(() => {
    if (binding) {
      store.setComponentBinding(componentId, binding);
    }
  }, [componentId, binding, store]);

  // Build query options
  const buildQueryOptions = useCallback(() => {
    if (!componentBinding?.binding.tableName) return null;

    const baseOptions: any = componentBinding.binding.queryOptions || {};
    
    // Merge with local state
    const queryOptions: any = {
      ...baseOptions,
      table: componentBinding.binding.tableName,
      filters: [...(baseOptions.filters || []), ...filters],
      sort: sorting.length > 0 ? sorting : (baseOptions.sort || []),
      pagination: {
        page: currentPage,
        pageSize: pageSize
      }
    };

    // Add search if provided
    if (searchQuery.trim()) {
      queryOptions.search = {
        column: '*', // Search all columns
        query: searchQuery.trim()
      };
    }

    return queryOptions;
  }, [componentBinding, filters, sorting, searchQuery, currentPage, pageSize]);

  // Fetch data
  const fetchData = useCallback(async () => {
    const queryOptions = buildQueryOptions();
    if (!queryOptions) return;

    try {
      const result = await store.queryData(componentId, queryOptions);
      setLastResult(result);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, [buildQueryOptions, store, componentId]);

  // Auto-fetch when dependencies change
  useEffect(() => {
    if (autoFetch && componentBinding?.binding.tableName) {
      fetchData();
    }
  }, [autoFetch, componentBinding, fetchData]);

  // Set up refresh interval
  useEffect(() => {
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(fetchData, refreshInterval * 1000);
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [refreshInterval, fetchData]);

  // Set up real-time subscription
  useEffect(() => {
    if (refreshInterval === 0 && componentBinding?.binding.tableName) {
      store.subscribeToTable(componentId, componentBinding.binding.tableName);
      return () => {
        store.unsubscribeFromTable(componentId);
      };
    }
  }, [refreshInterval, componentBinding, store, componentId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      store.unsubscribeFromTable(componentId);
    };
  }, [componentId, store]);

  // Calculate pagination
  const totalPages = Math.ceil((lastResult.count || 0) / pageSize);

  // Action handlers
  const handleSetFilters = useCallback((newFilters: any[]) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filters change
  }, []);

  const handleSetSorting = useCallback((newSorting: any[]) => {
    setSorting(newSorting);
  }, []);

  const handleSetPagination = useCallback(({ page, pageSize: newPageSize }: { page: number; pageSize: number }) => {
    setCurrentPage(page);
    if (newPageSize !== pageSize) {
      setPageSize(newPageSize);
      setCurrentPage(1); // Reset to first page when page size changes
    }
  }, [pageSize]);

  const handleSetSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1); // Reset to first page when search changes
  }, []);

  return {
    data: lastResult.data || [],
    count: lastResult.count || 0,
    loading,
    error,
    schema,
    
    // Actions
    refetch: fetchData,
    setFilters: handleSetFilters,
    setSorting: handleSetSorting,
    setPagination: handleSetPagination,
    
    // Pagination
    currentPage,
    pageSize,
    totalPages,
    
    // State
    filters,
    sorting,
    searchQuery,
    setSearchQuery: handleSetSearchQuery
  };
}

// Hook for table schema
export function useTableSchema(tableName?: string) {
  const store = useDataBindingStore();
  const [loading, setLoading] = useState(false);
  
  const schema = tableName ? store.schemas.get(tableName) : null;
  const error = tableName ? store.errors.get(`schema-${tableName}`) : null;

  const loadSchema = useCallback(async (table: string) => {
    setLoading(true);
    try {
      await store.loadTableSchema(table);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    if (tableName && !schema && !loading) {
      loadSchema(tableName);
    }
  }, [tableName, schema, loading, loadSchema]);

  return {
    schema,
    loading: loading || store.loading.get(`schema-${tableName}`) || false,
    error,
    refetch: tableName ? () => loadSchema(tableName) : undefined
  };
}

// Hook for distinct values (for dropdowns)
export function useDistinctValues(tableName?: string, columnName?: string) {
  const [values, setValues] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const store = useDataBindingStore();

  const fetchValues = useCallback(async () => {
    if (!tableName || !columnName) return;

    setLoading(true);
    setError(null);

    try {
      // This would need to be implemented in your backend and data source manager
      const response = await fetch('/api/database/distinct-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableName, column: columnName })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch distinct values: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.success) {
        setValues(result.data.values || []);
      } else {
        throw new Error(result.message || 'Failed to fetch distinct values');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setValues([]);
    } finally {
      setLoading(false);
    }
  }, [tableName, columnName]);

  useEffect(() => {
    fetchValues();
  }, [fetchValues]);

  return {
    values,
    loading,
    error,
    refetch: fetchValues
  };
}

// Hook for data mutations
export function useDataMutation(tableName?: string) {
  const [loading, setLoading] = useState(false);
  const store = useDataBindingStore();

  const insert = useCallback(async (data: Record<string, any>) => {
    if (!tableName) return { success: false, error: 'No table specified' };

    setLoading(true);
    try {
      const response = await fetch('/api/database/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableName, data })
      });

      const result = await response.json();
      
      if (result.success) {
        // Invalidate cache to trigger refetch
        store.invalidateCache();
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      setLoading(false);
    }
  }, [tableName, store]);

  const update = useCallback(async (id: any, data: Record<string, any>) => {
    if (!tableName) return { success: false, error: 'No table specified' };

    setLoading(true);
    try {
      const response = await fetch('/api/database/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableName, id, data })
      });

      const result = await response.json();
      
      if (result.success) {
        store.invalidateCache();
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      setLoading(false);
    }
  }, [tableName, store]);

  const remove = useCallback(async (id: any) => {
    if (!tableName) return { success: false, error: 'No table specified' };

    setLoading(true);
    try {
      const response = await fetch('/api/database/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableName, id })
      });

      const result = await response.json();
      
      if (result.success) {
        store.invalidateCache();
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      setLoading(false);
    }
  }, [tableName, store]);

  return {
    insert,
    update,
    remove,
    loading
  };
}