import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Simplified interfaces matching dashboard pattern
interface SupabaseTable {
  name: string;
  schema: string;
  path?: string;
}

interface TableSchema {
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    default?: any;
    isPrimaryKey?: boolean;
  }>;
}

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

interface DataBindingState {
  // Connection status (simplified)
  connected: boolean;
  connectionError: string | null;
  initializing: boolean;
  
  // Tables
  tables: SupabaseTable[];
  tablesLoading: boolean;
  tablesError: string | null;
  
  // Schema cache
  schemas: Map<string, TableSchema>;
  
  // Component bindings
  componentBindings: Map<string, ComponentDataBinding>;
  
  // Query cache and loading states
  dataCache: Map<string, any>;
  loadingStates: Map<string, boolean>;
  errors: Map<string, string>;
  
  // Promise tracking to prevent duplicate requests
  initializationPromise: Promise<void> | null;
  tablesPromise: Promise<void> | null;
  
  // Actions
  initialize: () => Promise<void>;
  fetchTables: () => Promise<void>;
  loadTableSchema: (tableName: string) => Promise<TableSchema | null>;
  queryData: (componentId: string, binding: ComponentDataBinding) => Promise<any>;
  setComponentBinding: (componentId: string, binding: ComponentDataBinding) => void;
  getComponentBinding: (componentId: string) => ComponentDataBinding | null;
  removeComponentBinding: (componentId: string) => void;
  clearError: (key: string) => void;
  invalidateCache: (componentId?: string) => void;
}

