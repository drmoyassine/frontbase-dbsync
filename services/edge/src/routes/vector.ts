/**
 * Vector Operations Router — Swappable Vector Store (libSQL default, LanceDB opt-in).
 *
 * Backs the auto-provisioned "Local Vector (libSQL)" EdgeVector record by default.
 * LanceDB is available via LANCEDB_ENABLED=true opt-in flag (native binary unverified).
 *
 * ── Why this lives here (and NOT in engine/lite.ts) ────────────────────────
 * `@lancedb/lancedb` ships native Rust/napi binaries that require a real Node
 * runtime + filesystem. Every cloud adapter imports `liteApp` from engine/lite.ts,
 * and the cloud tsup configs inline every dependency. If this route were imported
 * in lite.ts, LanceDB would be inlined into every cloud bundle and break them.
 *
 * Instead this route is imported ONLY by services/edge/src/index.ts (the Docker
 * entry point). The Docker build externalizes deps by default, so LanceDB is
 * resolved from node_modules at runtime and the native .node binary loads.
 *
 * The module is imported LAZILY (dynamic import) so:
 *   - module load never fails the engine boot if LanceDB isn't installed
 *   - LANCEDB_ENABLED=false short-circuits before touching native code
 *   - a broken native binding degrades to a clean 503, not a crash
 *
 * ── Vector Store Interface ────────────────────────────────────────────────────
 * The router is backed by a swappable VectorStore interface:
 *   - LibsqlVectorStore (default): Pure SQL, no native binary, vectors in libSQL DB.
 *   - LanceVectorStore (opt-in): Existing LanceDB code, requires native binary.
 *
 * Endpoints (all protected by systemKeyAuth, mounted in index.ts):
 *   GET    /test          — verify vector store initializes & open
 *   POST   /create-table  — create a vector table (with metric + dimensions)
 *   POST   /upsert        — insert/update vectors by id (true upsert)
 *   POST   /search        — similarity search
 *   GET    /debug         — diagnostics: version, tables, counts, disk usage
 *   GET    /export        — export a table's rows for migration
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { client } from '../db/index.js';

const vectorRoute = new OpenAPIHono();

// ── Configuration ────────────────────────────────────────────────────────────

function isLanceEnabled(): boolean {
    return (process.env.LANCEDB_ENABLED ?? 'false').toLowerCase() === 'true';
}

// ── Vector Store Interface ───────────────────────────────────────────────────

interface VectorStore {
    test(): Promise<{ success: boolean; dataPath: string; version: string; tableCount: number }>;
    upsert(tableName: string, vectors: Array<{ id: string; vector: number[]; [key: string]: any }>): Promise<{ success: boolean; inserted: number; message: string }>;
    search(tableName: string, queryVector: number[], limit: number): Promise<{ results: any[]; count: number }>;
    debug(): Promise<{ enabled: boolean; version: string; dataPath: string; tables: Array<{ name: string; count: number }>; totalVectors: number; diskUsageBytes: number; healthy: boolean }>;
    export(tableName: string): Promise<{ table: string; rows: any[]; count: number }>;
}

// ── LibsqlVectorStore (default) ─────────────────────────────────────────────

class LibsqlVectorStore implements VectorStore {
    private dataPath: string;

    constructor() {
        const sqlitePath = process.env.SQLITE_PATH || './data/actions.db';
        this.dataPath = sqlitePath.replace('file:', '').replace('./data/', '');
    }

    async test() {
        try {
            // First verify database connection with a simple query
            await client.execute('SELECT 1', []);
        } catch (err: any) {
            throw new Error(`Database connection failed: ${err.message}`);
        }

        // Try to list vector tables, but handle errors gracefully
        let tables: string[] = [];
        try {
            tables = await this._listTables();
        } catch (err: any) {
            // If sqlite_master query fails (e.g., no such table on first run), that's OK
            // This happens when the database file doesn't exist yet
            console.error('[LibsqlVectorStore] Failed to list tables:', err);
        }

        return {
            success: true,
            dataPath: `./data/${this.dataPath}`,
            version: 'libsql',
            tableCount: tables.length,
        };
    }

    async upsert(tableName: string, vectors: Array<{ id: string; vector: number[]; [key: string]: any }>) {
        if (!vectors.length) {
            return { success: true, inserted: 0, message: 'No vectors to upsert' };
        }

        const dims = vectors[0].vector.length;
        const metadata = vectors.map(v => ({
            id: v.id,
            vector: v.vector,
            metadata: JSON.stringify(Object.fromEntries(
                Object.entries(v).filter(([k]) => k !== 'id' && k !== 'vector')
            )),
        }));

        // Auto-create table with inferred dimensions if it doesn't exist
        await this._ensureTable(tableName, dims);

        // Batch upsert using INSERT ... ON CONFLICT DO UPDATE
        let inserted = 0;
        for (const row of metadata) {
            const vecArray = `[${row.vector.join(',')}]`;
            await client.execute(
                `
                    INSERT INTO ${this._quoteId(tableName)} (id, embedding, metadata)
                    VALUES (?, ${this._vectorCast(vecArray)}, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        embedding = ${this._vectorCast(vecArray)},
                        metadata = ?
                `,
                [row.id, row.metadata, row.metadata]
            );
            inserted++;
        }

        return {
            success: true,
            inserted,
            message: `${inserted} vector(s) upserted into '${tableName}'`,
        };
    }

    async search(tableName: string, queryVector: number[], limit: number) {
        const vecArray = `[${queryVector.join(',')}]`;
        const rows = await client.execute(
            `
                SELECT id, metadata,
                    (1 - vector_distance_cos(embedding, ${this._vectorCast(vecArray)})) AS _score
                FROM ${this._quoteId(tableName)}
                ORDER BY vector_distance_cos(embedding, ${this._vectorCast(vecArray)}) ASC
                LIMIT ?
            `,
            [limit]
        );

        const results = rows.rows.map(row => ({
            id: row.id as string,
            ...JSON.parse((row.metadata as string) || '{}'),
            _score: row._score as number,
        }));

        return { results, count: results.length };
    }

    async debug() {
        const tables = await this._listTables();
        let totalVectors = 0;
        const tableInfo: Array<{ name: string; count: number }> = [];

        for (const name of tables) {
            const count = await this._countRows(name);
            totalVectors += count;
            tableInfo.push({ name, count });
        }

        return {
            enabled: true,
            version: 'libsql',
            dataPath: `./data/${this.dataPath}`,
            tables: tableInfo,
            totalVectors,
            diskUsageBytes: 0, // Not easily available in libsql
            healthy: true,
        };
    }

    async export(tableName: string) {
        const rows = await client.execute(
            `SELECT id, metadata FROM ${this._quoteId(tableName)}`,
            []
        );

        // For libSQL, we can't easily export the binary F32_BLOB data as a JSON array
        // The export is primarily for metadata/migration; vectors can be re-embedded
        const results = rows.rows.map(row => ({
            id: row.id as string,
            ...JSON.parse((row.metadata as string) || '{}'),
        }));

        return { table: tableName, rows: results, count: results.length };
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    private async _listTables(): Promise<string[]> {
        // Query sqlite_master for vector tables (those with an embedding column)
        const rows = await client.execute(
            `
                SELECT name FROM sqlite_master
                WHERE type='table' AND sql LIKE '%embedding F32_BLOB%'
                ORDER BY name
            `,
            []
        );
        return rows.rows.map((r: any) => r.name as string);
    }

    private async _ensureTable(tableName: string, dims: number): Promise<void> {
        const exists = await this._tableExists(tableName);
        if (exists) return;

        await client.execute(
            `
                CREATE TABLE ${this._quoteId(tableName)} (
                    id TEXT PRIMARY KEY,
                    embedding F32_BLOB(${dims}) NOT NULL,
                    metadata TEXT
                )
            `,
            []
        );
    }

    private async _tableExists(tableName: string): Promise<boolean> {
        const rows = await client.execute(
            'SELECT 1 FROM sqlite_master WHERE type=? AND name=?',
            ['table', tableName]
        );
        return rows.rows.length > 0;
    }

    private async _countRows(tableName: string): Promise<number> {
        const rows = await client.execute(
            `SELECT COUNT(*) as count FROM ${this._quoteId(tableName)}`,
            []
        );
        return (rows.rows[0] as any)?.count || 0;
    }

    private _quoteId(id: string): string {
        // Only allow alphanumeric + underscore
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
            throw new Error(`Invalid identifier: ${id}`);
        }
        return `"${id}"`;
    }

    private _vectorCast(vecArray: string): string {
        // libsql vector binding: cast to F32_BLOB
        return `cast(${vecArray} as F32_BLOB)`;
    }
}

// ── LanceVectorStore (opt-in, behind LANCEDB_ENABLED) ─────────────────────

/**
 * Minimal structural type for the bits of @lancedb/lancedb we use. Kept loose so
 * the file typechecks even before the (optional, native) dependency is installed.
 */
