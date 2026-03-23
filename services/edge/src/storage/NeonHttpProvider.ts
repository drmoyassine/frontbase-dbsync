/**
 * NeonHttpProvider — PostgreSQL via @neondatabase/serverless (HTTP/WebSocket)
 * 
 * Used for both Neon and Supabase databases as the edge state provider.
 * Uses the Neon serverless adapter over HTTP (no TCP sockets needed).
 * 
 * All tables are created in a dedicated PG schema (default: `frontbase_edge`)
 * to avoid polluting the user's `public` schema. Multiple deployments can
 * share the same database by using different schemas (e.g. `frontbase_edge_staging`).
 * 
 * Env vars:
 * - FRONTBASE_STATE_DB_URL: PostgreSQL connection string (pooler URL)
 * - FRONTBASE_STATE_DB_TOKEN: Not needed (auth embedded in URL)
 * - FRONTBASE_SCHEMA_NAME: PG schema to use (default: frontbase_edge)
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — no calls to FastAPI at runtime.
 * 
 * DEPENDENCY: Requires `@neondatabase/serverless` in package.json.
 *   npm install @neondatabase/serverless
 */

import type { PublishPage, PageLayout, SeoData, DatasourceConfig } from '../schemas/publish';
import type {
    IStateProvider, ProjectSettingsData, PublishedPageSummary,
    WorkflowData, ExecutionData, NewExecutionData, ExecutionStats, DeadLetterData,
} from './IStateProvider';

const DEFAULT_FAVICON = '/static/icon.png';
const SCHEMA = process.env.FRONTBASE_SCHEMA_NAME || 'frontbase_edge';

// =============================================================================
// PG HTTP Client (uses @neondatabase/serverless)
// =============================================================================

interface PgResult {
    rows: Record<string, unknown>[];
    rowCount: number;
}

/**
 * Lazy-loaded Neon serverless client.
 * Uses Pool from @neondatabase/serverless which supports standard
 * pool.query(sql, params) syntax — compatible with all versions.
 */
let _neonSql: ((sqlStr: string, params?: unknown[]) => Promise<PgResult>) | null = null;

async function getNeonClient(): Promise<(sqlStr: string, params?: unknown[]) => Promise<PgResult>> {
    if (_neonSql) return _neonSql;

    const dbUrl = process.env.FRONTBASE_STATE_DB_URL;
    if (!dbUrl) {
        throw new Error('[NeonHttpProvider] FRONTBASE_STATE_DB_URL is required');
    }

    try {
        // Dynamic import to avoid build-time failures when dep not installed
        const { Pool } = await import('@neondatabase/serverless');

        const pool = new Pool({ connectionString: dbUrl });
        _neonSql = async (sqlStr: string, params: unknown[] = []): Promise<PgResult> => {
            const result = await pool.query(sqlStr, params);
            return { rows: result.rows as Record<string, unknown>[], rowCount: result.rows.length };
        };
        console.log(`🐘 NeonHttpProvider connected to: ${dbUrl.substring(0, 40)}...`);
        return _neonSql;
    } catch (e) {
        throw new Error(
            '[NeonHttpProvider] Failed to initialize. Ensure @neondatabase/serverless is installed.\n' +
            `Error: ${e}`
        );
    }
}

// =============================================================================
// PG Migration Statements (frontbase_edge schema)
// =============================================================================

