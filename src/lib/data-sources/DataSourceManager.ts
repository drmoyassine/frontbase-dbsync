import { DataSourceAdapter, DataSourceConfig, QueryOptions, QueryResult, TableSchema, AggregationOptions, AggregationResult, DataBindingError } from './types';
import { SupabaseAdapter } from './adapters/SupabaseAdapter';
import { BackendAPIAdapter } from './adapters/BackendAPIAdapter';

class DataSourceManager {
  private adapters: Map<string, DataSourceAdapter> = new Map();
  private configs: Map<string, DataSourceConfig> = new Map();
  private activeDataSourceId: string | null = null;

  constructor() {
    // Adapters are now created dynamically, not pre-registered
  }

  // Dynamic adapter creation
  private createAdapter(type: string, credentials: Record<string, any>): DataSourceAdapter {
    switch (type) {
      case 'supabase':
        return new SupabaseAdapter();
      case 'backend-api':
        return new BackendAPIAdapter();
      default:
        throw new Error(`Unsupported data source type: ${type}`);
    }
  }

  private getAdapterForDataSource(dataSourceId: string): DataSourceAdapter | null {
    const config = this.configs.get(dataSourceId);
    if (!config) return null;

    // Check if we already have an adapter instance
    const existingAdapter = this.adapters.get(dataSourceId);
    if (existingAdapter && existingAdapter.isConnected()) {
      return existingAdapter;
    }

    // Create new adapter instance
    try {
      const adapter = this.createAdapter(config.type, config.connection);
      this.adapters.set(dataSourceId, adapter);
      return adapter;
    } catch (error) {
      console.error(`Error creating adapter for ${dataSourceId}:`, error);
      return null;
    }
  }

