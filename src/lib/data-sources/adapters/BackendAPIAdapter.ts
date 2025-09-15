import { DataSourceAdapter, QueryOptions, QueryResult, TableSchema, ColumnSchema, AggregationOptions, AggregationResult, QueryFilter, SubscriptionOptions } from '../types';

export class BackendAPIAdapter implements DataSourceAdapter {
  private connected: boolean = false;
  private baseUrl: string = '';

  async connect(config: Record<string, any>): Promise<boolean> {
    console.log('[BackendAPIAdapter] Attempting connection with config:', config);
    
    try {
      this.baseUrl = config.url || window.location.origin;
      console.log('[BackendAPIAdapter] Using base URL:', this.baseUrl);
      
      // Test connection by fetching connections status
      console.log('[BackendAPIAdapter] Testing connection to /api/database/connections...');
      const response = await fetch(`${this.baseUrl}/api/database/connections`);
      console.log('[BackendAPIAdapter] Connection test response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      this.connected = response.ok;
      console.log('[BackendAPIAdapter] Connection status:', this.connected);
      
      return this.connected;
    } catch (error) {
      console.error('[BackendAPIAdapter] Connection error:', error);
      this.connected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.baseUrl = '';
  }

  isConnected(): boolean {
    return this.connected;
  }

  async testConnection(): Promise<boolean> {
    if (!this.baseUrl) return false;
    
    try {
      const response = await fetch(`${this.baseUrl}/api/database/connections`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getAllTables(): Promise<string[]> {
    console.log('[BackendAPIAdapter] Fetching all tables...');
    
    if (!this.connected) {
      console.error('[BackendAPIAdapter] Cannot fetch tables - not connected to Backend API');
      throw new Error('Not connected to Backend API');
    }

    try {
      const url = `${this.baseUrl}/api/database/supabase-tables`;
      console.log('[BackendAPIAdapter] Requesting tables from:', url);
      
      const response = await fetch(url);
      console.log('[BackendAPIAdapter] Tables API response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      if (!response.ok) {
        console.error('[BackendAPIAdapter] Tables API failed:', response.status, response.statusText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[BackendAPIAdapter] Tables API response data:', {
        hasTables: !!data.tables,
        tablesCount: data.tables?.length || 0,
        tables: data.tables
      });
      
      return data.tables || [];
    } catch (error) {
      console.error('[BackendAPIAdapter] Error fetching tables from backend API:', error);
      return [];
    }
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    if (!this.connected) throw new Error('Not connected to Backend API');

    try {
      const response = await fetch(`${this.baseUrl}/api/database/table-schema/${encodeURIComponent(tableName)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Transform backend response to our schema format
      const columnSchemas: ColumnSchema[] = data.columns?.map((col: any) => ({
        name: col.column_name || col.name,
        type: this.mapPostgresTypeToUniversal(col.data_type || col.type),
        isPrimaryKey: col.is_primary_key || false,
        isForeignKey: col.is_foreign_key || false,
        isNullable: col.is_nullable !== false,
        defaultValue: col.column_default || col.defaultValue,
        relatedTable: col.foreign_table_name || col.relatedTable,
        relatedColumn: col.foreign_column_name || col.relatedColumn,
      })) || [];

      return {
        name: tableName,
        schema: 'public',
        columns: columnSchemas,
        primaryKey: data.primaryKey || [],
        foreignKeys: data.foreignKeys || [],
        permissions: {
          canRead: true,
          canWrite: true,
          canDelete: true,
        },
      };
    } catch (error) {
      console.error('Error fetching table schema from backend API:', error);
      throw error;
    }
  }

  async getDistinctValues(tableName: string, column: string): Promise<any[]> {
    if (!this.connected) throw new Error('Not connected to Backend API');

    try {
      const response = await fetch(
        `${this.baseUrl}/api/database/table-data/${encodeURIComponent(tableName)}?distinct=${encodeURIComponent(column)}&limit=100`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Extract unique values from the response
      const values = data.data?.map((row: any) => row[column]) || [];
      return [...new Set(values)];
    } catch (error) {
      console.error('Error fetching distinct values from backend API:', error);
      return [];
    }
  }

  async query(options: QueryOptions): Promise<QueryResult> {
    if (!this.connected) throw new Error('Not connected to Backend API');

    try {
      // Build query parameters
      const params = new URLSearchParams();
      
      if (options.select && options.select.length > 0) {
        params.append('select', options.select.join(','));
      }
      
      if (options.filters) {
        params.append('filters', JSON.stringify(options.filters));
      }
      
      if (options.search) {
        params.append('search', JSON.stringify(options.search));
      }
      
      if (options.sort) {
        params.append('sort', JSON.stringify(options.sort));
      }
      
      if (options.pagination) {
        params.append('page', options.pagination.page.toString());
        params.append('pageSize', options.pagination.pageSize.toString());
      } else if (options.limit) {
        params.append('limit', options.limit.toString());
        if (options.offset) {
          params.append('offset', options.offset.toString());
        }
      }

      const response = await fetch(
        `${this.baseUrl}/api/database/table-data/${encodeURIComponent(options.table)}?${params.toString()}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        data: data.data || [],
        count: data.count || data.data?.length || 0,
        metadata: data.metadata,
      };
    } catch (error) {
      console.error('Query error with backend API:', error);
      return {
        data: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async aggregate(options: AggregationOptions): Promise<AggregationResult> {
    if (!this.connected) throw new Error('Not connected to Backend API');

    try {
      const response = await fetch(`${this.baseUrl}/api/database/aggregate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        data: data.data || [],
      };
    } catch (error) {
      console.error('Aggregation error with backend API:', error);
      return {
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async insert(tableName: string, data: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.connected) throw new Error('Not connected to Backend API');

    try {
      const response = await fetch(`${this.baseUrl}/api/database/table-data/${encodeURIComponent(tableName)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      console.error('Insert error with backend API:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async update(tableName: string, id: any, data: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.connected) throw new Error('Not connected to Backend API');

    try {
      const response = await fetch(`${this.baseUrl}/api/database/table-data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      console.error('Update error with backend API:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async delete(tableName: string, id: any): Promise<{ success: boolean; error?: string }> {
    if (!this.connected) throw new Error('Not connected to Backend API');

    try {
      const response = await fetch(`${this.baseUrl}/api/database/table-data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      console.error('Delete error with backend API:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private mapPostgresTypeToUniversal(postgresType: string): ColumnSchema['type'] {
    switch (postgresType?.toLowerCase()) {
      case 'integer':
      case 'bigint':
      case 'smallint':
      case 'decimal':
      case 'numeric':
      case 'real':
      case 'double precision':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'date':
      case 'timestamp':
      case 'timestamp with time zone':
      case 'timestamp without time zone':
        return 'date';
      case 'json':
      case 'jsonb':
        return 'json';
      case 'uuid':
        return 'uuid';
      default:
        return 'text';
    }
  }

  escapeValue(value: any): any {
    if (typeof value === 'string') {
      return value.replace(/'/g, "''");
    }
    return value;
  }

  buildFilterQuery(filters: QueryFilter[]): any {
    // Backend API handles this server-side
    return filters;
  }

  resolveTemplate(template: string, context: Record<string, any>): any {
    try {
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
}