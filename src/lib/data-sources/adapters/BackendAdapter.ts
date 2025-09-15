import { DataSourceAdapter, DataSourceConfig, TableSchema, QueryOptions, QueryResult, AggregationOptions, AggregationResult } from '../types';

export class BackendAdapter implements DataSourceAdapter {
  private config: DataSourceConfig | null = null;
  private connected: boolean = false;

  async connect(config: DataSourceConfig): Promise<boolean> {
    try {
      this.config = config;
      // Test connection by trying to fetch table list
      const response = await fetch('/api/database/tables', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        this.connected = true;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to connect to backend:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch('/api/database/test', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getTableSchema(tableName: string): Promise<TableSchema | null> {
    try {
      const response = await fetch(`/api/database/schema/${tableName}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) return null;
      
      const schema = await response.json();
      return this.mapBackendSchemaToUniversal(schema);
    } catch (error) {
      console.error('Failed to get table schema:', error);
      return null;
    }
  }

  async getAllTables(): Promise<string[]> {
    try {
      const response = await fetch('/api/database/tables', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) return [];
      
      const data = await response.json();
      return data.tables || [];
    } catch (error) {
      console.error('Failed to get tables:', error);
      return [];
    }
  }

  async getDistinctValues(tableName: string, column: string): Promise<any[]> {
    try {
      const response = await fetch(`/api/database/distinct/${tableName}/${column}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) return [];
      
      const data = await response.json();
      return data.values || [];
    } catch (error) {
      console.error('Failed to get distinct values:', error);
      return [];
    }
  }

  async query(options: QueryOptions): Promise<QueryResult> {
    try {
      const response = await fetch('/api/database/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return { data: [], count: 0, error };
      }
      
      const result = await response.json();
      return {
        data: result.data || [],
        count: result.count || 0,
        metadata: result.metadata
      };
    } catch (error) {
      return {
        data: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Query failed'
      };
    }
  }

  async aggregate(options: AggregationOptions): Promise<AggregationResult> {
    try {
      const response = await fetch('/api/database/aggregate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return { data: [], error };
      }
      
      const result = await response.json();
      return {
        data: result.data || []
      };
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : 'Aggregation failed'
      };
    }
  }

  async insert(tableName: string, data: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`/api/database/insert/${tableName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }
      
      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Insert failed'
      };
    }
  }

  async update(tableName: string, id: any, data: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`/api/database/update/${tableName}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }
      
      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Update failed'
      };
    }
  }

  async delete(tableName: string, id: any): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`/api/database/delete/${tableName}/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete failed'
      };
    }
  }

  async subscribe(options: any): Promise<(() => void) | null> {
    // Real-time subscriptions would need WebSocket implementation
    // For now, return null to indicate no subscription support
    return null;
  }

  resolveTemplate(template: string, context: Record<string, any>): any {
    try {
      // Simple template resolution
      return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return context[key] || match;
      });
    } catch (error) {
      return template;
    }
  }

  private mapBackendSchemaToUniversal(backendSchema: any): TableSchema {
    return {
      name: backendSchema.table_name || backendSchema.tableName,
      columns: (backendSchema.columns || []).map((col: any) => ({
        name: col.name || col.column_name,
        type: this.mapBackendTypeToUniversal(col.type || col.data_type),
        isPrimaryKey: col.is_primary_key || col.isPrimaryKey || false,
        isNullable: col.is_nullable !== false,
        defaultValue: col.default_value || col.defaultValue,
        isUnique: col.is_unique || col.isUnique || false,
        maxLength: col.max_length || col.maxLength
      })),
      primaryKey: backendSchema.primary_keys?.[0] || null,
      foreignKeys: backendSchema.foreign_keys || [],
      permissions: {
        canRead: true,
        canWrite: true,
        canDelete: true
      }
    };
  }

  private mapBackendTypeToUniversal(backendType: string): string {
    const typeMap: Record<string, string> = {
      'varchar': 'text',
      'text': 'text',
      'char': 'text',
      'int': 'number',
      'integer': 'number',
      'bigint': 'number',
      'float': 'number',
      'double': 'number',
      'decimal': 'number',
      'bool': 'boolean',
      'boolean': 'boolean',
      'date': 'date',
      'datetime': 'datetime',
      'timestamp': 'datetime',
      'json': 'json',
      'jsonb': 'json'
    };

    const normalized = backendType.toLowerCase();
    return typeMap[normalized] || 'text';
  }

  escapeValue(value: any): string {
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    }
    return String(value);
  }

  buildFilterQuery(filters: any[]): string {
    return filters.map(f => `${f.column} ${f.operator} ${this.escapeValue(f.value)}`).join(' AND ');
  }
}