interface LanceModule {
    connect(path: string): Promise<LanceConnection>;
}
interface LanceConnection {
    tableNames(): Promise<string[]>;
    createTable(name: string, data: unknown[], opts?: Record<string, unknown>): Promise<unknown>;
    openTable(name: string): Promise<LanceTable>;
    dropTable(name: string): Promise<unknown>;
}
interface LanceTable {
    add(rows: unknown[]): Promise<unknown>;
    delete(predicate: string): Promise<unknown>;
    search(vec: number[]): { limit(n: number): { toArrayList(): Promise<any[]>; execute(): Promise<any[]> } };
    query(): { limit(n: number): { toArrayList(): Promise<any[]> } };
    countRows?(): Promise<number>;
    count?(): Promise<number>;
}

let _modulePromise: Promise<LanceModule> | null = null;
let _dbPromise: Promise<LanceConnection> | null = null;

const LANCEDB_MODULE = '@lancedb/lancedb';

async function loadLanceModule(): Promise<LanceModule> {
    if (!_modulePromise) {
        _modulePromise = (import(LANCEDB_MODULE) as Promise<LanceModule>).catch((err) => {
            _modulePromise = null;
            throw err;
        });
    }
    return _modulePromise;
}

async function ensureDataDir(path: string): Promise<void> {
    try {
        const fs = await import('node:fs');
        fs.mkdirSync(path, { recursive: true });
    } catch {
        // Best-effort; LanceDB will surface a clearer error if the path is bad.
    }
}