const PG_MIGRATIONS = [
    // Schema creation
    `CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`,

    // Published pages
    `CREATE TABLE IF NOT EXISTS ${SCHEMA}.published_pages (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        title TEXT,
        description TEXT,
        layout_data TEXT NOT NULL,
        seo_data TEXT,
        datasources TEXT,
        css_bundle TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        published_at TEXT NOT NULL,
        is_public BOOLEAN NOT NULL DEFAULT TRUE,
        is_homepage BOOLEAN NOT NULL DEFAULT FALSE,
        content_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // Project settings
    `CREATE TABLE IF NOT EXISTS ${SCHEMA}.project_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        favicon_url TEXT,
        logo_url TEXT,
        site_name TEXT,
        site_description TEXT,
        app_url TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // Workflows
    `CREATE TABLE IF NOT EXISTS ${SCHEMA}.workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        trigger_type TEXT NOT NULL,
        trigger_config TEXT,
        nodes TEXT NOT NULL,
        edges TEXT NOT NULL,
        settings TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_by TEXT
    )`,

    // Executions
    `CREATE TABLE IF NOT EXISTS ${SCHEMA}.executions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        status TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_payload TEXT,
        node_executions TEXT,
        result TEXT,
        error TEXT,
        usage REAL DEFAULT 0,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ
    )`,

    // Edge logs
    `CREATE TABLE IF NOT EXISTS ${SCHEMA}.edge_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        source TEXT DEFAULT 'runtime',
        metadata TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // Dead letters
    `CREATE TABLE IF NOT EXISTS ${SCHEMA}.dead_letters (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        execution_id TEXT NOT NULL,
        error TEXT,
        payload TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
];

// =============================================================================
// Provider Implementation
// =============================================================================

export class NeonHttpProvider implements IStateProvider {
    private async query(sqlStr: string, params: unknown[] = []): Promise<PgResult> {
        const client = await getNeonClient();
        return client(sqlStr, params);
    }

    private async get<T = Record<string, unknown>>(
        sqlStr: string, params: unknown[] = [],
    ): Promise<T | null> {
        const result = await this.query(sqlStr, params);
        return (result.rows[0] as T) || null;
    }

    private async all<T = Record<string, unknown>>(
        sqlStr: string, params: unknown[] = [],
    ): Promise<T[]> {
        const result = await this.query(sqlStr, params);
        return result.rows as T[];
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    async init(): Promise<void> {
        for (const migration of PG_MIGRATIONS) {
            await this.query(migration);
        }
        console.log(`🐘 State DB initialized (PG via Neon HTTP) — schema: ${SCHEMA}`);
    }

    async initSettings(): Promise<void> {
        console.log('🐘 Project settings table initialized (PG)');
    }

    // =========================================================================
    // Pages CRUD
    // =========================================================================

    async upsertPage(page: PublishPage): Promise<{ success: boolean; version: number }> {
        if (page.isHomepage) {
            await this.query(`UPDATE ${SCHEMA}.published_pages SET is_homepage = FALSE WHERE is_homepage = TRUE`);
        }

        await this.query(
            `INSERT INTO ${SCHEMA}.published_pages (id, slug, name, title, description, layout_data, seo_data, datasources, css_bundle, version, published_at, is_public, is_homepage, content_hash, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             ON CONFLICT(id) DO UPDATE SET
               slug = EXCLUDED.slug, name = EXCLUDED.name, title = EXCLUDED.title,
               description = EXCLUDED.description, layout_data = EXCLUDED.layout_data,
               seo_data = EXCLUDED.seo_data, datasources = EXCLUDED.datasources,
               css_bundle = EXCLUDED.css_bundle, version = EXCLUDED.version,
               published_at = EXCLUDED.published_at, is_public = EXCLUDED.is_public,
               is_homepage = EXCLUDED.is_homepage, content_hash = EXCLUDED.content_hash,
               updated_at = EXCLUDED.updated_at`,
            [
                page.id, page.slug, page.name,
                page.title || null, page.description || null,
                JSON.stringify(page.layoutData),
                page.seoData ? JSON.stringify(page.seoData) : null,
                page.datasources ? JSON.stringify(page.datasources) : null,
                page.cssBundle || null,
                page.version, page.publishedAt,
                page.isPublic, page.isHomepage,
                page.contentHash || null,
                new Date().toISOString(),
            ]
        );

        console.log(`🐘 Upserted page (PG): ${page.slug} (v${page.version})`);
        return { success: true, version: page.version };
    }

    private rowToPage(row: Record<string, unknown>): PublishPage {
        return {
            id: row.id as string,
            slug: row.slug as string,
            name: row.name as string,
            title: (row.title as string) || undefined,
            description: (row.description as string) || undefined,
            layoutData: JSON.parse(row.layout_data as string) as PageLayout,
            seoData: row.seo_data ? JSON.parse(row.seo_data as string) as SeoData : undefined,
            datasources: row.datasources ? JSON.parse(row.datasources as string) as DatasourceConfig[] : undefined,
            cssBundle: (row.css_bundle as string) || undefined,
            version: row.version as number,
            publishedAt: row.published_at as string,
            isPublic: !!(row.is_public),
            isHomepage: !!(row.is_homepage),
        };
    }

    async getPageBySlug(slug: string): Promise<PublishPage | null> {
        const row = await this.get(`SELECT * FROM ${SCHEMA}.published_pages WHERE slug = $1`, [slug]);
        return row ? this.rowToPage(row) : null;
    }

    async getHomepage(): Promise<PublishPage | null> {
        const row = await this.get(`SELECT * FROM ${SCHEMA}.published_pages WHERE is_homepage = TRUE`);
        return row ? this.rowToPage(row) : null;
    }

    async deletePage(slug: string): Promise<boolean> {
        await this.query(`DELETE FROM ${SCHEMA}.published_pages WHERE slug = $1`, [slug]);
        return true;
    }

    async listPages(): Promise<PublishedPageSummary[]> {
        return this.all<PublishedPageSummary>(
            `SELECT slug, name, version FROM ${SCHEMA}.published_pages`
        );
    }

    // =========================================================================
    // Project Settings
    // =========================================================================

    async getProjectSettings(): Promise<ProjectSettingsData> {
        const row = await this.get(`SELECT * FROM ${SCHEMA}.project_settings WHERE id = 'default'`);
        if (!row) {
            return {
                id: 'default', faviconUrl: null, logoUrl: null,
                siteName: null, siteDescription: null, appUrl: null,
                updatedAt: new Date().toISOString(),
            };
        }
        return {
            id: row.id as string,
            faviconUrl: (row.favicon_url as string) || null,
            logoUrl: (row.logo_url as string) || null,
            siteName: (row.site_name as string) || null,
            siteDescription: (row.site_description as string) || null,
            appUrl: (row.app_url as string) || null,
            updatedAt: row.updated_at as string,
        };
    }

    async getFaviconUrl(): Promise<string> {
        return (await this.getProjectSettings()).faviconUrl || DEFAULT_FAVICON;
    }

    async updateProjectSettings(
        updates: Partial<Omit<ProjectSettingsData, 'id' | 'updatedAt'>>
    ): Promise<ProjectSettingsData> {
        const existing = await this.get(`SELECT id FROM ${SCHEMA}.project_settings WHERE id = 'default'`);
        const now = new Date().toISOString();

        if (existing) {
            const setClauses: string[] = [`updated_at = $1`];
            const params: unknown[] = [now];
            let idx = 2;
            if (updates.faviconUrl !== undefined) { setClauses.push(`favicon_url = $${idx}`); params.push(updates.faviconUrl); idx++; }
            if (updates.logoUrl !== undefined) { setClauses.push(`logo_url = $${idx}`); params.push(updates.logoUrl); idx++; }
            if (updates.siteName !== undefined) { setClauses.push(`site_name = $${idx}`); params.push(updates.siteName); idx++; }
            if (updates.siteDescription !== undefined) { setClauses.push(`site_description = $${idx}`); params.push(updates.siteDescription); idx++; }
            if (updates.appUrl !== undefined) { setClauses.push(`app_url = $${idx}`); params.push(updates.appUrl); idx++; }
            await this.query(`UPDATE ${SCHEMA}.project_settings SET ${setClauses.join(', ')} WHERE id = 'default'`, params);
        } else {
            await this.query(
                `INSERT INTO ${SCHEMA}.project_settings (id, favicon_url, logo_url, site_name, site_description, app_url, updated_at) VALUES ('default', $1, $2, $3, $4, $5, $6)`,
                [updates.faviconUrl || null, updates.logoUrl || null, updates.siteName || null, updates.siteDescription || null, updates.appUrl || null, now]
            );
        }
        return this.getProjectSettings();
    }

    // =========================================================================
    // Workflows
    // =========================================================================

    async upsertWorkflow(workflow: WorkflowData): Promise<{ version: number }> {
        const existing = await this.get<{ version: number }>(
            `SELECT version FROM ${SCHEMA}.workflows WHERE id = $1`, [workflow.id]
        );
        const now = new Date().toISOString();

        if (existing) {
            const newVersion = (existing.version || 1) + 1;
            await this.query(
                `UPDATE ${SCHEMA}.workflows SET name=$1, description=$2, trigger_type=$3, trigger_config=$4, nodes=$5, edges=$6, settings=$7, version=$8, updated_at=$9, published_by=$10 WHERE id=$11`,
                [workflow.name, workflow.description, workflow.triggerType, workflow.triggerConfig, workflow.nodes, workflow.edges, workflow.settings || null, newVersion, now, workflow.publishedBy, workflow.id]
            );
            return { version: newVersion };
        } else {
            await this.query(
                `INSERT INTO ${SCHEMA}.workflows (id, name, description, trigger_type, trigger_config, nodes, edges, settings, version, is_active, created_at, updated_at, published_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, TRUE, $9, $9, $10)`,
                [workflow.id, workflow.name, workflow.description, workflow.triggerType, workflow.triggerConfig, workflow.nodes, workflow.edges, workflow.settings || null, now, workflow.publishedBy]
            );
            return { version: 1 };
        }
    }

    async getWorkflowById(id: string): Promise<WorkflowData | null> {
        const row = await this.get(`SELECT * FROM ${SCHEMA}.workflows WHERE id = $1`, [id]);
        return row ? this.rowToWorkflow(row) : null;
    }

    async getActiveWebhookWorkflow(id: string): Promise<WorkflowData | null> {
        const row = await this.get(
            `SELECT * FROM ${SCHEMA}.workflows WHERE id = $1 AND is_active = TRUE`, [id]
        );
        return row ? this.rowToWorkflow(row) : null;
    }

    private rowToWorkflow(row: Record<string, unknown>): WorkflowData {
        return {
            id: row.id as string, name: row.name as string,
            description: (row.description as string) || null,
            triggerType: row.trigger_type as string,
            triggerConfig: (row.trigger_config as string) || null,
            nodes: row.nodes as string, edges: row.edges as string,
            settings: (row.settings as string) || null,
            version: row.version as number,
            isActive: !!(row.is_active),
            createdAt: row.created_at as string,
            updatedAt: row.updated_at as string,
            publishedBy: (row.published_by as string) || null,
        };
    }

    async listWorkflows(): Promise<WorkflowData[]> {
        const rows = await this.all(`SELECT * FROM ${SCHEMA}.workflows`);
        return rows.map(r => this.rowToWorkflow(r));
    }

    async deleteWorkflow(id: string): Promise<boolean> {
        await this.query(`DELETE FROM ${SCHEMA}.workflows WHERE id = $1`, [id]);
        return true;
    }

    async toggleWorkflow(id: string, isActive: boolean): Promise<void> {
        await this.query(
            `UPDATE ${SCHEMA}.workflows SET is_active = $1, updated_at = $2 WHERE id = $3`,
            [isActive, new Date().toISOString(), id]
        );
    }

    async createExecution(execution: NewExecutionData): Promise<void> {
        await this.query(
            `INSERT INTO ${SCHEMA}.executions (id, workflow_id, status, trigger_type, trigger_payload, node_executions, started_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [execution.id, execution.workflowId, execution.status, execution.triggerType, execution.triggerPayload || null, execution.nodeExecutions || null, execution.startedAt]
        );
    }

    async getExecutionById(id: string): Promise<ExecutionData | null> {
        const row = await this.get(`SELECT * FROM ${SCHEMA}.executions WHERE id = $1`, [id]);
        return row ? this.rowToExecution(row) : null;
    }

    async updateExecution(id: string, updates: Partial<ExecutionData>): Promise<void> {
        const setClauses: string[] = [];
        const params: unknown[] = [];
        let idx = 1;
        if (updates.status !== undefined) { setClauses.push(`status = $${idx}`); params.push(updates.status); idx++; }
        if (updates.result !== undefined) { setClauses.push(`result = $${idx}`); params.push(updates.result); idx++; }
        if (updates.error !== undefined) { setClauses.push(`error = $${idx}`); params.push(updates.error); idx++; }
        if (updates.nodeExecutions !== undefined) { setClauses.push(`node_executions = $${idx}`); params.push(updates.nodeExecutions); idx++; }
        if (updates.usage !== undefined) { setClauses.push(`usage = $${idx}`); params.push(updates.usage); idx++; }
        if (updates.endedAt !== undefined) { setClauses.push(`ended_at = $${idx}`); params.push(updates.endedAt); idx++; }

        if (setClauses.length > 0) {
            params.push(id);
            await this.query(`UPDATE ${SCHEMA}.executions SET ${setClauses.join(', ')} WHERE id = $${idx}`, params);
        }
    }

    async listExecutionsByWorkflow(workflowId: string, limit: number = 20): Promise<ExecutionData[]> {
        const rows = await this.all(
            `SELECT * FROM ${SCHEMA}.executions WHERE workflow_id = $1 ORDER BY started_at DESC LIMIT $2`,
            [workflowId, limit]
        );
        return rows.map(r => this.rowToExecution(r));
    }

    async listAllExecutions(filters?: {
        limit?: number; status?: string[]; workflowId?: string; since?: string; until?: string;
    }): Promise<ExecutionData[]> {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let idx = 1;
        if (filters?.workflowId) { conditions.push(`workflow_id = $${idx}`); params.push(filters.workflowId); idx++; }
        if (filters?.since) { conditions.push(`started_at >= $${idx}`); params.push(filters.since); idx++; }
        if (filters?.until) { conditions.push(`started_at <= $${idx}`); params.push(filters.until); idx++; }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(filters?.limit || 100);
        let rows = await this.all(
            `SELECT * FROM ${SCHEMA}.executions ${where} ORDER BY started_at DESC LIMIT $${idx}`, params
        );

        if (filters?.status && filters.status.length > 0) {
            rows = rows.filter((r: any) => filters.status!.includes(r.status as string));
        }
        return rows.map(r => this.rowToExecution(r));
    }

    async getExecutionStats(): Promise<ExecutionStats[]> {
        const rows = await this.all(`SELECT * FROM ${SCHEMA}.executions`);
        const statsMap = new Map<string, ExecutionStats>();

        for (const exec of rows) {
            const wid = exec.workflow_id as string;
            const current = statsMap.get(wid) || { workflowId: wid, totalRuns: 0, successfulRuns: 0, failedRuns: 0 };
            current.totalRuns++;
            if (exec.status === 'completed') current.successfulRuns++;
            else if (exec.status === 'error') current.failedRuns++;
            statsMap.set(wid, current);
        }
        return Array.from(statsMap.values());
    }

    private rowToExecution(row: Record<string, unknown>): ExecutionData {
        return {
            id: row.id as string, workflowId: row.workflow_id as string,
            status: row.status as string, triggerType: row.trigger_type as string,
            triggerPayload: (row.trigger_payload as string) || null,
            nodeExecutions: (row.node_executions as string) || null,
            result: (row.result as string) || null, error: (row.error as string) || null,
            usage: (row.usage as number) || null, startedAt: row.started_at as string,
            endedAt: (row.ended_at as string) || null,
        };
    }

    // =========================================================================
    // Dead Letter Queue
    // =========================================================================

    async createDeadLetter(deadLetter: DeadLetterData): Promise<void> {
        await this.query(
            `INSERT INTO ${SCHEMA}.dead_letters (id, workflow_id, execution_id, error, payload, retry_count) VALUES ($1, $2, $3, $4, $5, $6)`,
            [deadLetter.id, deadLetter.workflowId, deadLetter.executionId, deadLetter.error, deadLetter.payload, deadLetter.retryCount || 0]
        );
    }
}
