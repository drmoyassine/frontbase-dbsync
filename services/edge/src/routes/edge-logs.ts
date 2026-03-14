/**
 * Edge Logs Routes — persisted runtime log storage.
 * 
 * POST /api/edge-logs — bulk insert logs (from FastAPI sync cron)
 * GET  /api/edge-logs — paginated read (for inspector UI)
 */

import { Hono } from 'hono';
import { getStateProvider, ensureInitialized } from '../storage/index.js';
import { edgeLogsTable } from '../storage/schema.js';
import { desc, sql, and } from 'drizzle-orm';

export const edgeLogsRoute = new Hono();

/**
 * Access Drizzle DB from the state provider.
 * Both LocalSqliteProvider and TursoHttpProvider store it as a private `db` field.
 * We access it via the provider's internal structure after ensuring init is complete.
 */
async function getDb() {
    await ensureInitialized();
    const provider = getStateProvider();
    // Access internal db — both providers store it as this.db after init()
    return (provider as any).db || (provider as any).getDb?.();
}

// =============================================================================
// POST /api/edge-logs — Bulk insert log entries (called by FastAPI sync)
// =============================================================================

edgeLogsRoute.post('/', async (c) => {
    const body = await c.req.json<{ logs: Array<{
        timestamp: string;
        level: string;
        message: string;
        source?: string;
        metadata?: Record<string, unknown>;
    }> }>();

    const logs = body?.logs;
    if (!logs || !Array.isArray(logs) || logs.length === 0) {
        return c.json({ success: false, error: 'No logs provided' }, 400);
    }

    const db = await getDb();
    if (!db) {
        return c.json({ success: false, error: 'State database not available' }, 503);
    }

    // Generate unique IDs and normalize entries
    const values = logs.map((log) => ({
        id: crypto.randomUUID(),
        timestamp: log.timestamp || new Date().toISOString(),
        level: log.level || 'info',
        message: log.message || '',
        source: log.source || 'runtime',
        metadata: log.metadata ? JSON.stringify(log.metadata) : null,
    }));

    try {
        // Insert in batches of 100 to avoid SQLite variable limits
        const BATCH_SIZE = 100;
        let inserted = 0;
        for (let i = 0; i < values.length; i += BATCH_SIZE) {
            const batch = values.slice(i, i + BATCH_SIZE);
            await db.insert(edgeLogsTable).values(batch);
            inserted += batch.length;
        }

        return c.json({ success: true, inserted });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[EdgeLogs] Bulk insert failed:', message);
        return c.json({ success: false, error: message }, 500);
    }
});

// =============================================================================
// GET /api/edge-logs — Paginated read (for inspector UI)
// =============================================================================

edgeLogsRoute.get('/', async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 500);
    const before = c.req.query('before'); // ISO timestamp cursor
    const level = c.req.query('level');   // Optional level filter

    const db = await getDb();
    if (!db) {
        return c.json({ logs: [], next_cursor: null, error: 'State database not available' }, 503);
    }

    try {
        const conditions: ReturnType<typeof sql>[] = [];
        if (before) {
            conditions.push(sql`${edgeLogsTable.timestamp} < ${before}`);
        }
        if (level) {
            conditions.push(sql`${edgeLogsTable.level} = ${level}`);
        }

        let query = db.select().from(edgeLogsTable);
        if (conditions.length > 0) {
            query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions)) as typeof query;
        }

        const rows = await (query as any)
            .orderBy(desc(edgeLogsTable.timestamp))
            .limit(limit + 1); // Fetch one extra to detect next page

        const hasMore = rows.length > limit;
        const results = hasMore ? rows.slice(0, limit) : rows;
        const nextCursor = hasMore ? results[results.length - 1]?.timestamp : null;

        return c.json({
            logs: results.map((row: any) => ({
                id: row.id,
                timestamp: row.timestamp,
                level: row.level,
                message: row.message,
                source: row.source,
                metadata: row.metadata ? JSON.parse(row.metadata) : null,
            })),
            next_cursor: nextCursor,
            total: results.length,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[EdgeLogs] Query failed:', message);
        return c.json({ logs: [], next_cursor: null, error: message }, 500);
    }
});