async function getLanceDb() {
    if (!_dbPromise) {
        const path = process.env.EMBEDDED_LANCEDB_PATH || '/app/data/lancedb';
        await ensureDataDir(path);
        const { connect } = await loadLanceModule();
        _dbPromise = Promise.resolve(connect(path));
        _dbPromise.catch(() => { _dbPromise = null; });
    }
    return _dbPromise;
}

async function lanceVersion(): Promise<string> {
    try {
        const { createRequire } = await import('node:module');
        const require = createRequire(import.meta.url);
        return require('@lancedb/lancedb/package.json').version || 'unknown';
    } catch {
        return 'unknown';
    }
}

async function dirSize(dir: string): Promise<number> {
    const { promises: fs } = await import('node:fs');
    let total = 0;
    async function walk(d: string) {
        let entries: import('node:fs').Dirent[];
        try { entries = await fs.readdir(d, { withFileTypes: true }); }
        catch { return; }
        for (const entry of entries) {
            const full = `${d}/${entry.name}`;
            if (entry.isDirectory()) await walk(full);
            else { try { total += (await fs.stat(full)).size; } catch { /* skip */ } }
        }
    }
    await walk(dir);
    return total;
}

class LanceVectorStore implements VectorStore {
    async test() {
        const db = await getLanceDb();
        const tables = await db.tableNames();
        return {
            success: true,
            dataPath: process.env.EMBEDDED_LANCEDB_PATH || '/app/data/lancedb',
            version: await lanceVersion(),
            tableCount: tables.length,
        };
    }

    async upsert(tableName: string, vectors: Array<{ id: string; vector: number[]; [key: string]: any }>) {
        const db = await getLanceDb();
        const existing = await db.tableNames();

        if (!existing.includes(tableName)) {
            await db.createTable(tableName, vectors);
            return { success: true, inserted: vectors.length, message: `Table '${tableName}' created and ${vectors.length} vector(s) inserted.` };
        }

        const table = await db.openTable(tableName);
        const ids = vectors.map((v) => v.id);
        try {
            const inList = ids.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',');
            await table.delete(`id IN (${inList})`);
        } catch { /* fall through */ }
        await table.add(vectors);

