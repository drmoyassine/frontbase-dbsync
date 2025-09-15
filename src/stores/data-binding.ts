import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ComponentDataBinding, DataSourceConfig, TableSchema, QueryResult } from '@/lib/data-sources/types';
import { dataSourceManager } from '@/lib/data-sources/DataSourceManager';

interface ComponentDataConfig {
  componentId: string;
  binding: ComponentDataBinding;
  lastFetched?: Date;
  cached?: boolean;
}

interface CachedData {
  key: string;
  data: QueryResult;
  timestamp: Date;
  ttl: number; // in seconds
}

interface DataBindingState {
  // Data sources
  dataSources: DataSourceConfig[];
  activeDataSourceId: string | null;
  
  // Schemas and tables
  schemas: Map<string, TableSchema>;
  tables: string[];
  schemasLoading: boolean;
  
  // Component bindings
  componentBindings: Map<string, ComponentDataConfig>;
  
  // Data cache
  cache: Map<string, CachedData>;
  
  // Global column configurations
  globalColumnConfigs: Map<string, Record<string, any>>;
  
  // Loading states
  loading: Map<string, boolean>;
  errors: Map<string, string>;
  
  // Real-time subscriptions
  subscriptions: Map<string, () => void>;
  
  // Actions
  initializeDataSources: () => Promise<void>;
  addDataSource: (config: DataSourceConfig) => Promise<boolean>;
  removeDataSource: (id: string) => void;
  setActiveDataSource: (id: string) => boolean;
  
  // Schema management
  loadTableSchema: (tableName: string) => Promise<TableSchema | null>;
  refreshSchemas: () => Promise<void>;
  
  // Component binding
  setComponentBinding: (componentId: string, binding: ComponentDataBinding) => void;
  getComponentBinding: (componentId: string) => ComponentDataConfig | null;
  removeComponentBinding: (componentId: string) => void;
  
  // Data operations
  queryData: (componentId: string, options?: any) => Promise<QueryResult>;
  invalidateCache: (key?: string) => void;
  
  // Global column configuration
  setGlobalColumnConfig: (tableName: string, columnName: string, config: any) => void;
  getGlobalColumnConfig: (tableName: string, columnName: string) => any;
  
  // Real-time
  subscribeToTable: (componentId: string, tableName: string) => Promise<void>;
  unsubscribeFromTable: (componentId: string) => void;
  
  // Utility
  clearErrors: () => void;
  setError: (key: string, error: string) => void;
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
      globalColumnConfigs: new Map(),
      loading: new Map(),
      errors: new Map(),
      subscriptions: new Map(),

      initializeDataSources: async () => {
        try {
          // Initialize with existing Supabase connection if available
          const response = await fetch('/api/database/connections', {
            credentials: 'include'
          });
          
          if (response.ok) {
            const connections = await response.json();
            
            if (connections.supabase?.connected) {
              const supabaseConfig: DataSourceConfig = {
                id: 'default-supabase',
                name: 'Supabase',
                type: 'supabase',
                connection: {
                  url: connections.supabase.url,
                  anonKey: connections.supabase.anonKey,
                  serviceKey: connections.supabase.serviceKey
                },
                isActive: true
              };
              
              const added = await dataSourceManager.addDataSource(supabaseConfig);
              if (added) {
                set(state => ({
                  dataSources: [...state.dataSources.filter(ds => ds.id !== supabaseConfig.id), supabaseConfig],
                  activeDataSourceId: supabaseConfig.id
                }));
                
                // Load tables
                await get().refreshSchemas();
              }
            }
          }
        } catch (error) {
          console.error('Error initializing data sources:', error);
        }
      },

