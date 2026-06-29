/**
 * Vector Store Adapter Interface for RAG — Direct provider access.
 *
 * Follows the same pattern as IStateProvider, ICacheProvider, StorageAdapter:
 *   - Edge connects directly to vector store (libSQL, Cloudflare Vectorize, LanceDB, pgvector)
 *   - Credentials from FRONTBASE_VECTOR config (pushed at deploy time)
 *   - No backend API calls — maintains edge self-sufficiency
 */

import { getVectorConfig } from '../../config/env.js';

// =============================================================================
// Types
// =============================================================================

export interface VectorMetadata {
    [key: string]: any;
}

export interface VectorDocument {
    id: string;
    vector: number[];
    text: string;
    metadata?: VectorMetadata;
}

export interface VectorSearchResult {
    id: string;
    text: string;
    score: number;
    metadata: VectorMetadata;
}

export interface VectorAdapter {
    /**
     * Upsert vectors into the store.
     */
    upsert(tableName: string, vectors: VectorDocument[]): Promise<void>;

    /**
     * Search by vector similarity.
     */
    search(
        tableName: string,
        queryVector: number[],
        limit: number,
        filters?: VectorMetadata
    ): Promise<VectorSearchResult[]>;

    /**
     * Delete vectors by IDs.
     */
    delete(tableName: string, ids: string[]): Promise<void>;

    /**
     * Create a table/collection if it doesn't exist.
     */
    ensureTable(tableName: string): Promise<void>;
}

// =============================================================================
// libSQL (Turso) Adapter
// =============================================================================

export class LibSqlVectorAdapter implements VectorAdapter {
    private url: string;
    private token?: string;

    constructor(config: { url: string; token?: string }) {
        this.url = config.url.replace(/\/$/, '');
        this.token = config.token;
    }

    async upsert(tableName: string, vectors: VectorDocument[]): Promise<void> {
        const client = this.getClient();

        for (const doc of vectors) {
            const metadataStr = JSON.stringify(doc.metadata || {});
            const vectorStr = JSON.stringify(doc.vector);

            await client.execute({
                sql: `
                    INSERT OR REPLACE INTO ${tableName} (id, vector, text, metadata)
                    VALUES (?, ?, ?, ?)
                `,
                args: [doc.id, vectorStr, doc.text, metadataStr],
            });
        }
    }

    async search(
        tableName: string,
        queryVector: number[],
        limit: number,
        filters?: VectorMetadata
    ): Promise<VectorSearchResult[]> {
        const client = this.getClient();

        // Build filter conditions
        let whereClause = '';
        const filterValues: any[] = [];

        if (filters && Object.keys(filters).length > 0) {
            const conditions: string[] = [];
            for (const [key, value] of Object.entries(filters)) {
                conditions.push(`json_extract(metadata, '$.${key}') = ?`);
                filterValues.push(value);
            }
            whereClause = ' AND ' + conditions.join(' AND ');
        }

        const queryStr = JSON.stringify(queryVector);

        const result = await client.execute({
            sql: `
                SELECT
                    id,
                    text,
                    metadata,
                    vector_distance(vector, ?) as distance
                FROM ${tableName}
                WHERE vector IS NOT NULL${whereClause}
                ORDER BY distance
                LIMIT ?
            `,
            args: [queryStr, ...filterValues, limit],
        });

        return result.rows.map((row: any) => ({
            id: row.id,
            text: row.text,
            score: 1 - (row.distance || 0), // Convert distance to similarity
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
        }));
    }

    async delete(tableName: string, ids: string[]): Promise<void> {
        const client = this.getClient();

        await client.execute({
            sql: `DELETE FROM ${tableName} WHERE id IN (${ids.map(() => '?').join(',')})`,
            args: ids,
        });
    }

    async ensureTable(tableName: string): Promise<void> {
        const client = this.getClient();

        // Create table with vector support (libSQL uses vector extension)
        await client.execute({
            sql: `
                CREATE TABLE IF NOT EXISTS ${tableName} (
                    id TEXT PRIMARY KEY,
                    vector TEXT,
                    text TEXT,
                    metadata TEXT
                )
            `,
            args: [],
        });
    }

    private getClient() {
        // Dynamic import to avoid cycles
        const { createClient } = require('@libsql/client');
        return createClient({
            url: this.url,
            authToken: this.token,
        });
    }
}

// =============================================================================
// Cloudflare Vectorize Adapter
// =============================================================================

export class VectorizeAdapter implements VectorAdapter {
    private accountId: string;
    private apiToken: string;
    private indexName: string;

    constructor(config: { accountId: string; apiToken: string; indexName: string }) {
        this.accountId = config.accountId;
        this.apiToken = config.apiToken;
        this.indexName = config.indexName;
    }