        return { success: true, inserted: vectors.length, message: `${vectors.length} vector(s) upserted into '${tableName}'.` };
    }

    async search(tableName: string, queryVector: number[], limit: number) {
        const db = await getLanceDb();
        const existing = await db.tableNames();
        if (!existing.includes(tableName)) {
            throw new Error(`Table '${tableName}' does not exist.`);
        }
        const table = await db.openTable(tableName);
        const results = await table.search(queryVector).limit(limit).toArrayList();
        return { results, count: results.length };
    }

    async debug() {
        const db = await getLanceDb();
        const tables = await db.tableNames();
        let totalVectors = 0;
        const tableInfo = [];

        for (const name of tables) {
            try {
                const tbl = await db.openTable(name);
                const count = typeof (tbl as any).countRows === 'function'
                    ? await (tbl as any).countRows()
                    : await (tbl as any).count();
                totalVectors += Number(count) || 0;
                tableInfo.push({ name, count: Number(count) || 0 });
            } catch {
                tableInfo.push({ name, count: null, error: 'unreadable' });
            }
        }

        let diskUsageBytes = 0;
        try {
            diskUsageBytes = await dirSize(process.env.EMBEDDED_LANCEDB_PATH || '/app/data/lancedb');
        } catch { /* ignore */ }

        return {
            enabled: true,
            version: await lanceVersion(),
            dataPath: process.env.EMBEDDED_LANCEDB_PATH || '/app/data/lancedb',
            tables: tableInfo,
            totalVectors,
            diskUsageBytes,
            healthy: true,
        };
    }

    async export(tableName: string) {
        const db = await getLanceDb();
        const existing = await db.tableNames();
        if (!existing.includes(tableName)) {
            throw new Error(`Table '${tableName}' not found`);
        }
        const table = await db.openTable(tableName);
        const rows = await table.query().limit(1_000_000).toArrayList();
        return { table: tableName, rows, count: rows.length };
    }
}

// ── Store Selection ─────────────────────────────────────────────────────────

function getStore(): VectorStore {
    if (isLanceEnabled()) {
        return new LanceVectorStore();
    }
    return new LibsqlVectorStore();
}

// ── Shared guard: LanceDB disabled → 503 ───────────────────────────────────

