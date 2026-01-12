/**
 * Datasource Adapter (Phase 7)
 * 
 * Unified adapter for Edge-compatible HTTP databases.
 * Supports: Supabase, Neon, PlanetScale, Turso
 */

import type { DatasourceConfig, DatasourceType } from '../schemas/publish';

// =============================================================================
// Types
// =============================================================================

export interface QueryOptions {
    table: string;
    columns?: string[];
    filters?: Record<string, unknown>;
    limit?: number;
    offset?: number;
    orderBy?: { column: string; direction: 'asc' | 'desc' };
}

export interface QueryResult {
    data: Record<string, unknown>[];
    count?: number;
    error?: string;
}

export interface DatasourceAdapter {
    query(options: QueryOptions): Promise<QueryResult>;
    execute(sql: string, params?: unknown[]): Promise<QueryResult>;
    close(): Promise<void>;
}

// =============================================================================
// Supabase Adapter (uses supabase-js or fetch)
// =============================================================================

class SupabaseAdapter implements DatasourceAdapter {
    private url: string;
    private anonKey: string;

    constructor(config: DatasourceConfig) {
        this.url = config.url || process.env.SUPABASE_URL || '';
        this.anonKey = config.anonKey || process.env.SUPABASE_ANON_KEY || '';
    }

    async query(options: QueryOptions): Promise<QueryResult> {
        const { table, columns = ['*'], filters = {}, limit = 100, offset = 0 } = options;

        // Build PostgREST URL
        const selectCols = columns.join(',');
        let url = `${this.url}/rest/v1/${table}?select=${selectCols}`;

        // Add filters
        Object.entries(filters).forEach(([key, value]) => {
            url += `&${key}=eq.${value}`;
        });

        // Add pagination
        url += `&limit=${limit}&offset=${offset}`;

        // Debug logging
        console.log(`[Supabase] Query URL: ${url}`);
        console.log(`[Supabase] Using key: ${this.anonKey ? this.anonKey.substring(0, 20) + '...' : 'MISSING'}`);

        try {
            const response = await fetch(url, {
                headers: {
                    'apikey': this.anonKey,
                    'Authorization': `Bearer ${this.anonKey}`,
                    'Accept': 'application/json',
                    'Prefer': 'count=exact',
                },
            });

            console.log(`[Supabase] Response status: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Supabase] Error response: ${errorText}`);
                throw new Error(`Supabase error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const count = parseInt(response.headers.get('content-range')?.split('/')[1] || '0');

            console.log(`[Supabase] Returned ${data.length} rows, count: ${count}`);

            return { data, count };
        } catch (error) {
            console.error('[Supabase] Query error:', error);
            return { data: [], error: String(error) };
        }
    }

    async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
        // Use Supabase RPC for raw SQL (requires function)
        return { data: [], error: 'Raw SQL not supported via REST' };
    }

    async close(): Promise<void> {
        // No persistent connection to close
    }
}

// =============================================================================
// Neon Adapter (uses @neondatabase/serverless)
// =============================================================================

class NeonAdapter implements DatasourceAdapter {
    private connectionString: string;

    constructor(config: DatasourceConfig) {
        const secretEnvVar = config.secretEnvVar || 'NEON_DATABASE_URL';
        this.connectionString = config.url || process.env[secretEnvVar] || '';
    }

    async query(options: QueryOptions): Promise<QueryResult> {
        const { table, columns = ['*'], filters = {}, limit = 100, offset = 0 } = options;

        // Build SQL query
        const selectCols = columns.join(', ');
        let sql = `SELECT ${selectCols} FROM ${table}`;

        const whereConditions = Object.entries(filters).map(([key, value]) =>
            `${key} = '${value}'`
        );

        if (whereConditions.length > 0) {
            sql += ` WHERE ${whereConditions.join(' AND ')}`;
        }

        sql += ` LIMIT ${limit} OFFSET ${offset}`;

        return this.execute(sql);
    }

    async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
        try {
            // Dynamic import for edge compatibility
            const { neon } = await import('@neondatabase/serverless');
            const sqlClient = neon(this.connectionString);

            // Neon's sql function works with template literals, but we need to call it directly for raw SQL
            const result = await sqlClient.call(null, [sql] as any, ...(params || []));
            return { data: result as Record<string, unknown>[] };
        } catch (error) {
            console.error('[Neon] Query error:', error);
            return { data: [], error: String(error) };
        }
    }

    async close(): Promise<void> {
        // Neon serverless uses HTTP, no persistent connection
    }
}

// =============================================================================
// PlanetScale Adapter (uses @planetscale/database)
// =============================================================================

class PlanetScaleAdapter implements DatasourceAdapter {
    private connectionString: string;

    constructor(config: DatasourceConfig) {
        const secretEnvVar = config.secretEnvVar || 'PLANETSCALE_DATABASE_URL';
        this.connectionString = config.url || process.env[secretEnvVar] || '';
    }

    async query(options: QueryOptions): Promise<QueryResult> {
        const { table, columns = ['*'], filters = {}, limit = 100, offset = 0 } = options;

        const selectCols = columns.join(', ');
        let sql = `SELECT ${selectCols} FROM \`${table}\``;

        const whereConditions = Object.entries(filters).map(([key, value]) =>
            `\`${key}\` = '${value}'`
        );

        if (whereConditions.length > 0) {
            sql += ` WHERE ${whereConditions.join(' AND ')}`;
        }

        sql += ` LIMIT ${limit} OFFSET ${offset}`;

        return this.execute(sql);
    }

    async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
        try {
            const { connect } = await import('@planetscale/database');
            const conn = connect({ url: this.connectionString });

            const result = await conn.execute(sql, params);
            return { data: result.rows as Record<string, unknown>[] };
        } catch (error) {
            console.error('[PlanetScale] Query error:', error);
            return { data: [], error: String(error) };
        }
    }

    async close(): Promise<void> {
        // PlanetScale uses HTTP, no persistent connection
    }
}

// =============================================================================
// Turso Adapter (uses @libsql/client)
// =============================================================================

class TursoAdapter implements DatasourceAdapter {
    private url: string;
    private authToken: string;