    async upsert(tableName: string, vectors: VectorDocument[]): Promise<void> {
        // Vectorize uses a single index per account, tableName is ignored
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/vectorize/indexes/${this.indexName}/upsert`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    vectors: vectors.map((v) => ({
                        id: v.id,
                        vector: v.vector,
                        metadata: {
                            text: v.text,
                            ...v.metadata,
                        },
                    })),
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Vectorize upsert failed: ${response.statusText}`);
        }
    }

    async search(
        tableName: string,
        queryVector: number[],
        limit: number,
        filters?: VectorMetadata
    ): Promise<VectorSearchResult[]> {
        let filter = undefined;
        if (filters && Object.keys(filters).length > 0) {
            filter = filters;
        }

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/vectorize/indexes/${this.indexName}/query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    vector: queryVector,
                    topK: limit,
                    filter,
                    returnValues: true,
                    returnMetadata: true,
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Vectorize query failed: ${response.statusText}`);
        }

        const data = await response.json();

        return (data.result?.matches || []).map((match: any) => ({
            id: match.id,
            text: match.metadata?.text || '',
            score: match.score,
            metadata: match.metadata || {},
        }));
    }

    async delete(tableName: string, ids: string[]): Promise<void> {
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/vectorize/indexes/${this.indexName}/delete_by_ids`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids }),
            }
        );

        if (!response.ok) {
            throw new Error(`Vectorize delete failed: ${response.statusText}`);
        }
    }

    async ensureTable(tableName: string): Promise<void> {
        // Vectorize indexes are created separately, this is a no-op
        // In production, you'd check if the index exists and create it
    }
}

// =============================================================================
// LanceDB Adapter (for Docker edge with local storage)
// =============================================================================

export class LanceDbAdapter implements VectorAdapter {
    private uri: string;

    constructor(config: { uri: string }) {
        this.uri = config.uri;
    }

    async upsert(tableName: string, vectors: VectorDocument[]): Promise<void> {
        const lancedb = await import('lancedb');
        const conn = await lancedb.connect({ uri: this.uri });
        const table = await conn.openTable(tableName).catch(() => null);

        if (!table) {
            await this.ensureTable(tableName);
        }

        const actualTable = await conn.openTable(tableName);

        // LanceDB expects data in a specific format
        const records = vectors.map((v) => ({
            id: v.id,
            vector: v.vector,
            text: v.text,
            ...v.metadata,
        }));

        await actualTable.add(records);
    }

    async search(
        tableName: string,
        queryVector: number[],
        limit: number,
        filters?: VectorMetadata
    ): Promise<VectorSearchResult[]> {
        const lancedb = await import('lancedb');
        const conn = await lancedb.connect({ uri: this.uri });
        const table = await conn.openTable(tableName);

        let query = table.search(queryVector).limit(limit);

        if (filters && Object.keys(filters).length > 0) {
            query = query.where(filters);
        }

        const results = await query.execute();

        return results.map((row: any) => ({
            id: row.id,
            text: row.text || '',
            score: row._distance || 0,
            metadata: row,
        }));
    }

    async delete(tableName: string, ids: string[]): Promise<void> {
        const lancedb = await import('lancedb');
        const conn = await lancedb.connect({ uri: this.uri });
        const table = await conn.openTable(tableName);

        await table.delete(`id IN (${ids.map((id) => `'${id}'`).join(',')})`);
    }

    async ensureTable(tableName: string): Promise<void> {
        const lancedb = await import('lancedb');
        const conn = await lancedb.connect({ uri: this.uri });

        await conn.createTable({
            name: tableName,
            schema: {
                id: lancedb.schema.string(),
                vector: lancedb.schema.vector(1536), // OpenAI embedding dimension
                text: lancedb.schema.string(),
            },
        });
    }
}

// =============================================================================
// pgvector Adapter (Supabase/Neon)
// =============================================================================

export class PgVectorAdapter implements VectorAdapter {
    private url: string;

    constructor(config: { url: string }) {
        this.url = config.url;
    }

    async upsert(tableName: string, vectors: VectorDocument[]): Promise<void> {
        const client = await this.getClient();

        for (const doc of vectors) {
            const metadataStr = JSON.stringify(doc.metadata || {});
            const vectorArray = `[${doc.vector.join(',')}]`;

            await client.query(
                `
                    INSERT INTO ${tableName} (id, embedding, text, metadata)
                    VALUES ($1, $2::vector, $3, $4)
                    ON CONFLICT (id) DO UPDATE SET
                        embedding = EXCLUDED.embedding,
                        text = EXCLUDED.text,
                        metadata = EXCLUDED.metadata
                `,
                [doc.id, vectorArray, doc.text, metadataStr]
            );
        }

        await client.end();
    }