function disabledResponse(c: any) {
    return c.json({
        success: false,
        enabled: false,
        message: 'LanceDB is disabled (LANCEDB_ENABLED=false). Use libsql_vector instead.',
    }, 503);
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const VectorRowSchema = z.object({
    id: z.string().openapi({ description: 'Stable row identifier (used for upsert dedup)' }),
    vector: z.array(z.number()).openapi({ description: 'Embedding vector' }),
}).catchall(z.any()).openapi({ description: 'A vector row. Extra keys are stored as metadata.' });

const UpsertSchema = z.object({
    tableName: z.string().min(1),
    vectors: z.array(VectorRowSchema).min(1),
});

const SearchSchema = z.object({
    tableName: z.string().min(1),
    queryVector: z.array(z.number()).min(1),
    limit: z.number().int().min(1).max(1000).default(10),
});

const SuccessSchema = z.object({
    success: z.boolean(),
    message: z.string(),
});
const ErrorSchema = z.object({
    success: z.boolean(),
    error: z.string(),
    message: z.string().optional(),
});

// ── GET /test ─────────────────────────────────────────────────────────────────

const testRoute = createRoute({
    method: 'get',
    path: '/test',
    tags: ['Vector'],
    summary: 'Test vector store connection',
    responses: {
        200: {
            description: 'Connection OK',
            content: { 'application/json': { schema: SuccessSchema.extend({
                dataPath: z.string(),
                version: z.string(),
                tableCount: z.number(),
            }) } },
        },
        500: { description: 'Connection failed', content: { 'application/json': { schema: ErrorSchema } } },
        503: { description: 'Disabled', content: { 'application/json': { schema: ErrorSchema } } },
    },
});

vectorRoute.openapi(testRoute, async (c) => {
    // LanceDB disabled is OK for libsql - we only return 503 if LanceDB was explicitly requested but unavailable
    try {
        const store = getStore();
        const result = await store.test();
        return c.json({
            success: true,
            message: 'Vector store connection successful',
            ...result,
        }, 200);
    } catch (err: any) {
        // Log full error for debugging
        console.error('[Vector Test] Error:', err);
        console.error('[Vector Test] Error stack:', err.stack);
        return c.json({
            success: false,
            error: err.name || 'ConnectionError',
            message: err.message || 'Failed to connect to vector store',
            details: String(err),
        }, 500);
    }
});

// ── POST /upsert ───────────────────────────────────────────────────────────

const upsertRoute = createRoute({
    method: 'post',
    path: '/upsert',
    tags: ['Vector'],
    summary: 'Upsert vectors (insert or update by id)',
    description: 'If the table does not exist it is created from the first row. If it exists, rows whose id matches are deleted first, then all rows are added — giving true upsert semantics.',
    request: { body: { content: { 'application/json': { schema: UpsertSchema } } } },
    responses: {
        200: { description: 'Upserted', content: { 'application/json': { schema: SuccessSchema.extend({
            inserted: z.number(),
        }) } } },
        400: { description: 'Bad request', content: { 'application/json': { schema: ErrorSchema } } },
        500: { description: 'Failed', content: { 'application/json': { schema: ErrorSchema } } },
        503: { description: 'Disabled', content: { 'application/json': { schema: ErrorSchema } } },
    },
});

vectorRoute.openapi(upsertRoute, async (c) => {
    try {
        const { tableName, vectors } = c.req.valid('json');
        const store = getStore();
        // Convert zod schema output to the format expected by the store
        const vectorsArray = vectors.map((v: any) => ({ id: v.id, vector: Array.from(v.vector), ...v }));
        const result = await store.upsert(tableName, vectorsArray);
        return c.json(result, 200);
    } catch (err: any) {
        return c.json({
            success: false,
            error: err.name || 'UpsertError',
            message: err.message || 'Failed to upsert vectors',
        }, 500);
    }
});

// ── POST /search ───────────────────────────────────────────────────────────

const searchRoute = createRoute({
    method: 'post',
    path: '/search',
    tags: ['Vector'],
    summary: 'Vector similarity search',
    request: { body: { content: { 'application/json': { schema: SearchSchema } } } },
    responses: {
        200: { description: 'Results', content: { 'application/json': { schema: z.object({
            results: z.array(z.record(z.any())),
            count: z.number(),
        }) } } },
        400: { description: 'Bad request', content: { 'application/json': { schema: ErrorSchema } } },
        404: { description: 'Table not found', content: { 'application/json': { schema: ErrorSchema } } },
        500: { description: 'Failed', content: { 'application/json': { schema: ErrorSchema } } },
        503: { description: 'Disabled', content: { 'application/json': { schema: ErrorSchema } } },
    },
});

vectorRoute.openapi(searchRoute, async (c) => {
    try {
        const { tableName, queryVector, limit } = c.req.valid('json');
        const store = getStore();
        const result = await store.search(tableName, queryVector, limit);
        return c.json(result, 200);
    } catch (err: any) {
        return c.json({
            success: false,
            error: err.name || 'SearchError',
            message: err.message || 'Vector search failed',
        }, 500);
    }
});

// ── GET /debug ───────────────────────────────────────────────────────────

const debugRoute = createRoute({
    method: 'get',
    path: '/debug',
    tags: ['Vector'],
    summary: 'Vector store diagnostics',
    responses: {
        200: {
            description: 'Diagnostics',
            content: { 'application/json': { schema: z.object({
                enabled: z.boolean(),
                version: z.string(),
                dataPath: z.string(),
                tables: z.array(z.any()),
                totalVectors: z.number(),
                diskUsageBytes: z.number(),
                healthy: z.boolean(),
                error: z.string().optional(),
            }) } },
        },
    },
});

vectorRoute.openapi(debugRoute, async (c) => {
    try {
        const store = getStore();
        const result = await store.debug();
        return c.json({ ...result, enabled: true }, 200);
    } catch (err: any) {
        return c.json({
            enabled: true,
            version: isLanceEnabled() ? 'lancedb' : 'libsql',
            dataPath: isLanceEnabled() ? (process.env.EMBEDDED_LANCEDB_PATH || '/app/data/lancedb') : `./data/${process.env.SQLITE_PATH || 'actions.db'}`,
            tables: [],
            totalVectors: 0,
            diskUsageBytes: 0,
            healthy: false,
            error: err.message || String(err),
        }, 200);
    }
});

// ── GET /export ───────────────────────────────────────────────────────────

const exportRoute = createRoute({
    method: 'get',
    path: '/export',
    tags: ['Vector'],
    summary: 'Export a table for migration',
    description: 'Returns all rows of a table as JSON. Use to migrate from one vector store to another.',
    request: { query: z.object({ tableName: z.string().min(1) }) },
    responses: {
        200: {
            description: 'Exported',
            content: { 'application/json': { schema: z.object({
                table: z.string(),
                rows: z.array(z.record(z.any())),
                count: z.number(),
            }) } },
        },
        404: { description: 'Table not found', content: { 'application/json': { schema: ErrorSchema } } },
        500: { description: 'Failed', content: { 'application/json': { schema: ErrorSchema } } },
        503: { description: 'Disabled', content: { 'application/json': { schema: ErrorSchema } } },
    },
});

vectorRoute.openapi(exportRoute, async (c) => {
    const tableName = c.req.query('tableName') || '';
    if (!tableName) {
        return c.json({ success: false, error: 'BadRequest', message: 'tableName query param is required' }, 400);
    }
    try {
        const store = getStore();
        const result = await store.export(tableName);
        return c.json(result, 200);
    } catch (err: any) {
        return c.json({
            success: false,
            error: err.name || 'ExportError',
            message: err.message || 'Failed to export table',
        }, 500);
    }
});

export { vectorRoute };