export const useDataBindingStore = create<DataBindingState>()(
  persist(
    (set, get) => ({
      connected: false,
      connectionError: null,
      initializing: false,
      tables: [],
      tablesLoading: false,
      tablesError: null,
      schemas: new Map(),
      componentBindings: new Map(),
      dataCache: new Map(),
      loadingStates: new Map(),
      errors: new Map(),
      initializationPromise: null,
      tablesPromise: null,

      initialize: async () => {
        const state = get();
        
        // Prevent duplicate initialization with stronger protection
        if (state.initializing || state.initializationPromise) {
          return state.initializationPromise;
        }

        const initPromise = (async () => {
          set({ initializing: true, connectionError: null });

          try {
            const response = await fetch('/api/database/connections', {
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
              }
            });
            
            if (response.ok) {
              const connections = await response.json();
              const connected = connections.supabase?.connected || false;
              
              set({ 
                connected,
                connectionError: connected ? null : 'Not connected to database',
                initializing: false,
                initializationPromise: null
              });
              
              // Fetch tables if connected
              if (connected) {
                await get().fetchTables();
              }
            } else {
              set({ 
                connected: false,
                connectionError: `Failed to check connection status: ${response.status}`,
                initializing: false,
                initializationPromise: null
              });
            }
          } catch (error) {
            console.error('[DataBindingStore] Initialization error:', error);
            set({ 
              connected: false,
              connectionError: `Connection check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              initializing: false,
              initializationPromise: null
            });
          }
        })();

        set({ initializationPromise: initPromise });
        return initPromise;
      },

      fetchTables: async () => {
        const state = get();
        
        // Prevent duplicate requests with stronger protection
        if (state.tablesLoading || state.tablesPromise) {
          return state.tablesPromise;
        }

        const fetchPromise = (async () => {
          set({ tablesLoading: true, tablesError: null });
          
          try {
            const response = await fetch('/api/database/supabase-tables', {
              credentials: 'include'
            });
            
            if (response.ok) {
              const result = await response.json();
              if (result.success && result.data?.tables) {
                set({ 
                  tables: result.data.tables,
                  tablesLoading: false,
                  tablesError: null,
                  tablesPromise: null
                });
              } else {
                set({ 
                  tablesError: result.message || 'Failed to fetch tables',
                  tablesLoading: false,
                  tablesPromise: null
                });
              }
            } else {
              set({ 
                tablesError: 'Failed to fetch tables',
                tablesLoading: false,
                tablesPromise: null
              });
            }
          } catch (error) {
            console.error('[DataBindingStore] Error fetching tables:', error);
            set({ 
              tablesError: 'Network error fetching tables',
              tablesLoading: false,
              tablesPromise: null
            });
          }
        })();

        set({ tablesPromise: fetchPromise });
        return fetchPromise;
      },

      loadTableSchema: async (tableName: string): Promise<TableSchema | null> => {
        // Check cache first
        const cached = get().schemas.get(tableName);
        if (cached) {
          return cached;
        }
        
        try {
          const response = await fetch(`/api/database/table-schema/${encodeURIComponent(tableName)}`, {
            credentials: 'include'
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
              // Transform database column structure to frontend format
              const transformedColumns = result.data.columns.map((col: any) => ({
                name: col.column_name || col.name, // Handle both formats
                type: col.data_type || col.type,
                nullable: col.is_nullable === 'YES' || col.nullable,
                default: col.column_default || col.default,
                isPrimaryKey: col.is_primary || col.isPrimaryKey
              }));
              
              const schema: TableSchema = { columns: transformedColumns };
              
              // Cache the schema
              set((state) => {
                const newSchemas = new Map(state.schemas);
                newSchemas.set(tableName, schema);
                return { schemas: newSchemas };
              });
              
              return schema;
            }
          }
        } catch (error) {
          console.error('[DataBindingStore] Error loading schema:', error);
        }
        
        return null;
      },

      queryData: async (componentId: string, binding: ComponentDataBinding) => {
        const state = get();
        
        // Prevent duplicate requests
        if (state.loadingStates.get(componentId)) {
          return state.dataCache.get(componentId);
        }
        
        // Set loading state
        set((state) => {
          const newLoadingStates = new Map(state.loadingStates);
          newLoadingStates.set(componentId, true);
          return { loadingStates: newLoadingStates };
        });
        
        try {
          // Build query parameters
          const params = new URLSearchParams();
          params.append('limit', binding.pagination.pageSize.toString());
          params.append('offset', (binding.pagination.page * binding.pagination.pageSize).toString());
          
          if (binding.sorting.enabled && binding.sorting.column) {
            params.append('orderBy', binding.sorting.column);
            params.append('orderDirection', binding.sorting.direction || 'asc');
          }
          
          // Add filters
          Object.entries(binding.filtering.filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
              params.append(`filter_${key}`, value.toString());
            }
          });
          
          const response = await fetch(`/api/database/table-data/${encodeURIComponent(binding.tableName)}?${params}`, {
            credentials: 'include'
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.success) {
              // Cache the result
              set((state) => {
                const newDataCache = new Map(state.dataCache);
                const newLoadingStates = new Map(state.loadingStates);
                const newErrors = new Map(state.errors);
                
                newDataCache.set(componentId, result.data);
                newLoadingStates.delete(componentId);
                newErrors.delete(componentId);
                
                return { 
                  dataCache: newDataCache,
                  loadingStates: newLoadingStates,
                  errors: newErrors
                };
              });
              
              return result.data;
            } else {
              throw new Error(result.message || 'Query failed');
            }
          } else {
            throw new Error(`HTTP ${response.status}: Failed to query data`);
          }
        } catch (error) {
          console.error('[DataBindingStore] Query error:', error);
          
          // Set error state
          set((state) => {
            const newLoadingStates = new Map(state.loadingStates);
            const newErrors = new Map(state.errors);
            
            newLoadingStates.delete(componentId);
            newErrors.set(componentId, error instanceof Error ? error.message : 'Query failed');
            
            return { 
              loadingStates: newLoadingStates,
              errors: newErrors
            };
          });
          
          throw error;
        }
      },

      setComponentBinding: (componentId: string, binding: ComponentDataBinding) => {
        set((state) => {
          const newBindings = new Map(state.componentBindings);
          newBindings.set(componentId, binding);
          return { componentBindings: newBindings };
        });
      },

      getComponentBinding: (componentId: string) => {
        return get().componentBindings.get(componentId) || null;
      },

      removeComponentBinding: (componentId: string) => {
        set((state) => {
          const newBindings = new Map(state.componentBindings);
          const newDataCache = new Map(state.dataCache);
          const newLoadingStates = new Map(state.loadingStates);
          const newErrors = new Map(state.errors);
          
          newBindings.delete(componentId);
          newDataCache.delete(componentId);
          newLoadingStates.delete(componentId);
          newErrors.delete(componentId);
          
          return { 
            componentBindings: newBindings,
            dataCache: newDataCache,
            loadingStates: newLoadingStates,
            errors: newErrors
          };
        });
      },

      clearError: (key: string) => {
        set((state) => {
          const newErrors = new Map(state.errors);
          newErrors.delete(key);
          return { errors: newErrors };
        });
      },

      invalidateCache: (componentId?: string) => {
        set((state) => {
          if (componentId) {
            const newDataCache = new Map(state.dataCache);
            newDataCache.delete(componentId);
            return { dataCache: newDataCache };
          } else {
            return { 
              dataCache: new Map(),
              schemas: new Map()
            };
          }
        });
      },
    }),
    {
      name: 'data-binding-simple-storage',
      partialize: (state) => ({
        // Only persist component bindings
        componentBindings: Array.from(state.componentBindings.entries()),
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        // Restore component bindings
        componentBindings: new Map(persistedState.componentBindings || []),
        // Reset all other state
        connected: false,
        connectionError: null,
        initializing: false,
        tables: [],
        tablesLoading: false,
        tablesError: null,
        schemas: new Map(),
        dataCache: new Map(),
        loadingStates: new Map(),
        errors: new Map(),
        initializationPromise: null,
        tablesPromise: null,
      }),
    }
  )
);