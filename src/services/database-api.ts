import api from './api-service';
import { ApiContracts, DbConnectionSchema, TablesListSchema, TableSchemaResponseSchema, TableDataResultSchema } from './api-contracts';

export interface SupabaseTable {
  name: string;
  schema: string;
  path?: string;
}

export interface TableSchema {
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    default?: any;
    isPrimaryKey?: boolean;
    foreignKey?: {
      table: string;
      column: string;
    };
  }>;
}

// Database connection API
export const testDatabaseConnection = async (connectionData: { supabaseUrl: string; supabaseAnonKey: string }) => {
  try {
    const response = await api.post('/api/database/test-supabase', {
      url: connectionData.supabaseUrl,
      anonKey: connectionData.supabaseAnonKey
    });
    return response.data;
  } catch (error) {
    console.error('Error testing database connection:', error);
    throw error;
  }
};

export const getDatabaseConnections = async (): Promise<any> => {
  try {
    const response = await api.get('/api/database/connections');
    // Validate with strict contract
    return ApiContracts.validate(DbConnectionSchema, response.data, 'getDatabaseConnections');
  } catch (error) {
    console.error('Error getting database connections:', error);
    throw error;
  }
};

export const connectSupabase = async (connectionData: { supabaseUrl: string; supabaseAnonKey: string; supabaseServiceKey?: string }) => {
  try {
    const response = await api.post('/api/database/connect-supabase', {
      url: connectionData.supabaseUrl,
      anonKey: connectionData.supabaseAnonKey,
      serviceKey: connectionData.supabaseServiceKey
    });
    return response.data;
  } catch (error) {
    console.error('Error connecting to Supabase:', error);
    throw error;
  }
};

export const disconnectSupabase = async () => {
  try {
    const response = await api.delete('/api/database/disconnect-supabase');
    return response.data;
  } catch (error) {
    console.error('Error disconnecting from Supabase:', error);
    throw error;
  }
};

export const getDatabaseTables = async () => {
  try {
    const response = await api.get('/api/database/tables');
    // Validate with strict contract
    return ApiContracts.validate(TablesListSchema, response.data, 'getDatabaseTables');
  } catch (error) {
    console.error('Error getting database tables:', error);
    throw error;
  }
};

export const getTableSchema = async (tableName: string) => {
  try {
    const response = await api.get(`/api/database/table-schema/${tableName}`);
    // Validate with strict contract
    return ApiContracts.validate(TableSchemaResponseSchema, response.data, 'getTableSchema');
  } catch (error) {
    console.error('Error getting table schema:', error);
    throw error;
  }
};

export const databaseApi = {
  fetchTables: async (): Promise<{ tables: SupabaseTable[] }> => {
    const response = await api.get('/api/database/tables');
    const data = ApiContracts.validate(TablesListSchema, response.data, 'fetchTables');
    return data;
  },

  fetchTableSchema: async (tableName: string): Promise<{ table_name: string; columns: any[] }> => {
    const response = await api.get(`/api/database/table-schema/${encodeURIComponent(tableName)}`);
    const data = ApiContracts.validate(TableSchemaResponseSchema, response.data, 'fetchTableSchema');
    return data;
  },

  queryData: async (tableName: string, params: URLSearchParams): Promise<any> => {
    const response = await api.get(`/api/database/table-data/${encodeURIComponent(tableName)}?${params}`);
    // Table data uses a loose schema but we still validate the wrapper
    return response.data;
  },

  fetchDistinctValues: async (tableName: string, column: string): Promise<any> => {
    const response = await api.post('/api/database/distinct-values', { tableName, column });
    return response.data;
  },

  insertRecord: async (tableName: string, data: Record<string, any>): Promise<any> => {
    const response = await api.post(`/api/database/table-data/${encodeURIComponent(tableName)}`, data);
    return response.data;
  },

  updateRecord: async (tableName: string, id: any, data: Record<string, any>): Promise<any> => {
    const response = await api.put(`/api/database/table-data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`, data);
    return response.data;
  },

  deleteRecord: async (tableName: string, id: any): Promise<any> => {
    const response = await api.delete(`/api/database/table-data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`);
    return response.data;
  },

  advancedQuery: async (rpcName: string, params: object): Promise<any> => {
    const response = await api.post('/api/database/advanced-query', { rpcName, params });
    // For advanced query, we validate the presence of 'rows' matching our parity requirements
    const data = response.data;
    if (data.success && !data.rows && data.data) {
      data.rows = data.data; // Ensure 'rows' is present
    }
    return data;
  }
};
