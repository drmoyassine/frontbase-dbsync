import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DataSourceAdapter, QueryOptions, QueryResult, TableSchema, ColumnSchema, AggregationOptions, AggregationResult, QueryFilter, SubscriptionOptions } from '../types';

export class SupabaseAdapter implements DataSourceAdapter {
  private client: SupabaseClient | null = null;
  private connected: boolean = false;
  private subscriptions: Map<string, any> = new Map();

  async connect(config: Record<string, any>): Promise<boolean> {
    try {
      const { url, anonKey, serviceKey } = config;
      
      if (!url || (!anonKey && !serviceKey)) {
        throw new Error('Missing required Supabase connection parameters');
      }

      // Use service key if available for admin operations, otherwise anon key
      const key = serviceKey || anonKey;
      this.client = createClient(url, key);
      
      // Test connection
      const { error } = await this.client.from('_health_check').select('*').limit(1);
      
      // Connection successful if no auth error or table doesn't exist (expected)
      this.connected = !error || error.code === 'PGRST116' || error.code === '42P01';
      
      return this.connected;
    } catch (error) {
      console.error('Supabase connection error:', error);
      this.connected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      // Unsubscribe from all active subscriptions
      for (const [key, subscription] of this.subscriptions) {
        try {
          await this.client.removeChannel(subscription);
        } catch (error) {
          console.warn(`Failed to unsubscribe from ${key}:`, error);
        }
      }
      this.subscriptions.clear();
      
      this.client = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) return false;
    
    try {
      // Try to get a list of tables as a connection test
      const { error } = await this.client.rpc('get_schema_info').limit(1);
      return !error || error.code === 'PGRST116'; // Function not found is OK
    } catch (error) {
      return false;
    }
  }

  async getAllTables(): Promise<string[]> {
    if (!this.client) throw new Error('Not connected to Supabase');

    try {
      // Get public schema tables
      const { data, error } = await this.client
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_type', 'BASE TABLE');

      if (error) {
        // Fallback: try to get tables from pg_tables
        const { data: fallbackData, error: fallbackError } = await this.client
          .rpc('get_public_tables');
        
        if (fallbackError) {
          throw fallbackError;
        }
        
        return fallbackData?.map((row: any) => row.tablename) || [];
      }

      return data?.map(row => row.table_name) || [];
    } catch (error) {
      console.error('Error fetching tables:', error);
      return [];
    }
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    if (!this.client) throw new Error('Not connected to Supabase');

    try {
      // Get column information
      const { data: columns, error: columnsError } = await this.client
        .from('information_schema.columns')
        .select('*')
        .eq('table_schema', 'public')
        .eq('table_name', tableName)
        .order('ordinal_position');

      if (columnsError) throw columnsError;

      // Get primary key information
      const { data: primaryKeys, error: pkError } = await this.client
        .from('information_schema.key_column_usage')
        .select('column_name')
        .eq('table_schema', 'public')
        .eq('table_name', tableName);

      if (pkError) console.warn('Could not fetch primary keys:', pkError);

      // Get foreign key information
      const { data: foreignKeys, error: fkError } = await this.client
        .from('information_schema.table_constraints')
        .select(`
          column_name,
          foreign_table_name,
          foreign_column_name
        `)
        .eq('table_schema', 'public')
        .eq('table_name', tableName)
        .eq('constraint_type', 'FOREIGN KEY');

      if (fkError) console.warn('Could not fetch foreign keys:', fkError);

      const columnSchemas: ColumnSchema[] = columns?.map(col => ({
        name: col.column_name,
        type: this.mapPostgresTypeToUniversal(col.data_type),
        isPrimaryKey: primaryKeys?.some(pk => pk.column_name === col.column_name) || false,
        isForeignKey: foreignKeys?.some(fk => fk.column_name === col.column_name) || false,
        isNullable: col.is_nullable === 'YES',
        defaultValue: col.column_default,
        relatedTable: foreignKeys?.find(fk => fk.column_name === col.column_name)?.foreign_table_name,
        relatedColumn: foreignKeys?.find(fk => fk.column_name === col.column_name)?.foreign_column_name,
      })) || [];

      return {
        name: tableName,
        schema: 'public',
        columns: columnSchemas,
        primaryKey: primaryKeys?.map(pk => pk.column_name) || [],
        foreignKeys: foreignKeys?.map(fk => ({
          column: fk.column_name,
          referencedTable: fk.foreign_table_name,
          referencedColumn: fk.foreign_column_name,
        })) || [],
        permissions: {
          canRead: true,
          canWrite: true,
          canDelete: true,
        },
      };
    } catch (error) {
      console.error('Error fetching table schema:', error);
      throw error;
    }
  }

  async getDistinctValues(tableName: string, column: string): Promise<any[]> {
    if (!this.client) throw new Error('Not connected to Supabase');

    try {
      const { data, error } = await this.client
        .from(tableName)
        .select(column)
        .not(column, 'is', null)
        .limit(100);

      if (error) throw error;

      // Extract unique values
      const values = data?.map(row => row[column]) || [];
      return [...new Set(values)];
    } catch (error) {
      console.error('Error fetching distinct values:', error);
      return [];
    }
  }

