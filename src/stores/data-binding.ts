import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dataSourceManager } from '@/lib/data-sources/DataSourceManager';
import {
  DataSourceConfig,
  ComponentDataBinding,
  QueryResult,
  TableSchema,
  ColumnSchema
} from '@/lib/data-sources/types';

export interface DataBindingState {
  // Data sources
  dataSources: DataSourceConfig[];
  activeDataSourceId: string | null;
  
  // Schema cache
  schemas: Map<string, TableSchema>;
  tables: string[];
  schemasLoading: boolean;
  
  // Component bindings
  componentBindings: Map<string, {
    componentId: string;
    binding: ComponentDataBinding;
    lastFetched: Date;
    cached: boolean;
  }>;
  
  // Query cache and state
  cache: Map<string, {
    key: string;
    data: QueryResult;
    timestamp: Date;
    ttl: number;
  }>;
  loading: Map<string, boolean>;
  errors: Map<string, string>;
  
  // Real-time subscriptions
  subscriptions: Map<string, any>;
  
  // Global column configurations
  globalColumnConfigs: Map<string, {
    tableName: string;
    columnName: string;
    displayName?: string;
    displayType?: 'text' | 'badge' | 'date' | 'currency' | 'percentage' | 'image' | 'link';
    displayFormat?: string;
  }>;

  // Initialize the store
  initialize: () => void;

  // Actions
  addDataSource: (config: DataSourceConfig) => void;
  removeDataSource: (id: string) => void;
  updateDataSource: (id: string, updates: Partial<DataSourceConfig>) => void;
  setActiveDataSource: (id: string) => void;
  
  // Schema operations
  loadTableSchema: (tableName: string, dataSourceId?: string) => Promise<void>;
  refreshSchemas: (dataSourceId?: string) => Promise<void>;
  
  // Component binding operations
  setComponentBinding: (componentId: string, binding: ComponentDataBinding) => void;
  getComponentBinding: (componentId: string) => any;
  removeComponentBinding: (componentId: string) => void;
  
  // Data operations
  queryData: (componentId: string, options?: any) => Promise<QueryResult>;
  
  // Real-time operations
  subscribeToTable: (componentId: string, tableName: string) => void;
  unsubscribeFromTable: (componentId: string) => void;
  
  // Cache operations
  invalidateCache: (pattern?: string) => void;
  
  // Global column configuration
  setGlobalColumnConfig: (tableName: string, columnName: string, config: any) => void;
  getGlobalColumnConfig: (tableName: string, columnName: string) => any;
  
  // Utility
  setError: (key: string, error: string) => void;
  clearError: (key: string) => void;
  setLoading: (key: string, loading: boolean) => void;
}