    constructor(config: DatasourceConfig) {
        const secretEnvVar = config.secretEnvVar || 'TURSO_AUTH_TOKEN';
        this.url = config.url || process.env.TURSO_DATABASE_URL || '';
        this.authToken = process.env[secretEnvVar] || '';
    }

    async query(options: QueryOptions): Promise<QueryResult> {
        const { table, columns = ['*'], filters = {}, limit = 100, offset = 0 } = options;

        const selectCols = columns.join(', ');
        let sql = `SELECT ${selectCols} FROM "${table}"`;

        const whereConditions = Object.entries(filters).map(([key, value]) =>
            `"${key}" = '${value}'`
        );

        if (whereConditions.length > 0) {
            sql += ` WHERE ${whereConditions.join(' AND ')}`;
        }

        sql += ` LIMIT ${limit} OFFSET ${offset}`;

        return this.execute(sql);
    }

    async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
        try {
            const { createClient } = await import('@libsql/client');
            const client = createClient({
                url: this.url,
                authToken: this.authToken,
            });

            const result = await client.execute(sql);
            return { data: result.rows as Record<string, unknown>[] };
        } catch (error) {
            console.error('[Turso] Query error:', error);
            return { data: [], error: String(error) };
        }
    }

    async close(): Promise<void> {
        // LibSQL HTTP client, no persistent connection
    }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createDatasourceAdapter(config: DatasourceConfig): DatasourceAdapter {
    switch (config.type) {
        case 'supabase':
            return new SupabaseAdapter(config);
        case 'neon':
        case 'postgres':
            return new NeonAdapter(config);
        case 'planetscale':
        case 'mysql':
            return new PlanetScaleAdapter(config);
        case 'turso':
        case 'sqlite':
            return new TursoAdapter(config);
        default:
            throw new Error(`Unsupported datasource type: ${config.type}`);
    }
}

// =============================================================================
// Default Supabase from Environment
// =============================================================================

let defaultAdapter: DatasourceAdapter | null = null;

export function getDefaultDatasource(): DatasourceAdapter | null {
    if (!defaultAdapter && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
        defaultAdapter = new SupabaseAdapter({
            id: 'default',
            type: 'supabase',
            name: 'Default Supabase',
            url: process.env.SUPABASE_URL,
            anonKey: process.env.SUPABASE_ANON_KEY,
        });
    }
    return defaultAdapter;
}

// =============================================================================
// Query Handler for Hono Data API
// =============================================================================

export async function handleDataQuery(
    table: string,
    options: Partial<QueryOptions> = {},
    datasourceConfig?: DatasourceConfig
): Promise<QueryResult> {
    const adapter = datasourceConfig
        ? createDatasourceAdapter(datasourceConfig)
        : getDefaultDatasource();

    if (!adapter) {
        return { data: [], error: 'No datasource configured' };
    }

    return adapter.query({
        table,
        ...options,
    });
}