  async getStoredSupabaseCredentials(): Promise<Record<string, any> | null> {
    try {
      const response = await fetch('/api/database/connections');
      if (!response.ok) return null;
      
      const data = await response.json();
      
      if (data.supabase_url && (data.supabase_anon_key || data.supabase_service_key)) {
        return {
          url: data.supabase_url,
          anonKey: data.supabase_anon_key,
          serviceKey: data.supabase_service_key,
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching stored Supabase credentials:', error);
      return null;
    }
  }

  // Data source configuration
  async addDataSource(config: DataSourceConfig): Promise<boolean> {
    try {
      const adapter = this.createAdapter(config.type, config.connection);
      const connected = await adapter.connect(config.connection);
      
      if (!connected) {
        throw new Error('Failed to connect to data source');
      }

      this.configs.set(config.id, { ...config, isActive: connected });
      this.adapters.set(config.id, adapter);
      
      if (!this.activeDataSourceId || config.isActive) {
        this.activeDataSourceId = config.id;
      }

      return true;
    } catch (error) {
      console.error(`Error adding data source ${config.id}:`, error);
      return false;
    }
  }

  removeDataSource(id: string): void {
    const config = this.configs.get(id);
    if (config) {
      const adapter = this.adapters.get(id);
      adapter?.disconnect();
      this.configs.delete(id);
      this.adapters.delete(id);
      
      if (this.activeDataSourceId === id) {
        this.activeDataSourceId = null;
        // Set next available as active
        const nextConfig = Array.from(this.configs.values()).find(c => c.isActive);
        if (nextConfig) {
          this.activeDataSourceId = nextConfig.id;
        }
      }
    }
  }

  setActiveDataSource(id: string): boolean {
    const config = this.configs.get(id);
    if (config && config.isActive) {
      this.activeDataSourceId = id;
      return true;
    }
    return false;
  }

  getActiveDataSource(): DataSourceConfig | null {
    return this.activeDataSourceId ? this.configs.get(this.activeDataSourceId) || null : null;
  }

  getActiveAdapter(): DataSourceAdapter | null {
    if (!this.activeDataSourceId) return null;
    return this.getAdapterForDataSource(this.activeDataSourceId);
  }

  getAllDataSources(): DataSourceConfig[] {
    return Array.from(this.configs.values());
  }

  // Universal data operations
  async query(options: QueryOptions, dataSourceId?: string): Promise<QueryResult> {
    try {
      const adapter = this.getAdapterForRequest(dataSourceId);
      if (!adapter) {
        throw new Error('No active data source available');
      }

      return await adapter.query(options);
    } catch (error) {
      console.error('Query error:', error);
      return {
        data: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async aggregate(options: AggregationOptions, dataSourceId?: string): Promise<AggregationResult> {
    try {
      const adapter = this.getAdapterForRequest(dataSourceId);
      if (!adapter) {
        throw new Error('No active data source available');
      }

      return await adapter.aggregate(options);
    } catch (error) {
      console.error('Aggregation error:', error);
      return {
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getTableSchema(tableName: string, dataSourceId?: string): Promise<TableSchema | null> {
    try {
      const adapter = this.getAdapterForRequest(dataSourceId);
      if (!adapter) {
        throw new Error('No active data source available');
      }

      return await adapter.getTableSchema(tableName);
    } catch (error) {
      console.error('Schema error:', error);
      return null;
    }
  }

  async getAllTables(dataSourceId?: string): Promise<string[]> {
    try {
      const adapter = this.getAdapterForRequest(dataSourceId);
      if (!adapter) {
        return [];
      }

      return await adapter.getAllTables();
    } catch (error) {
      console.error('Tables error:', error);
      return [];
    }
  }

  async getDistinctValues(tableName: string, column: string, dataSourceId?: string): Promise<any[]> {
    try {
      const adapter = this.getAdapterForRequest(dataSourceId);
      if (!adapter) {
        return [];
      }

      return await adapter.getDistinctValues(tableName, column);
    } catch (error) {
      console.error('Distinct values error:', error);
      return [];
    }
  }

  async insert(tableName: string, data: Record<string, any>, dataSourceId?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const adapter = this.getAdapterForRequest(dataSourceId);
      if (!adapter) {
        throw new Error('No active data source available');
      }

      return await adapter.insert(tableName, data);
    } catch (error) {
      console.error('Insert error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async update(tableName: string, id: any, data: Record<string, any>, dataSourceId?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const adapter = this.getAdapterForRequest(dataSourceId);
      if (!adapter) {
        throw new Error('No active data source available');
      }

      return await adapter.update(tableName, id, data);
    } catch (error) {
      console.error('Update error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async delete(tableName: string, id: any, dataSourceId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const adapter = this.getAdapterForRequest(dataSourceId);
      if (!adapter) {
        throw new Error('No active data source available');
      }

      return await adapter.delete(tableName, id);
    } catch (error) {
      console.error('Delete error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Subscription management
  async subscribe(tableName: string, callback: (data: any) => void, dataSourceId?: string): Promise<(() => void) | null> {
    try {
      const adapter = this.getAdapterForRequest(dataSourceId);
      if (!adapter || !adapter.subscribe) {
        return null;
      }

      return await adapter.subscribe({
        table: tableName,
        event: '*',
        callback
      });
    } catch (error) {
      console.error('Subscription error:', error);
      return null;
    }
  }

  // Helper methods
  private getAdapterForRequest(dataSourceId?: string): DataSourceAdapter | null {
    const targetId = dataSourceId || this.activeDataSourceId;
    return targetId ? this.getAdapterForDataSource(targetId) : null;
  }

  // Template resolution for dynamic values
  resolveTemplate(template: string, context: Record<string, any>): any {
    try {
      // Simple mustache-style template resolution
      return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const keys = key.trim().split('.');
        let value = context;
        
        for (const k of keys) {
          value = value?.[k];
        }
        
        return value !== undefined ? String(value) : match;
      });
    } catch (error) {
      console.error('Template resolution error:', error);
      return template;
    }
  }

  // Health checks
  async testConnection(dataSourceId?: string): Promise<boolean> {
    try {
      const adapter = this.getAdapterForRequest(dataSourceId);
      if (!adapter) {
        return false;
      }

      return await adapter.testConnection();
    } catch (error) {
      console.error('Connection test error:', error);
      return false;
    }
  }

  getConnectionStatus(dataSourceId?: string): 'connected' | 'disconnected' | 'unknown' {
    const targetId = dataSourceId || this.activeDataSourceId;
    if (!targetId) return 'unknown';
    
    const adapter = this.getAdapterForDataSource(targetId);
    if (!adapter) return 'unknown';
    
    return adapter.isConnected() ? 'connected' : 'disconnected';
  }
}

// Singleton instance
export const dataSourceManager = new DataSourceManager();
export default dataSourceManager;