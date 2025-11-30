import { useCallback, useEffect, useState } from 'react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { debug } from '@/lib/debug';

interface ComponentDataBinding {
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
    displayType?: 'text' | 'badge' | 'date' | 'currency' | 'percentage' | 'image' | 'link';
  }>;
}

interface UseSimpleDataOptions {
  componentId: string;
  binding?: ComponentDataBinding | null;
  autoFetch?: boolean;
}

interface UseSimpleDataResult {
  data: any[];
  count: number;
  loading: boolean;
  error: string | null;
  schema: any;
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
    setComponentBinding,
    clearError,
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

    try {
      clearError(componentId);
      await queryData(componentId, effectiveBinding);
    } catch (error) {
      debug.error('SIMPLE_DATA', 'Fetch error:', error);
    }
  }, [componentId, getEffectiveBinding, connected, queryData, clearError]);

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
  }, [autoFetch, bindingKey, paginationKey, sortingKey, filtersKey, searchQuery, connected, fetchData]);

  // Update component binding - REMOVED to prevent infinite loop
  // The binding is already managed by the component itself

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
  };
}

// Hook for table schema only
export function useTableSchema(tableName?: string) {
  const { schemas, loadTableSchema, connected } = useDataBindingStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schema = tableName ? schemas.get(tableName) : null;

  const loadSchema = useCallback(async (table: string) => {
    if (!connected) return;

    setLoading(true);
    setError(null);

    try {
      await loadTableSchema(table);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schema');
    } finally {
      setLoading(false);
    }
  }, [connected, loadTableSchema]);

  useEffect(() => {
    if (tableName && connected && !schema) {
      loadSchema(tableName);
    }
  }, [tableName, connected, schema, loadSchema]);

  return {
    schema,
    loading,
    error,
    refetch: tableName ? () => loadSchema(tableName) : () => Promise.resolve(),
  };
}

// Hook for distinct values
export function useDistinctValues(tableName?: string, columnName?: string) {
  const [values, setValues] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { connected } = useDataBindingStore();

  const fetchValues = useCallback(async () => {
    if (!tableName || !columnName || !connected) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/database/distinct-values', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          tableName,
          column: columnName,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setValues(result.data || []);
        } else {
          setError(result.message || 'Failed to fetch distinct values');
        }
      } else {
        setError(`HTTP ${response.status}: Failed to fetch distinct values`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [tableName, columnName, connected]);

  useEffect(() => {
    fetchValues();
  }, [fetchValues]);

  return {
    values,
    loading,
    error,
    refetch: fetchValues,
  };
}

// Hook for data mutations
export function useDataMutation(tableName?: string) {
  const [loading, setLoading] = useState(false);
  const { connected, invalidateCache } = useDataBindingStore();

  const insert = useCallback(async (data: Record<string, any>) => {
    if (!tableName || !connected) {
      throw new Error('Table name required and must be connected');
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/database/table-data/${encodeURIComponent(tableName)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Invalidate cache to trigger refetch
          invalidateCache();
          return result.data;
        } else {
          throw new Error(result.message || 'Insert failed');
        }
      } else {
        throw new Error(`HTTP ${response.status}: Insert failed`);
      }
    } finally {
      setLoading(false);
    }
  }, [tableName, connected, invalidateCache]);

  const update = useCallback(async (id: any, data: Record<string, any>) => {
    if (!tableName || !connected) {
      throw new Error('Table name required and must be connected');
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/database/table-data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Invalidate cache to trigger refetch
          invalidateCache();
          return result.data;
        } else {
          throw new Error(result.message || 'Update failed');
        }
      } else {
        throw new Error(`HTTP ${response.status}: Update failed`);
      }
    } finally {
      setLoading(false);
    }
  }, [tableName, connected, invalidateCache]);

  const remove = useCallback(async (id: any) => {
    if (!tableName || !connected) {
      throw new Error('Table name required and must be connected');
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/database/table-data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Invalidate cache to trigger refetch
          invalidateCache();
          return true;
        } else {
          throw new Error(result.message || 'Delete failed');
        }
      } else {
        throw new Error(`HTTP ${response.status}: Delete failed`);
      }
    } finally {
      setLoading(false);
    }
  }, [tableName, connected, invalidateCache]);

  return {
    insert,
    update,
    remove,
    loading,
  };
}