  async query(options: QueryOptions): Promise<QueryResult> {
    if (!this.client) throw new Error('Not connected to Supabase');

    try {
      let query = this.client.from(options.table).select('*', { count: 'exact' });

      // Apply select
      if (options.select && options.select.length > 0) {
        query = this.client.from(options.table).select(options.select.join(', '), { count: 'exact' });
      }

      // Apply filters
      if (options.filters) {
        for (const filter of options.filters) {
          query = this.applyFilter(query, filter);
        }
      }

      // Apply search
      if (options.search) {
        query = query.ilike(options.search.column, `%${options.search.query}%`);
      }

      // Apply sorting
      if (options.sort) {
        for (const sort of options.sort) {
          query = query.order(sort.column, { ascending: sort.direction === 'asc' });
        }
      }

      // Apply pagination
      if (options.pagination) {
        const offset = (options.pagination.page - 1) * options.pagination.pageSize;
        query = query.range(offset, offset + options.pagination.pageSize - 1);
      } else if (options.limit) {
        query = query.limit(options.limit);
        if (options.offset) {
          query = query.range(options.offset, options.offset + options.limit - 1);
        }
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        count: count || data?.length || 0,
        metadata: options.pagination ? {
          totalPages: Math.ceil((count || 0) / options.pagination.pageSize),
          currentPage: options.pagination.page,
          pageSize: options.pagination.pageSize,
        } : undefined,
      };
    } catch (error) {
      console.error('Query error:', error);
      return {
        data: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async aggregate(options: AggregationOptions): Promise<AggregationResult> {
    if (!this.client) throw new Error('Not connected to Supabase');

    try {
      // Build aggregation query
      const selectParts: string[] = [];
      
      if (options.groupBy) {
        selectParts.push(...options.groupBy);
      }

      for (const agg of options.aggregations) {
        const alias = agg.alias || `${agg.function}_${agg.column}`;
        selectParts.push(`${agg.column}.${agg.function}()`);
      }

      let query = this.client
        .from(options.table)
        .select(selectParts.join(', '));

      // Apply filters
      if (options.filters) {
        for (const filter of options.filters) {
          query = this.applyFilter(query, filter);
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      return {
        data: data || [],
      };
    } catch (error) {
      console.error('Aggregation error:', error);
      return {
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async insert(tableName: string, data: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.client) throw new Error('Not connected to Supabase');

    try {
      const { data: result, error } = await this.client
        .from(tableName)
        .insert(data)
        .select();

      if (error) throw error;

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('Insert error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async update(tableName: string, id: any, data: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.client) throw new Error('Not connected to Supabase');

    try {
      const { data: result, error } = await this.client
        .from(tableName)
        .update(data)
        .eq('id', id)
        .select();

      if (error) throw error;

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('Update error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async delete(tableName: string, id: any): Promise<{ success: boolean; error?: string }> {
    if (!this.client) throw new Error('Not connected to Supabase');

    try {
      const { error } = await this.client
        .from(tableName)
        .delete()
        .eq('id', id);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Delete error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async subscribe(options: SubscriptionOptions): Promise<() => void> {
    if (!this.client) throw new Error('Not connected to Supabase');

    const channel = this.client
      .channel(`table-${options.table}`)
      .on('postgres_changes' as any, {
        event: options.event === '*' ? '*' : options.event,
        schema: 'public',
        table: options.table,
      }, (payload) => {
        options.callback(payload);
      })
      .subscribe();

    const subscriptionKey = `${options.table}-${options.event}`;
    this.subscriptions.set(subscriptionKey, channel);

    return () => {
      this.client?.removeChannel(channel);
      this.subscriptions.delete(subscriptionKey);
    };
  }

  private applyFilter(query: any, filter: QueryFilter): any {
    const { column, operator, value } = filter;

    switch (operator) {
      case 'eq':
        return query.eq(column, value);
      case 'neq':
        return query.neq(column, value);
      case 'gt':
        return query.gt(column, value);
      case 'gte':
        return query.gte(column, value);
      case 'lt':
        return query.lt(column, value);
      case 'lte':
        return query.lte(column, value);
      case 'like':
        return query.like(column, value);
      case 'ilike':
        return query.ilike(column, value);
      case 'in':
        return query.in(column, Array.isArray(value) ? value : [value]);
      case 'notin':
        return query.not(column, 'in', Array.isArray(value) ? value : [value]);
      case 'is':
        return query.is(column, value);
      case 'isnot':
        return query.not(column, 'is', value);
      default:
        return query;
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

  escapeValue(value: any): any {
    if (typeof value === 'string') {
      return value.replace(/'/g, "''");
    }
    return value;
  }

  buildFilterQuery(filters: QueryFilter[]): any {
    // This is handled in the applyFilter method for Supabase
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