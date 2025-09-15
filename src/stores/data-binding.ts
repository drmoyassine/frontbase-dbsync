import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
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
    immer((set, get) => ({
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

      // Initialize the store
      initialize: () => {
        // Initialize default data source if needed
        const state = get();
        if (state.dataSources.length === 0) {
          // Add the existing backend connection as default
          const defaultDataSource: DataSourceConfig = {
            id: 'default-backend',
            name: 'Backend Database',
            type: 'supabase', // Using supabase adapter for the backend
            connection: {
              url: window.location.origin,
              type: 'backend'
            },
            isActive: true
          };
          
          set(state => {
            state.dataSources.push(defaultDataSource);
            state.activeDataSourceId = defaultDataSource.id;
          });
        }
      },

      addDataSource: (config: DataSourceConfig) => {
        set(state => {
          state.dataSources.push(config);
          if (!state.activeDataSourceId) {
            state.activeDataSourceId = config.id;
          }
        });
      },

      removeDataSource: (id: string) => {
        set(state => {
          state.dataSources = state.dataSources.filter(ds => ds.id !== id);
          if (state.activeDataSourceId === id) {
            state.activeDataSourceId = state.dataSources[0]?.id || null;
          }
        });
      },

      updateDataSource: (id: string, updates: Partial<DataSourceConfig>) => {
        set(state => {
          const index = state.dataSources.findIndex(ds => ds.id === id);
          if (index !== -1) {
            state.dataSources[index] = { ...state.dataSources[index], ...updates };
          }
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
            return { loading: newLoading, errors: newErrors };
          });

          const schema = await dataSourceManager.getTableSchema(tableName, sourceId);
          
          set(state => {
            const newSchemas = new Map(state.schemas);
            newSchemas.set(tableName, schema);
            const newLoading = new Map(state.loading);
            newLoading.delete(`schema-${tableName}`);
            return { schemas: newSchemas, loading: newLoading };
          });
        } catch (error) {
          set(state => {
            const newErrors = new Map(state.errors);
            newErrors.set(`schema-${tableName}`, error instanceof Error ? error.message : 'Failed to load schema');
            const newLoading = new Map(state.loading);
            newLoading.delete(`schema-${tableName}`);
            return { errors: newErrors, loading: newLoading };
          });
        }
      },

      refreshSchemas: async (dataSourceId?: string) => {
        const sourceId = dataSourceId || get().activeDataSourceId;
        if (!sourceId) return;

        try {
          set({ schemasLoading: true });
          
          const tables = await dataSourceManager.getAllTables(sourceId);
          
          set(state => {
            state.tables = tables;
            state.schemasLoading = false;
          });
        } catch (error) {
          console.error('Failed to refresh schemas:', error);
          set({ schemasLoading: false });
        }
      },

      setComponentBinding: (componentId: string, binding: ComponentDataBinding) => {
        set(state => ({
          componentBindings: new Map(state.componentBindings).set(componentId, {
            componentId,
            binding,
            lastFetched: new Date(),
            cached: false
          })
        }));
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
          return { componentBindings: newBindings };
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
            return { loading: newLoading, errors: newErrors };
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
            set(state => ({
              cache: new Map(state.cache).set(cacheKey, {
                key: cacheKey,
                data: result,
                timestamp: new Date(),
                ttl: 5 * 60 * 1000 // 5 minutes
              })
            }));
          }

          set(state => {
            const newLoading = new Map(state.loading);
            newLoading.delete(`query-${componentId}`);
            if (result.error) {
              const newErrors = new Map(state.errors);
              newErrors.set(`query-${componentId}`, result.error);
              return { loading: newLoading, errors: newErrors };
            }
            return { loading: newLoading };
          });

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Query failed';
          set(state => {
            const newLoading = new Map(state.loading);
            newLoading.delete(`query-${componentId}`);
            const newErrors = new Map(state.errors);
            newErrors.set(`query-${componentId}`, errorMessage);
            return { loading: newLoading, errors: newErrors };
          });
          
          return { data: [], count: 0, error: errorMessage };
        }
      },

      subscribeToTable: (componentId: string, tableName: string) => {
        // Implementation depends on the data source adapter
        // For now, just track the subscription
        set(state => ({
          subscriptions: new Map(state.subscriptions).set(componentId, { tableName })
        }));
      },

      unsubscribeFromTable: (componentId: string) => {
        set(state => {
          const newSubscriptions = new Map(state.subscriptions);
          newSubscriptions.delete(componentId);
          return { subscriptions: newSubscriptions };
        });
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
            return { cache: newCache };
          } else {
            // Clear all cache
            return { cache: new Map() };
          }
        });
      },

      setGlobalColumnConfig: (tableName: string, columnName: string, config: any) => {
        const key = `${tableName}.${columnName}`;
        set(state => ({
          globalColumnConfigs: new Map(state.globalColumnConfigs).set(key, {
            tableName,
            columnName,
            ...config
          })
        }));
      },

      getGlobalColumnConfig: (tableName: string, columnName: string) => {
        const key = `${tableName}.${columnName}`;
        return get().globalColumnConfigs.get(key) || null;
      },

      setError: (key: string, error: string) => {
        set(state => ({
          errors: new Map(state.errors).set(key, error)
        }));
      },

      clearError: (key: string) => {
        set(state => {
          const newErrors = new Map(state.errors);
          newErrors.delete(key);
          return { errors: newErrors };
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
          return { loading: newLoading };
        });
      }
    })),
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