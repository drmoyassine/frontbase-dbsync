import { DataSourceAdapter, TableSchema, ColumnSchema, QueryOptions, QueryResult, AggregationOptions, AggregationResult, QueryFilter, SubscriptionOptions } from '../types';

interface SupabaseClient {
  from: (table: string) => any;
  rpc: (fn: string, params?: any) => any;
  channel: (name: string) => any;
}

export class SupabaseAdapter implements DataSourceAdapter {
  private client: SupabaseClient | null = null;
  private config: { url: string; anonKey: string; serviceKey?: string } | null = null;
  private subscriptions: Map<string, any> = new Map();

  async connect(config: { url: string; anonKey: string; serviceKey?: string }): Promise<boolean> {
    try {
      this.config = config;
      
      // Create a simple client interface that works with your existing setup
      this.client = await this.createClient(config);
      
      // Test connection
      const testResult = await this.testConnection();
      return testResult;
    } catch (error) {
      console.error('Supabase connection error:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    // Clean up subscriptions
    for (const [key, subscription] of this.subscriptions) {
      try {
        if (subscription && typeof subscription.unsubscribe === 'function') {
          subscription.unsubscribe();
        }
      } catch (error) {
        console.error(`Error unsubscribing from ${key}:`, error);
      }
    }
    this.subscriptions.clear();
    
    this.client = null;
    this.config = null;
  }

  isConnected(): boolean {
    return this.client !== null && this.config !== null;
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.client) return false;
      
      // Test by getting tables
      const tables = await this.getAllTables();
      return Array.isArray(tables);
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    if (!this.client) {
      throw new Error('Not connected to Supabase');
    }

    try {
      // Get table information from your existing API
      const response = await fetch('/api/database/table-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableName })
      });

      if (!response.ok) {
        throw new Error(`Failed to get table schema: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to get table schema');
      }

      // Convert to our universal format
      const columns: ColumnSchema[] = result.data.columns.map((col: any) => ({
        name: col.column_name,
        type: this.mapPostgresTypeToUniversal(col.data_type),
        isPrimaryKey: col.is_primary_key,
        isForeignKey: col.is_foreign_key,
        isNullable: col.is_nullable !== 'NO',
        defaultValue: col.column_default,
        constraints: col.constraints || []
      }));

      return {
        name: tableName,
        schema: 'public',
        columns,
        primaryKey: columns.filter(c => c.isPrimaryKey).map(c => c.name),
        foreignKeys: columns
          .filter(c => c.isForeignKey)
          .map(c => ({
            column: c.name,
            referencedTable: c.relatedTable || '',
            referencedColumn: c.relatedColumn || ''
          })),
        permissions: {
          canRead: true,
          canWrite: true,
          canDelete: true
        }
      };
    } catch (error) {
      console.error('Error getting table schema:', error);
      throw error;
    }
  }

  async getAllTables(): Promise<string[]> {
    try {
      // Use your existing API
      const response = await fetch('/api/database/supabase-tables', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to get tables: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to get tables');
      }

      return result.data.tables.map((table: any) => table.name);
    } catch (error) {
      console.error('Error getting tables:', error);
      return [];
    }
  }

  async getDistinctValues(tableName: string, column: string): Promise<any[]> {
    try {
      const response = await fetch('/api/database/distinct-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableName, column })
      });

      if (!response.ok) {
        throw new Error(`Failed to get distinct values: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to get distinct values');
      }

      return result.data.values || [];
    } catch (error) {
      console.error('Error getting distinct values:', error);
      return [];
    }
  }

  async query(options: QueryOptions): Promise<QueryResult> {
    try {
      const response = await fetch('/api/database/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tableName: options.table,
          select: options.select,
          filters: options.filters,
          search: options.search,
          sort: options.sort,
          pagination: options.pagination,
          limit: options.limit,
          offset: options.offset
        })
      });

      if (!response.ok) {
        throw new Error(`Query failed: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Query failed');
      }

      return {
        data: result.data.rows || [],
        count: result.data.count || 0,
        metadata: result.data.metadata
      };
    } catch (error) {
      console.error('Query error:', error);
      return {
        data: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async aggregate(options: AggregationOptions): Promise<AggregationResult> {
    try {
      const response = await fetch('/api/database/aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(options)
      });

      if (!response.ok) {
        throw new Error(`Aggregation failed: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Aggregation failed');
      }

      return {
        data: result.data.rows || []
      };
    } catch (error) {
      console.error('Aggregation error:', error);
      return {
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async insert(tableName: string, data: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch('/api/database/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableName, data })
      });

      if (!response.ok) {
        throw new Error(`Insert failed: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: result.success,
        data: result.data,
        error: result.success ? undefined : result.message
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async update(tableName: string, id: any, data: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch('/api/database/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableName, id, data })
      });

      if (!response.ok) {
        throw new Error(`Update failed: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: result.success,
        data: result.data,
        error: result.success ? undefined : result.message
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async delete(tableName: string, id: any): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('/api/database/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableName, id })
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: result.success,
        error: result.success ? undefined : result.message
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Helper methods
  private async createClient(config: { url: string; anonKey: string; serviceKey?: string }): Promise<SupabaseClient> {
    // Create a simple client interface that works with your existing backend
    return {
      from: (table: string) => ({
        select: () => ({ data: [], error: null }),
        insert: () => ({ data: null, error: null }),
        update: () => ({ data: null, error: null }),
        delete: () => ({ data: null, error: null })
      }),
      rpc: (fn: string, params?: any) => ({ data: null, error: null }),
      channel: (name: string) => ({
        on: () => ({}),
        subscribe: () => ({})
      })
    };
  }

  private mapPostgresTypeToUniversal(postgresType: string): ColumnSchema['type'] {
    const typeMap: Record<string, ColumnSchema['type']> = {
      'text': 'text',
      'varchar': 'text',
      'char': 'text',
      'character': 'text',
      'integer': 'number',
      'bigint': 'number',
      'smallint': 'number',
      'numeric': 'number',
      'decimal': 'number',
      'real': 'number',
      'double precision': 'number',
      'boolean': 'boolean',
      'date': 'date',
      'timestamp': 'date',
      'timestamptz': 'date',
      'time': 'date',
      'json': 'json',
      'jsonb': 'json',
      'uuid': 'uuid',
      'email': 'email',
      'url': 'url'
    };

    return typeMap[postgresType.toLowerCase()] || 'text';
  }

  escapeValue(value: any): any {
    if (typeof value === 'string') {
      return value.replace(/'/g, "''");
    }
    return value;
  }

  buildFilterQuery(filters: QueryFilter[]): any {
    // This would be implemented based on your backend API structure
    return filters;
  }

  resolveTemplate(template: string, context: Record<string, any>): any {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const keys = key.trim().split('.');
      let value = context;
      
      for (const k of keys) {
        value = value?.[k];
      }
      
      return value !== undefined ? String(value) : match;
    });
  }
}