import { requestDeduplicator, generateRequestKey } from '@/lib/request-deduplicator';

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

export const databaseApi = {
    fetchTables: async (): Promise<{ success: boolean; data: { tables: SupabaseTable[] }; message?: string }> => {
        const response = await fetch('/api/database/supabase-tables', {
            credentials: 'include'
        });
        return response.json();
    },

    fetchTableSchema: async (tableName: string): Promise<{ success: boolean; data: { columns: any[] }; message?: string }> => {
        const response = await fetch(`/api/database/table-schema/${encodeURIComponent(tableName)}`, {
            credentials: 'include'
        });
        return response.json();
    },

    queryData: async (tableName: string, params: URLSearchParams): Promise<{ success: boolean; data: any[]; total?: number; message?: string }> => {
        const response = await fetch(`/api/database/table-data/${encodeURIComponent(tableName)}?${params}`, {
            credentials: 'include'
        });
        return response.json();
    },

    fetchDistinctValues: async (tableName: string, column: string): Promise<{ success: boolean; data: any[]; message?: string }> => {
        const response = await fetch('/api/database/distinct-values', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ tableName, column }),
        });
        return response.json();
    },

    insertRecord: async (tableName: string, data: Record<string, any>): Promise<{ success: boolean; data: any; message?: string }> => {
        const response = await fetch(`/api/database/table-data/${encodeURIComponent(tableName)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(data),
        });
        return response.json();
    },

    updateRecord: async (tableName: string, id: any, data: Record<string, any>): Promise<{ success: boolean; data: any; message?: string }> => {
        const response = await fetch(`/api/database/table-data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(data),
        });
        return response.json();
    },

    deleteRecord: async (tableName: string, id: any): Promise<{ success: boolean; data: any; message?: string }> => {
        const response = await fetch(`/api/database/table-data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        return response.json();
    },

    advancedQuery: async (rpcName: string, params: object): Promise<{ success: boolean; rows?: any[]; total?: number; message?: string }> => {
        const response = await fetch('/api/database/advanced-query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ rpcName, params }),
        });
        return response.json();
    }
};