      addDataSource: async (config: DataSourceConfig) => {
        try {
          const success = await dataSourceManager.addDataSource(config);
          if (success) {
            set(state => ({
              dataSources: [...state.dataSources.filter(ds => ds.id !== config.id), config],
              activeDataSourceId: config.isActive ? config.id : state.activeDataSourceId
            }));
            
            if (config.isActive) {
              await get().refreshSchemas();
            }
            
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error adding data source:', error);
          return false;
        }
      },

      removeDataSource: (id: string) => {
        dataSourceManager.removeDataSource(id);
        set(state => ({
          dataSources: state.dataSources.filter(ds => ds.id !== id),
          activeDataSourceId: state.activeDataSourceId === id ? null : state.activeDataSourceId
        }));
      },

      setActiveDataSource: (id: string) => {
        const success = dataSourceManager.setActiveDataSource(id);
        if (success) {
          set({ activeDataSourceId: id });
          get().refreshSchemas();
        }
        return success;
      },

      loadTableSchema: async (tableName: string) => {
        try {
          set(state => {
            const newLoading = new Map(state.loading);
            newLoading.set(`schema-${tableName}`, true);
            const newErrors = new Map(state.errors);
            newErrors.delete(`schema-${tableName}`);
            return { loading: newLoading, errors: newErrors };
          });
          
          const schema = await dataSourceManager.getTableSchema(tableName);
          
          if (schema) {
            set(state => ({
              schemas: new Map(state.schemas).set(tableName, schema),
              loading: new Map(state.loading).set(`schema-${tableName}`, false)
            }));
            return schema;
          } else {
            throw new Error('Failed to load schema');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          set(state => ({
            loading: new Map(state.loading).set(`schema-${tableName}`, false),
            errors: new Map(state.errors).set(`schema-${tableName}`, errorMessage)
          }));
          return null;
        }
      },

      refreshSchemas: async () => {
        try {
          set({ schemasLoading: true });
          
          const tables = await dataSourceManager.getAllTables();
          set({ tables, schemasLoading: false });
          
          // Load schemas for all tables
          await Promise.all(
            tables.map(tableName => get().loadTableSchema(tableName))
          );
        } catch (error) {
          console.error('Error refreshing schemas:', error);
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
                ttl: 300 // 5 minutes default TTL
              })
            }));
          }

          set(state => ({
            loading: new Map(state.loading).set(`query-${componentId}`, false)
          }));

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          set(state => ({
            loading: new Map(state.loading).set(`query-${componentId}`, false),
            errors: new Map(state.errors).set(`query-${componentId}`, errorMessage)
          }));
          
          return { data: [], count: 0, error: errorMessage };
        }
      },

      invalidateCache: (key?: string) => {
        if (key) {
          set(state => {
            const newCache = new Map(state.cache);
            newCache.delete(key);
            return { cache: newCache };
          });
        } else {
          set({ cache: new Map() });
        }
      },

      setGlobalColumnConfig: (tableName: string, columnName: string, config: any) => {
        set(state => {
          const tableConfigs = state.globalColumnConfigs.get(tableName) || {};
          const newTableConfigs = { ...tableConfigs, [columnName]: config };
          return {
            globalColumnConfigs: new Map(state.globalColumnConfigs).set(tableName, newTableConfigs)
          };
        });
      },

      getGlobalColumnConfig: (tableName: string, columnName: string) => {
        const tableConfigs = get().globalColumnConfigs.get(tableName);
        return tableConfigs?.[columnName] || {};
      },

      subscribeToTable: async (componentId: string, tableName: string) => {
        try {
          const unsubscribe = await dataSourceManager.subscribe(
            tableName,
            (data) => {
              // Invalidate cache and trigger re-fetch
              get().invalidateCache();
              get().queryData(componentId);
            }
          );

          if (unsubscribe) {
            set(state => ({
              subscriptions: new Map(state.subscriptions).set(componentId, unsubscribe)
            }));
          }
        } catch (error) {
          console.error('Error subscribing to table:', error);
        }
      },

      unsubscribeFromTable: (componentId: string) => {
        const unsubscribe = get().subscriptions.get(componentId);
        if (unsubscribe) {
          try {
            unsubscribe();
          } catch (error) {
            console.error('Error unsubscribing:', error);
          }
          
          set(state => {
            const newSubscriptions = new Map(state.subscriptions);
            newSubscriptions.delete(componentId);
            return { subscriptions: newSubscriptions };
          });
        }
      },

      clearErrors: () => {
        set({ errors: new Map() });
      },

      setError: (key: string, error: string) => {
        set(state => ({
          errors: new Map(state.errors).set(key, error)
        }));
      },

      setLoading: (key: string, loading: boolean) => {
        set(state => ({
          loading: new Map(state.loading).set(key, loading)
        }));
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