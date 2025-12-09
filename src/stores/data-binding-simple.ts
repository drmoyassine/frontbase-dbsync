import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debug } from '@/lib/debug';
import { requestDeduplicator, generateRequestKey } from '@/lib/request-deduplicator';
import { databaseApi, SupabaseTable, TableSchema } from '@/services/database-api';
import { ComponentDataBinding } from '@/hooks/data/useSimpleData';

// Import dashboard store for connection/table state synchronization
let getDashboardState: () => any;

interface DataBindingState {
  // Connection status (derived from dashboard store)
  connected: boolean;
  connectionError: string | null;

  // Tables (owned by data-binding store)
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
  counts: Map<string, number>;

  // Actions
  initialize: () => void;
  syncConnectionStatus: () => Promise<void>;
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
      tables: [],
      tablesLoading: false,
      tablesError: null,
      schemas: new Map(),
      componentBindings: new Map(),
      dataCache: new Map(),
      loadingStates: new Map(),
      errors: new Map(),
      counts: new Map(),

      // Initialize by syncing connection status and fetching tables
      initialize: () => {
        const initializeAsync = async () => {
          await get().syncConnectionStatus();
          if (get().connected) {
            await get().fetchTables();
          }
        };

        initializeAsync().catch(error => {
          debug.error('DATA_BINDING', 'Initialization failed:', error);
        });
      },

      // Sync only connection status from dashboard store
      syncConnectionStatus: async () => {
        try {
          // Use dynamic import to avoid circular dependency
          if (!getDashboardState) {
            const dashboardModule = await import('./dashboard');
            getDashboardState = dashboardModule.useDashboardStore.getState;
          }

          const dashboardState = getDashboardState();

          const connected = dashboardState.connections.supabase?.connected || false;
          const connectionError = connected ? null : 'Not connected to database';

          set({
            connected,
            connectionError
          });

          debug.critical('DATA_BINDING', 'Synced connection status:', { connected });
        } catch (error) {
          debug.error('DATA_BINDING', 'Failed to sync connection status:', error);
        }
      },

      // Fetch tables from API (owns this responsibility)
      fetchTables: async () => {
        if (!get().connected) {
          debug.error('DATA_BINDING', 'Cannot fetch tables: not connected');
          return;
        }

        const requestKey = generateRequestKey('/api/database/supabase-tables');

        return requestDeduplicator.dedupe(requestKey, async () => {
          set({ tablesLoading: true, tablesError: null });

          try {
            const result = await databaseApi.fetchTables();

            if (result.success) {
              set({
                tables: result.data.tables,
                tablesLoading: false,
                tablesError: null
              });
              debug.critical('DATA_BINDING', 'Tables fetched:', result.data.tables.length);
            } else {
              set({
                tablesError: result.message || 'Failed to fetch tables',
                tablesLoading: false
              });
            }
          } catch (error) {
            console.error('Failed to fetch Supabase tables:', error);
            set({
              tablesError: 'Failed to fetch tables',
              tablesLoading: false
            });
          }
        });
      },

      loadTableSchema: async (tableName: string): Promise<TableSchema | null> => {
        // Check cache first
        const cached = get().schemas.get(tableName);
        if (cached) {
          return cached;
        }

        try {
          const result = await databaseApi.fetchTableSchema(tableName);

          if (result.success && result.data) {
            // Transform database column structure to frontend format
            const transformedColumns = result.data.columns.map((col: any) => ({
              name: col.column_name || col.name, // Handle both formats
              type: col.data_type || col.type,
              nullable: col.is_nullable === 'YES' || col.nullable,
              default: col.column_default || col.default,
              isPrimaryKey: col.is_primary || col.isPrimaryKey,
              foreignKey: (col.is_foreign || col.isForeign) && (col.foreign_table || col.foreignTable) ? {
                table: col.foreign_table || col.foreignTable,
                column: col.foreign_column || col.foreignColumn
              } : undefined
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
        } catch (error) {
          console.error('[DataBindingStore] Error loading schema:', error);
        }

        return null;
      },

      queryData: async (componentId: string, binding: ComponentDataBinding) => {
        const state = get();

        // Prevent duplicate requests
        if (state.loadingStates.get(componentId)) {
          console.log('[DataBindingStore] Request already in progress for:', componentId);
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

          // Construct select parameter with joins
          const selectParts = ['*'];
          const relatedTables = new Set<string>();

          // Check column overrides for related columns (e.g., "institutions.name")
          if (binding.columnOverrides) {
            Object.keys(binding.columnOverrides).forEach(key => {
              if (key.includes('.')) {
                const [table, column] = key.split('.');
                if (table && column) {
                  relatedTables.add(table);
                }
              }
            });
          }

          // Add related tables to select (e.g., "institutions(*)")
          relatedTables.forEach(table => {
            // Prevent adding self-reference as a relation unless it's distinct (which this logic doesn't support yet)
            // If we are querying 'institutions', we don't need to join 'institutions' to get columns already on it.
            // However, usually 'institutions.name' on 'institutions' table is just 'name'.
            // If the user managed to configure 'institutions.name' while on 'institutions' table, we should just NOT add the join.
            if (table !== binding.tableName) {
              selectParts.push(`${table}(*)`);
            }
          });

          params.append('select', selectParts.join(','));

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

          console.log('[DataBindingStore] Query params:', {
            tableName: binding.tableName,
            params: params.toString(),
            binding: {
              sorting: binding.sorting,
              filtering: binding.filtering,
              pagination: binding.pagination
            }
          });

          const result = await databaseApi.queryData(binding.tableName, params);

          if (result.success) {
            // Cache the result
            set((state) => {
              const newDataCache = new Map(state.dataCache);
              const newLoadingStates = new Map(state.loadingStates);
              const newErrors = new Map(state.errors);
              const newCounts = new Map(state.counts);

              newDataCache.set(componentId, result.data);
              newLoadingStates.delete(componentId);
              newErrors.delete(componentId);

              if (typeof result.total === 'number') {
                newCounts.set(componentId, result.total);
              }

              return {
                dataCache: newDataCache,
                loadingStates: newLoadingStates,
                errors: newErrors,
                counts: newCounts
              };
            });

            return result.data;
          } else {
            throw new Error(result.message || 'Query failed');
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
          const newCounts = new Map(state.counts);

          newBindings.delete(componentId);
          newDataCache.delete(componentId);
          newLoadingStates.delete(componentId);
          newErrors.delete(componentId);
          newCounts.delete(componentId);

          return {
            componentBindings: newBindings,
            dataCache: newDataCache,
            loadingStates: newLoadingStates,
            errors: newErrors,
            counts: newCounts
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
              schemas: new Map(),
              counts: new Map()
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
        // Reset all other state - connection will be synced from dashboard
        connected: false,
        connectionError: null,
        tables: [],
        tablesError: null,
        schemas: new Map(),
        dataCache: new Map(),
        loadingStates: new Map(),
        errors: new Map(),
        counts: new Map(),
      }),
    }
  )
);

