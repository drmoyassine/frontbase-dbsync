import { DataSourceAdapter, QueryOptions, QueryResult, TableSchema, ColumnSchema, AggregationOptions, AggregationResult, QueryFilter, SubscriptionOptions } from '../types';

export class SupabaseAdapter implements DataSourceAdapter {
  private baseUrl: string = '';
  private connected: boolean = false;

  async connect(config: Record<string, any>): Promise<boolean> {
    console.log('[SupabaseAdapter] Attempting connection with config:', config);
    
    try {
      // Use current domain's API endpoint instead of localhost to avoid CSP violations
      this.baseUrl = config?.apiUrl || window.location.origin;
      console.log('[SupabaseAdapter] Set base URL to:', this.baseUrl);
      
      // Test connection by trying to reach the API using existing connections endpoint
      const response = await fetch(`${this.baseUrl}/api/database/connections`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('[SupabaseAdapter] Connection test response:', {
        status: response.status,
        ok: response.ok
      });
      
      this.connected = response.ok;
      return this.connected;
    } catch (error) {
      console.error('[SupabaseAdapter] Connection error:', error);
      this.connected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    console.log('[SupabaseAdapter] Disconnecting...');
    this.connected = false;
    this.baseUrl = '';
  }

  isConnected(): boolean {
    return this.connected && !!this.baseUrl;
  }

  async testConnection(): Promise<boolean> {
    console.log('[SupabaseAdapter] Testing connection...');
    
    if (!this.baseUrl) {
      console.log('[SupabaseAdapter] No base URL configured');
      return false;
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/database/connections`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const isConnected = response.ok;
      console.log('[SupabaseAdapter] Connection test result:', isConnected);
      return isConnected;
    } catch (error) {
      console.error('[SupabaseAdapter] Connection test failed:', error);
      return false;
    }
  }

  async getAllTables(): Promise<string[]> {
    console.log('[SupabaseAdapter] Fetching all tables...');
    
    if (!this.isConnected()) {
      console.error('[SupabaseAdapter] Cannot fetch tables - not connected');
      throw new Error('Not connected to backend API');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/database/supabase-tables`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('[SupabaseAdapter] Tables API response:', {
        status: response.status,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SupabaseAdapter] Tables API error:', errorText);
        throw new Error(`Failed to fetch tables: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('[SupabaseAdapter] Retrieved tables:', data);
      return data.tables || [];
    } catch (error) {
      console.error('[SupabaseAdapter] Error fetching tables:', error);
      throw error;
    }
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    console.log('[SupabaseAdapter] Fetching table schema for:', tableName);
    
    if (!this.isConnected()) {
      throw new Error('Not connected to backend API');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/database/table-schema/${encodeURIComponent(tableName)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('[SupabaseAdapter] Schema API response:', {
        status: response.status,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SupabaseAdapter] Schema API error:', errorText);
        throw new Error(`Failed to fetch schema: ${response.status} ${errorText}`);
      }

      const schema = await response.json();
      console.log('[SupabaseAdapter] Retrieved schema:', schema);

      // Map the response to our TableSchema format
      const columnSchemas: ColumnSchema[] = schema.columns?.map((col: any) => ({
        name: col.name,
        type: this.mapPostgresTypeToUniversal(col.type),
        isPrimaryKey: col.isPrimaryKey || false,
        isForeignKey: col.isForeignKey || false,
        isNullable: col.isNullable !== false,
        defaultValue: col.defaultValue,
        relatedTable: col.relatedTable,
        relatedColumn: col.relatedColumn,
      })) || [];

      return {
        name: tableName,
        schema: 'public',
        columns: columnSchemas,
        primaryKey: schema.primaryKey || [],
        foreignKeys: schema.foreignKeys || [],
        permissions: {
          canRead: true,
          canWrite: true,
          canDelete: true,
        },
      };
    } catch (error) {
      console.error('[SupabaseAdapter] Error fetching table schema:', error);
      throw error;
    }
  }

  async getDistinctValues(tableName: string, column: string): Promise<any[]> {
    console.log('[SupabaseAdapter] Fetching distinct values for:', { tableName, column });
    
    if (!this.isConnected()) {
      throw new Error('Not connected to backend API');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/database/distinct-values`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tableName,
          column
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SupabaseAdapter] Distinct values API error:', errorText);
        throw new Error(`Failed to fetch distinct values: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('[SupabaseAdapter] Retrieved distinct values:', data);
      return data.values || [];
    } catch (error) {
      console.error('[SupabaseAdapter] Error fetching distinct values:', error);
      return [];
    }
  }

  async query(options: QueryOptions): Promise<QueryResult> {
    console.log('[SupabaseAdapter] Executing query with options:', options);
    
    if (!this.isConnected()) {
      throw new Error('Not connected to backend API');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/database/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      console.log('[SupabaseAdapter] Query API response:', {
        status: response.status,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SupabaseAdapter] Query API error:', errorText);
        throw new Error(`Query failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('[SupabaseAdapter] Query result:', {
        dataLength: result.data?.length || 0,
        count: result.count,
        hasError: !!result.error
      });

      return {
        data: result.data || [],
        count: result.count || result.data?.length || 0,
        metadata: result.metadata,
        error: result.error,
      };
    } catch (error) {
      console.error('[SupabaseAdapter] Query error:', error);
      return {
        data: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async aggregate(options: AggregationOptions): Promise<AggregationResult> {
    console.log('[SupabaseAdapter] Executing aggregation with options:', options);
    
    if (!this.isConnected()) {
      throw new Error('Not connected to backend API');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/database/aggregate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      console.log('[SupabaseAdapter] Aggregation API response:', {
        status: response.status,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SupabaseAdapter] Aggregation API error:', errorText);
        throw new Error(`Aggregation failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('[SupabaseAdapter] Aggregation result:', result);

      return {
        data: result.data || [],
        error: result.error,
      };
    } catch (error) {
      console.error('[SupabaseAdapter] Aggregation error:', error);
      return {
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async insert(tableName: string, data: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }> {
    console.log('[SupabaseAdapter] Inserting data into table:', { tableName, data });
    
    if (!this.isConnected()) {
      throw new Error('Not connected to backend API');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/database/insert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          table: tableName,
          data: data,
        }),
      });

      console.log('[SupabaseAdapter] Insert API response:', {
        status: response.status,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SupabaseAdapter] Insert API error:', errorText);
        return {
          success: false,
          error: `Insert failed: ${response.status} ${errorText}`,
        };
      }

      const result = await response.json();
      console.log('[SupabaseAdapter] Insert result:', result);

      return {
        success: result.success || false,
        data: result.data,
        error: result.error,
      };
    } catch (error) {
      console.error('[SupabaseAdapter] Insert error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async update(tableName: string, id: any, data: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }> {
    console.log('[SupabaseAdapter] Updating data in table:', { tableName, id, data });
    
    if (!this.isConnected()) {
      throw new Error('Not connected to backend API');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/database/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          table: tableName,
          id: id,
          data: data,
        }),
      });

      console.log('[SupabaseAdapter] Update API response:', {
        status: response.status,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SupabaseAdapter] Update API error:', errorText);
        return {
          success: false,
          error: `Update failed: ${response.status} ${errorText}`,
        };
      }

      const result = await response.json();
      console.log('[SupabaseAdapter] Update result:', result);

      return {
        success: result.success || false,
        data: result.data,
        error: result.error,
      };
    } catch (error) {
      console.error('[SupabaseAdapter] Update error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async delete(tableName: string, id: any): Promise<{ success: boolean; error?: string }> {
    console.log('[SupabaseAdapter] Deleting data from table:', { tableName, id });
    
    if (!this.isConnected()) {
      throw new Error('Not connected to backend API');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/database/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          table: tableName,
          id: id,
        }),
      });

      console.log('[SupabaseAdapter] Delete API response:', {
        status: response.status,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SupabaseAdapter] Delete API error:', errorText);
        return {
          success: false,
          error: `Delete failed: ${response.status} ${errorText}`,
        };
      }

      const result = await response.json();
      console.log('[SupabaseAdapter] Delete result:', result);

      return {
        success: result.success || false,
        error: result.error,
      };
    } catch (error) {
      console.error('[SupabaseAdapter] Delete error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async subscribe(options: SubscriptionOptions): Promise<() => void> {
    console.log('[SupabaseAdapter] Setting up subscription for:', options);
    
    // For now, return a no-op function since real-time subscriptions
    // would need WebSocket support in the backend API
    console.warn('[SupabaseAdapter] Real-time subscriptions not yet implemented for backend API');
    
    return () => {
      console.log('[SupabaseAdapter] Unsubscribing from:', options.table);
    };
  }

  // Utility methods
  escapeValue(value: any): any {
    if (typeof value === 'string') {
      return value.replace(/'/g, "''");
    }
    return value;
  }

  buildFilterQuery(filters: QueryFilter[]): any {
    // The backend API handles filtering server-side
    // This method is kept for interface compatibility
    return filters;
  }

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
      console.error('[SupabaseAdapter] Template resolution error:', error);
      return template;
    }
  }

  private mapPostgresTypeToUniversal(postgresType: string): ColumnSchema['type'] {
    switch (postgresType.toLowerCase()) {
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
}