    async search(
        tableName: string,
        queryVector: number[],
        limit: number,
        filters?: VectorMetadata
    ): Promise<VectorSearchResult[]> {
        const client = await this.getClient();

        let whereClause = '';
        const filterValues: any[] = [];
        let paramIndex = 3;

        if (filters && Object.keys(filters).length > 0) {
            const conditions: string[] = [];
            for (const [key, value] of Object.entries(filters)) {
                conditions.push(`metadata->>$${paramIndex} = $${paramIndex + 1}`);
                filterValues.push(key, value);
                paramIndex += 2;
            }
            whereClause = ' AND ' + conditions.join(' AND ');
        }

        const vectorArray = `[${queryVector.join(',')}]`;

        const result = await client.query(
            `
                SELECT
                    id,
                    text,
                    metadata,
                    1 - (embedding <=> $1::vector) as score
                FROM ${tableName}
                WHERE embedding IS NOT NULL${whereClause}
                ORDER BY embedding <=> $1::vector
                LIMIT $2
            `,
            [vectorArray, limit, ...filterValues]
        );

        await client.end();

        return result.rows.map((row: any) => ({
            id: row.id,
            text: row.text,
            score: row.score,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
        }));
    }

    async delete(tableName: string, ids: string[]): Promise<void> {
        const client = await this.getClient();

        await client.query(
            `DELETE FROM ${tableName} WHERE id = ANY($1)`,
            [ids]
        );

        await client.end();
    }

    async ensureTable(tableName: string): Promise<void> {
        const client = await this.getClient();

        await client.query(`
            CREATE TABLE IF NOT EXISTS ${tableName} (
                id TEXT PRIMARY KEY,
                embedding vector(1536),
                text TEXT,
                metadata JSONB
            );

            CREATE INDEX IF NOT EXISTS ${tableName}_embedding_idx
                ON ${tableName} USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 100);
        `);

        await client.end();
    }

    private async getClient() {
        const pg = await import('pg');
        const { Pool } = pg.default || pg;
        const pool = new Pool({ connectionString: this.url });
        return pool.connect();
    }
}

// =============================================================================
// Vector Adapter Factory
// =============================================================================

let _adapter: VectorAdapter | null = null;

/**
 * Get the vector adapter based on FRONTBASE_VECTOR config.
 * Reads from env config set at deploy time (edge self-sufficiency).
 */
export function getVectorAdapter(): VectorAdapter {
    if (_adapter) {
        return _adapter;
    }

    const config = getVectorConfig();

    try {
        switch (config.provider) {
            case 'turso':
            case 'libsql':
                if (!config.url) {
                    throw new Error('libSQL requires url');
                }
                _adapter = new LibSqlVectorAdapter({
                    url: config.url,
                    token: config.token,
                });
                break;

            case 'cloudflare':
            case 'vectorize':
                if (!config.cfAccountId || !config.cfApiToken) {
                    throw new Error('Vectorize requires accountId and apiToken');
                }
                _adapter = new VectorizeAdapter({
                    accountId: config.cfAccountId,
                    apiToken: config.cfApiToken,
                    indexName: config.url || 'rag_documents',
                });
                break;

            case 'lancedb':
                _adapter = new LanceDbAdapter({
                    uri: config.url || './lancedb',
                });
                break;

            case 'pgvector':
            case 'supabase':
            case 'neon':
                if (!config.url) {
                    throw new Error('pgvector requires url');
                }
                _adapter = new PgVectorAdapter({ url: config.url });
                break;

            default:
                throw new Error(`Unsupported vector provider: ${config.provider}`);
        }

        return _adapter;
    } catch (err: any) {
        throw new Error(`Failed to initialize vector adapter: ${err.message}`);
    }
}

/**
 * Reset the vector adapter singleton (for testing/config reload).
 */
export function resetVectorAdapter(): void {
    _adapter = null;
}

/**
 * Validate bucket name for security (prevent path traversal, injection).
 */
export function validateBucketName(bucket: string): void {
    // Bucket names should be alphanumeric with hyphens/underscores, 3-63 chars
    const valid = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$|^[a-z0-9]$/i.test(bucket);
    if (!valid) {
        throw new Error(`Invalid bucket name: ${bucket}`);
    }
}

/**
 * Validate file path (prevent path traversal attacks).
 */
export function validateFilePath(path: string): void {
    // Prevent path traversal
    if (path.includes('..') || path.includes('\\') || path.startsWith('/')) {
        throw new Error(`Invalid file path (potential traversal): ${path}`);
    }
}