export const useDataBindingStore = create<DataBindingState>()(
  persist(
    (set, get) => ({
      dataSources: [],
      activeDataSourceId: null,
      schemas: new Map(),
      tables: [],
      schemasLoading: false,
      componentBindings: new Map(),
      cache: new Map(),
      loading: new Map(),
      errors: new Map(),
      subscriptions: new Map(),
      globalColumnConfigs: new Map(),

      // Initialize the store with error boundaries
      initialize: async () => {
        console.log('[DataBindingStore] Initializing store...');
        
        try {
          const state = get();
          console.log('[DataBindingStore] Current state:', {
            dataSourcesCount: state.dataSources.length,
            activeDataSourceId: state.activeDataSourceId
          });
          
          // Prevent re-initialization if already in progress or completed
          if (state.dataSources.length > 0 && state.activeDataSourceId) {
            console.log('[DataBindingStore] Store already initialized, skipping...');
            return;
          }
          
          console.log('[DataBindingStore] Setting up unified backend API connection...');
          
          // Use unified SupabaseAdapter for all connections
          const backendDataSource: DataSourceConfig = {
            id: 'primary-backend',
            name: 'Backend Database',
            type: 'supabase', // Use the unified adapter
            connection: {
              apiUrl: window.location.origin
            },
            isActive: true
          };

          console.log('[DataBindingStore] Adding backend API data source to store...');
          set(state => ({
            ...state,
            dataSources: [...state.dataSources.filter(ds => ds.id !== backendDataSource.id), backendDataSource],
            activeDataSourceId: backendDataSource.id,
            errors: new Map()
          }));

          // Initialize the data source with the manager
          console.log('[DataBindingStore] Initializing backend API data source with manager...');
          const success = await dataSourceManager.addDataSource(backendDataSource);
          console.log('[DataBindingStore] Backend API data source initialization result:', success);
          
          if (!success) {
            console.warn('[DataBindingStore] Failed to initialize data source, but continuing...');
          }
        } catch (error) {
          console.error('[DataBindingStore] Error during initialization:', error);
          set(state => ({
            ...state,
            errors: new Map([['general', `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`]])
          }));
        }
        
        console.log('[DataBindingStore] Store initialization complete');
      },

      // Reset store state and clear corrupted data
      resetStore: () => {
        console.log('[DataBindingStore] Resetting store state...');
        set({
          dataSources: [],
          activeDataSourceId: null,
          schemas: new Map(),
          componentBindings: new Map(),
          cache: new Map(),
          loading: new Map(),
          errors: new Map(),
          subscriptions: new Map(),
          globalColumnConfigs: new Map(),
        });
      },

      addDataSource: (config: DataSourceConfig) => {
        set(state => ({
          ...state,
          dataSources: [...state.dataSources, config],
          activeDataSourceId: state.activeDataSourceId || config.id
        }));
      },

      removeDataSource: (id: string) => {
        set(state => {
          const newDataSources = state.dataSources.filter(ds => ds.id !== id);
          return {
            ...state,
            dataSources: newDataSources,
            activeDataSourceId: state.activeDataSourceId === id ? (newDataSources[0]?.id || null) : state.activeDataSourceId
          };
        });
      },

      updateDataSource: (id: string, updates: Partial<DataSourceConfig>) => {
        set(state => {
          const newDataSources = state.dataSources.map(ds => 
            ds.id === id ? { ...ds, ...updates } : ds
          );
          return { ...state, dataSources: newDataSources };
        });
      },

      setActiveDataSource: (id: string) => {
        set({ activeDataSourceId: id });
      },

      loadTableSchema: async (tableName: string, dataSourceId?: string) => {
        const sourceId = dataSourceId || get().activeDataSourceId;
        if (!sourceId) return;

        try {
          set(state => {
            const newLoading = new Map(state.loading);
            newLoading.set(`schema-${tableName}`, true);
            const newErrors = new Map(state.errors);
            newErrors.delete(`schema-${tableName}`);
            return { ...state, loading: newLoading, errors: newErrors };
          });

          const schema = await dataSourceManager.getTableSchema(tableName, sourceId);
          
          set(state => {
            const newSchemas = new Map(state.schemas);
            newSchemas.set(tableName, schema);
            const newLoading = new Map(state.loading);
            newLoading.delete(`schema-${tableName}`);
            return { ...state, schemas: newSchemas, loading: newLoading };
          });
        } catch (error) {
          set(state => {
            const newErrors = new Map(state.errors);
            newErrors.set(`schema-${tableName}`, error instanceof Error ? error.message : 'Failed to load schema');
            const newLoading = new Map(state.loading);
            newLoading.delete(`schema-${tableName}`);
            return { ...state, errors: newErrors, loading: newLoading };
          });
        }
      },

      refreshSchemas: async (dataSourceId?: string) => {
        const sourceId = dataSourceId || get().activeDataSourceId;
        if (!sourceId) return;

        try {
          set(state => ({ ...state, schemasLoading: true }));
          
          // Add the data source to the manager if it doesn't exist
          const { dataSources } = get();
          const dataSource = dataSources.find(ds => ds.id === sourceId);
          if (dataSource) {
            await dataSourceManager.addDataSource(dataSource);
          }
          
          const tables = await dataSourceManager.getAllTables(sourceId);
          
          set(state => ({
            ...state,
            tables,
            schemasLoading: false
          }));
        } catch (error) {
          console.error('Failed to refresh schemas:', error);
          set(state => ({ ...state, schemasLoading: false }));
        }
      },

      setComponentBinding: (componentId: string, binding: ComponentDataBinding) => {
        set(state => {
          const newBindings = new Map(state.componentBindings);
          newBindings.set(componentId, {
            componentId,
            binding,
            lastFetched: new Date(),
            cached: false
          });
          return { ...state, componentBindings: newBindings };
        });
      },

      getComponentBinding: (componentId: string) => {
        return get().componentBindings.get(componentId) || null;
      },

      removeComponentBinding: (componentId: string) => {
        // Clean up subscription
        get().unsubscribeFromTable(componentId);
        
        set(state => {
          const newBindings = new Map(state.componentBindings);
          newBindings.delete(componentId);
          return { ...state, componentBindings: newBindings };
        });
      },

      queryData: async (componentId: string, options?: any) => {
        const binding = get().getComponentBinding(componentId);
        if (!binding || !binding.binding.tableName) {
          return { data: [], count: 0, error: 'No binding configuration found' };
        }

        try {
          set(state => {
            const newLoading = new Map(state.loading);
            newLoading.set(`query-${componentId}`, true);
            const newErrors = new Map(state.errors);
            newErrors.delete(`query-${componentId}`);
            return { ...state, loading: newLoading, errors: newErrors };
          });

          const queryOptions = {
            table: binding.binding.tableName,
            ...binding.binding.queryOptions,
            ...options
          };

          const result = await dataSourceManager.query(queryOptions, binding.binding.dataSourceId);

          // Cache the result if successful
          if (!result.error) {
            const cacheKey = `${componentId}-${JSON.stringify(queryOptions)}`;
            set(state => {
              const newCache = new Map(state.cache);
              newCache.set(cacheKey, {
                key: cacheKey,
                data: result,
                timestamp: new Date(),
                ttl: 5 * 60 * 1000 // 5 minutes
              });
              return { ...state, cache: newCache };
            });
          }

          set(state => {
            const newLoading = new Map(state.loading);
            newLoading.delete(`query-${componentId}`);
            if (result.error) {
              const newErrors = new Map(state.errors);
              newErrors.set(`query-${componentId}`, result.error);
              return { ...state, loading: newLoading, errors: newErrors };
            }
            return { ...state, loading: newLoading };
          });

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Query failed';
          set(state => {
            const newLoading = new Map(state.loading);
            newLoading.delete(`query-${componentId}`);
            const newErrors = new Map(state.errors);
            newErrors.set(`query-${componentId}`, errorMessage);
            return { ...state, loading: newLoading, errors: newErrors };
          });
          
          return { data: [], count: 0, error: errorMessage };
        }
      },

      subscribeToTable: (componentId: string, tableName: string) => {
        // Implementation depends on the data source adapter
        // For now, just track the subscription
        set(state => {
          const newSubscriptions = new Map(state.subscriptions);
          newSubscriptions.set(componentId, { tableName });
          return { ...state, subscriptions: newSubscriptions };
        });
      },

      unsubscribeFromTable: (componentId: string) => {
        set(state => ({
          ...state,
          subscriptions: new Map(Array.from(state.subscriptions.entries()).filter(([key]) => key !== componentId))
        }));
      },

      invalidateCache: (pattern?: string) => {
        set(state => {
          if (pattern) {
            // Remove cache entries matching pattern
            const newCache = new Map();
            for (const [key, value] of state.cache) {
              if (!key.includes(pattern)) {
                newCache.set(key, value);
              }
            }
            return { ...state, cache: newCache };
          } else {
            // Clear all cache
            return { ...state, cache: new Map() };
          }
        });
      },

      setGlobalColumnConfig: (tableName: string, columnName: string, config: any) => {
        const key = `${tableName}.${columnName}`;
        set(state => {
          const newConfigs = new Map(state.globalColumnConfigs);
          newConfigs.set(key, {
            tableName,
            columnName,
            ...config
          });
          return { ...state, globalColumnConfigs: newConfigs };
        });
      },

      getGlobalColumnConfig: (tableName: string, columnName: string) => {
        const key = `${tableName}.${columnName}`;
        return get().globalColumnConfigs.get(key) || null;
      },

      setError: (key: string, error: string) => {
        set(state => {
          const newErrors = new Map(state.errors);
          newErrors.set(key, error);
          return { ...state, errors: newErrors };
        });
      },

      clearError: (key: string) => {
        set(state => {
          const newErrors = new Map(state.errors);
          newErrors.delete(key);
          return { ...state, errors: newErrors };
        });
      },

      setLoading: (key: string, loading: boolean) => {
        set(state => {
          const newLoading = new Map(state.loading);
          if (loading) {
            newLoading.set(key, true);
          } else {
            newLoading.delete(key);
          }
          return { ...state, loading: newLoading };
        });
      }
    }),
    {
      name: 'data-binding-storage',
      partialize: (state) => ({
        dataSources: state.dataSources,
        activeDataSourceId: state.activeDataSourceId,
        globalColumnConfigs: Array.from(state.globalColumnConfigs.entries()),
        // Don't persist cache, loading states, or subscriptions
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        // Restore Maps from persisted arrays
        globalColumnConfigs: new Map(persistedState.globalColumnConfigs || []),
        // Reset non-persistent state
        schemas: new Map(),
        cache: new Map(),
        loading: new Map(),
        errors: new Map(),
        subscriptions: new Map(),
        componentBindings: new Map(),
      }),
    }
  )
);