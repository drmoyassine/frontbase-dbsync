/**
 * CfD1HttpProvider — Cloudflare D1 via HTTP REST API
 * 
 * Used when a CF D1 database is connected to a non-CF edge engine
 * (e.g., Vercel, Netlify, Docker). The CF D1 HTTP API is used instead
 * of native D1 bindings.
 * 
 * D1 is SQLite-compatible, so the same Drizzle SQLite schema is used.
 * Queries are sent as raw SQL strings via the D1 REST API.
 * 
 * Env vars:
 * - FRONTBASE_STATE_DB_URL: "d1://<database-uuid>"
 * - FRONTBASE_CF_API_TOKEN: Scoped CF API token (D1 read+write)
 * - FRONTBASE_CF_ACCOUNT_ID: CF account ID
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — no calls to FastAPI at runtime.
 */

import type { PublishPage, PageLayout, SeoData, DatasourceConfig } from '../schemas/publish';
import type {
    IStateProvider, ProjectSettingsData, PublishedPageSummary,
    WorkflowData, ExecutionData, NewExecutionData, ExecutionStats, DeadLetterData,
    AgentToolData,
} from './IStateProvider';
import { isMultiTenantSlug } from './IStateProvider';
import { runMigrations } from './edge-migrations';

const DEFAULT_FAVICON = '/static/icon.png';

// =============================================================================
// CF D1 HTTP API Client
// =============================================================================

interface D1Result {
    results: Record<string, unknown>[];
    success: boolean;
    meta?: { changes?: number; last_row_id?: number; rows_read?: number };
}

/**
 * Execute SQL against CF D1 via the HTTP REST API.
 * POST /accounts/{account_id}/d1/database/{database_id}/query
 */
async function d1Query(
    accountId: string,
    databaseId: string,
    apiToken: string,
    sqlStr: string,
    params: unknown[] = [],
): Promise<D1Result> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    let resp: Response;
    try {
        resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sql: sqlStr, params }),
            signal: controller.signal as any, // Cast for cross-compat
        });
    } catch (e: any) {
        if (e.name === 'AbortError') {
            throw new Error(`D1 HTTP API error: Connection timed out after 10s.`);
        }
        throw e;
    } finally {
        clearTimeout(timeout);
    }

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`D1 HTTP API error (${resp.status}): ${text.substring(0, 300)}`);
    }

    const data = await resp.json() as any;
    // D1 API returns { result: [{ results: [...], success: true, meta: {...} }] }
    const firstResult = data?.result?.[0];
    if (!firstResult?.success) {
        throw new Error(`D1 query failed: ${JSON.stringify(data?.errors || data)}`);
    }
    return firstResult as D1Result;
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class CfD1HttpProvider implements IStateProvider {
    private accountId: string = '';
    private databaseId: string = '';
    private apiToken: string = '';

    private ensureConfig(): void {
        if (this.accountId) return;

        const { getStateDbConfig } = require('../config/env.js');
        const cfg = getStateDbConfig();
        const dbUrl = cfg.url || '';
        this.apiToken = cfg.cfApiToken || '';
        this.accountId = cfg.cfAccountId || '';

        // Parse d1://<uuid> → extract database UUID
        if (dbUrl.startsWith('d1://')) {
            this.databaseId = dbUrl.replace('d1://', '');
        } else {
            this.databaseId = dbUrl;
        }

        if (!this.databaseId || !this.apiToken || !this.accountId) {
            throw new Error(
                '[CfD1HttpProvider] Missing config. Required in FRONTBASE_STATE_DB: ' +
                'url (d1://UUID), cfApiToken, cfAccountId'
            );
        }

        console.log(`🔶 CfD1HttpProvider configured: D1 ${this.databaseId.substring(0, 8)}...`);
    }

    private async run(sqlStr: string, params: unknown[] = []): Promise<D1Result> {
        this.ensureConfig();
        return d1Query(this.accountId, this.databaseId, this.apiToken, sqlStr, params);
    }

    private async get<T = Record<string, unknown>>(
        sqlStr: string, params: unknown[] = [],
    ): Promise<T | null> {
        const result = await this.run(sqlStr, params);
        return (result.results?.[0] as T) || null;
    }

    private async all<T = Record<string, unknown>>(
        sqlStr: string, params: unknown[] = [],
    ): Promise<T[]> {
        const result = await this.run(sqlStr, params);
        return (result.results || []) as T[];
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    async init(): Promise<void> {
        await runMigrations(
            async (sqlStr) => { await this.run(sqlStr); },
            'CF D1 (HTTP)'
        );
        console.log('🔶 State DB initialized (CF D1 via HTTP)');
    }

    async initSettings(): Promise<void> {
        console.log('🔶 Project settings table initialized (CF D1)');
    }

    // =========================================================================
    // Pages CRUD
    // =========================================================================

    async upsertPage(page: PublishPage): Promise<{ success: boolean; version: number }> {
        const tenantSlug = (page as any).tenantSlug || '_default';
        // Enforce homepage uniqueness (scoped only on community engines)
        if (page.isHomepage) {
            if (isMultiTenantSlug(tenantSlug)) {
                await this.run(
                    `UPDATE published_pages SET is_homepage = 0 WHERE is_homepage = 1 AND tenant_slug = ?1`,
                    [tenantSlug]
                );
            } else {
                await this.run(
                    `UPDATE published_pages SET is_homepage = 0 WHERE is_homepage = 1`
                );
            }
        }

        await this.run(
            `INSERT INTO published_pages (id, slug, tenant_slug, name, title, description, layout_data, seo_data, datasources, css_bundle, version, published_at, is_public, is_homepage, content_hash, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
             ON CONFLICT(id) DO UPDATE SET
               slug = excluded.slug, tenant_slug = excluded.tenant_slug, name = excluded.name,
               title = excluded.title, description = excluded.description,
               layout_data = excluded.layout_data, seo_data = excluded.seo_data,
               datasources = excluded.datasources, css_bundle = excluded.css_bundle,
               version = excluded.version, published_at = excluded.published_at,
               is_public = excluded.is_public, is_homepage = excluded.is_homepage,
               content_hash = excluded.content_hash, updated_at = excluded.updated_at`,
            [
                page.id, page.slug, tenantSlug, page.name,
                page.title || null, page.description || null,
                JSON.stringify(page.layoutData),
                page.seoData ? JSON.stringify(page.seoData) : null,
                page.datasources ? JSON.stringify(page.datasources) : null,
                page.cssBundle || null,
                page.version, page.publishedAt,
                page.isPublic ? 1 : 0, page.isHomepage ? 1 : 0,
                page.contentHash || null,
                new Date().toISOString(),
            ]
        );

        console.log(`🔶 Upserted page (D1): ${tenantSlug}/${page.slug} (v${page.version})`);
        return { success: true, version: page.version };
    }

    private rowToPage(row: Record<string, unknown>): PublishPage {
        return {
            id: row.id as string,
            slug: row.slug as string,
            tenantSlug: (row.tenant_slug as string) || '_default',
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

    async getPageBySlug(slug: string, tenantSlug?: string): Promise<PublishPage | null> {
        const where = isMultiTenantSlug(tenantSlug)
            ? `WHERE slug = ?1 AND tenant_slug = ?2`
            : `WHERE slug = ?1`;
        const params = isMultiTenantSlug(tenantSlug) ? [slug, tenantSlug] : [slug];
        const row = await this.get(`SELECT * FROM published_pages ${where}`, params);
        return row ? this.rowToPage(row) : null;
    }

    async tenantExists(tenantSlug: string): Promise<boolean> {
        if (!isMultiTenantSlug(tenantSlug)) return true;
        const row = await this.get(`SELECT id FROM published_pages WHERE tenant_slug = ?1 LIMIT 1`, [tenantSlug]);
        return !!row;
    }

    async getHomepage(tenantSlug?: string): Promise<PublishPage | null> {
        const where = isMultiTenantSlug(tenantSlug)
            ? `WHERE is_homepage = 1 AND tenant_slug = ?1`
            : `WHERE is_homepage = 1`;
        const params = isMultiTenantSlug(tenantSlug) ? [tenantSlug] : [];
        const row = await this.get(`SELECT * FROM published_pages ${where}`, params);
        return row ? this.rowToPage(row) : null;
    }

    async deletePage(slug: string, tenantSlug?: string): Promise<boolean> {
        const where = isMultiTenantSlug(tenantSlug)
            ? `WHERE slug = ?1 AND tenant_slug = ?2`
            : `WHERE slug = ?1`;
        const params = isMultiTenantSlug(tenantSlug) ? [slug, tenantSlug] : [slug];
        await this.run(`DELETE FROM published_pages ${where}`, params);
        return true;
    }

    async listPages(tenantSlug?: string): Promise<PublishedPageSummary[]> {
        const where = isMultiTenantSlug(tenantSlug) ? `WHERE tenant_slug = ?1` : '';
        const params = isMultiTenantSlug(tenantSlug) ? [tenantSlug] : [];
        const rows = await this.all<{ id: string; slug: string; name: string; version: number }>(
            `SELECT id, slug, name, version FROM published_pages ${where}`, params
        );
        return rows;
    }

    async listPublicPageSlugs(tenantSlug?: string): Promise<{ slug: string; updatedAt: string; isHomepage: boolean }[]> {
        const conditions = ['is_public = 1'];
        const params: unknown[] = [];
        if (isMultiTenantSlug(tenantSlug)) { conditions.push(`tenant_slug = ?1`); params.push(tenantSlug); }
        const where = `WHERE ${conditions.join(' AND ')}`;
        const rows = await this.all<{ slug: string; updated_at: string; is_homepage: number }>(
            `SELECT slug, updated_at, is_homepage FROM published_pages ${where}`, params
        );
        return rows.map(r => ({
            slug: r.slug,
            updatedAt: r.updated_at,
            isHomepage: !!r.is_homepage,
        }));
    }

    // =========================================================================
    // Project Settings
    // =========================================================================

    async getProjectSettings(): Promise<ProjectSettingsData> {
        const row = await this.get(
            `SELECT * FROM project_settings WHERE id = 'default'`
        );
        if (!row) {
            return {
                id: 'default', faviconUrl: null, logoUrl: null,
                siteName: null, siteDescription: null, appUrl: null,
                authForms: null,
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
            authForms: (row.auth_forms as string) || null,
            updatedAt: row.updated_at as string,
        };
    }

    async getFaviconUrl(): Promise<string> {
        const settings = await this.getProjectSettings();
        return settings.faviconUrl || DEFAULT_FAVICON;
    }

    async updateProjectSettings(
        updates: Partial<Omit<ProjectSettingsData, 'id' | 'updatedAt'>>
    ): Promise<ProjectSettingsData> {
        const existing = await this.get(`SELECT id FROM project_settings WHERE id = 'default'`);
        const now = new Date().toISOString();

        if (existing) {
            const setClauses: string[] = [`updated_at = ?1`];
            const params: unknown[] = [now];
            let idx = 2;
            if (updates.faviconUrl !== undefined) { setClauses.push(`favicon_url = ?${idx}`); params.push(updates.faviconUrl); idx++; }
            if (updates.logoUrl !== undefined) { setClauses.push(`logo_url = ?${idx}`); params.push(updates.logoUrl); idx++; }
            if (updates.siteName !== undefined) { setClauses.push(`site_name = ?${idx}`); params.push(updates.siteName); idx++; }
            if (updates.siteDescription !== undefined) { setClauses.push(`site_description = ?${idx}`); params.push(updates.siteDescription); idx++; }
            if (updates.appUrl !== undefined) { setClauses.push(`app_url = ?${idx}`); params.push(updates.appUrl); idx++; }
            if (updates.authForms !== undefined) { setClauses.push(`auth_forms = ?${idx}`); params.push(updates.authForms); idx++; }
            await this.run(`UPDATE project_settings SET ${setClauses.join(', ')} WHERE id = 'default'`, params);
        } else {
            await this.run(
                `INSERT INTO project_settings (id, favicon_url, logo_url, site_name, site_description, app_url, auth_forms, updated_at) VALUES ('default', ?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
                [updates.faviconUrl || null, updates.logoUrl || null, updates.siteName || null, updates.siteDescription || null, updates.appUrl || null, updates.authForms || null, now]
            );
        }
        return this.getProjectSettings();
    }

    // =========================================================================
    // Workflows
    // =========================================================================

    async upsertWorkflow(workflow: WorkflowData): Promise<{ version: number }> {
        const tenantSlug = workflow.tenantSlug || '_default';
        const existing = await this.get<{ version: number }>(
            `SELECT version FROM workflows WHERE id = ?1`, [workflow.id]
        );
        const now = new Date().toISOString();

        if (existing) {
            const newVersion = (existing.version || 1) + 1;
            await this.run(
                `UPDATE workflows SET name=?1, description=?2, trigger_type=?3, trigger_config=?4, nodes=?5, edges=?6, settings=?7, version=?8, updated_at=?9, published_by=?10, tenant_slug=?11 WHERE id=?12`,
                [workflow.name, workflow.description, workflow.triggerType, workflow.triggerConfig, workflow.nodes, workflow.edges, workflow.settings || null, newVersion, now, workflow.publishedBy, tenantSlug, workflow.id]
            );
            return { version: newVersion };
        } else {
            await this.run(
                `INSERT INTO workflows (id, name, description, trigger_type, trigger_config, nodes, edges, settings, version, is_active, created_at, updated_at, published_by, tenant_slug) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, 1, ?9, ?9, ?10, ?11)`,
                [workflow.id, workflow.name, workflow.description, workflow.triggerType, workflow.triggerConfig, workflow.nodes, workflow.edges, workflow.settings || null, now, workflow.publishedBy, tenantSlug]
            );
            return { version: 1 };
        }
    }

    async getWorkflowById(id: string, tenantSlug?: string): Promise<WorkflowData | null> {
        const where = isMultiTenantSlug(tenantSlug)
            ? `WHERE id = ?1 AND tenant_slug = ?2`
            : `WHERE id = ?1`;
        const params = isMultiTenantSlug(tenantSlug) ? [id, tenantSlug] : [id];
        const row = await this.get(`SELECT * FROM workflows ${where}`, params);
        return row ? this.rowToWorkflow(row) : null;
    }

    async getActiveWebhookWorkflow(id: string, tenantSlug?: string): Promise<WorkflowData | null> {
        const where = isMultiTenantSlug(tenantSlug)
            ? `WHERE id = ?1 AND is_active = 1 AND tenant_slug = ?2`
            : `WHERE id = ?1 AND is_active = 1`;
        const params = isMultiTenantSlug(tenantSlug) ? [id, tenantSlug] : [id];
        const row = await this.get(`SELECT * FROM workflows ${where}`, params);
        return row ? this.rowToWorkflow(row) : null;
    }

    private rowToWorkflow(row: Record<string, unknown>): WorkflowData {
        return {
            id: row.id as string,
            name: row.name as string,
            description: (row.description as string) || null,
            triggerType: row.trigger_type as string,
            triggerConfig: (row.trigger_config as string) || null,
            nodes: row.nodes as string,
            edges: row.edges as string,
            settings: (row.settings as string) || null,
            version: row.version as number,
            isActive: !!(row.is_active),
            createdAt: row.created_at as string,
            updatedAt: row.updated_at as string,
            publishedBy: (row.published_by as string) || null,
            tenantSlug: (row.tenant_slug as string) || '_default',
        };
    }

    async listWorkflows(tenantSlug?: string): Promise<WorkflowData[]> {
        const where = isMultiTenantSlug(tenantSlug) ? `WHERE tenant_slug = ?1` : '';
        const params = isMultiTenantSlug(tenantSlug) ? [tenantSlug] : [];
        const rows = await this.all(`SELECT * FROM workflows ${where}`, params);
        return rows.map(r => this.rowToWorkflow(r));
    }

    async deleteWorkflow(id: string, tenantSlug?: string): Promise<boolean> {
        const where = isMultiTenantSlug(tenantSlug)
            ? `WHERE id = ?1 AND tenant_slug = ?2`
            : `WHERE id = ?1`;
        const params = isMultiTenantSlug(tenantSlug) ? [id, tenantSlug] : [id];
        await this.run(`DELETE FROM workflows ${where}`, params);
        return true;
    }

    async toggleWorkflow(id: string, isActive: boolean, tenantSlug?: string): Promise<void> {
        const where = isMultiTenantSlug(tenantSlug)
            ? `WHERE id = ?3 AND tenant_slug = ?4`
            : `WHERE id = ?3`;
        const params = isMultiTenantSlug(tenantSlug) ? [isActive ? 1 : 0, new Date().toISOString(), id, tenantSlug] : [isActive ? 1 : 0, new Date().toISOString(), id];
        await this.run(
            `UPDATE workflows SET is_active = ?1, updated_at = ?2 ${where}`,
            params
        );
    }

    // =========================================================================
    // Executions
    // =========================================================================

    async createExecution(execution: NewExecutionData): Promise<void> {
        await this.run(
            `INSERT INTO executions (id, workflow_id, status, trigger_type, trigger_payload, node_executions, started_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
            [execution.id, execution.workflowId, execution.status, execution.triggerType, execution.triggerPayload || null, execution.nodeExecutions || null, execution.startedAt]
        );
    }

    async getExecutionById(id: string): Promise<ExecutionData | null> {
        const row = await this.get(`SELECT * FROM executions WHERE id = ?1`, [id]);
        return row ? this.rowToExecution(row) : null;
    }

    async updateExecution(id: string, updates: Partial<ExecutionData>): Promise<void> {
        const setClauses: string[] = [];
        const params: unknown[] = [];
        let idx = 1;
        if (updates.status !== undefined) { setClauses.push(`status = ?${idx}`); params.push(updates.status); idx++; }
        if (updates.result !== undefined) { setClauses.push(`result = ?${idx}`); params.push(updates.result); idx++; }
        if (updates.error !== undefined) { setClauses.push(`error = ?${idx}`); params.push(updates.error); idx++; }
        if (updates.nodeExecutions !== undefined) { setClauses.push(`node_executions = ?${idx}`); params.push(updates.nodeExecutions); idx++; }
        if (updates.usage !== undefined) { setClauses.push(`usage = ?${idx}`); params.push(updates.usage); idx++; }
        if (updates.endedAt !== undefined) { setClauses.push(`ended_at = ?${idx}`); params.push(updates.endedAt); idx++; }

        if (setClauses.length > 0) {
            params.push(id);
            await this.run(`UPDATE executions SET ${setClauses.join(', ')} WHERE id = ?${idx}`, params);
        }
    }

    async listExecutionsByWorkflow(workflowId: string, limit: number = 20): Promise<ExecutionData[]> {
        const rows = await this.all(
            `SELECT * FROM executions WHERE workflow_id = ?1 ORDER BY started_at DESC LIMIT ?2`,
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

        if (filters?.workflowId) { conditions.push(`workflow_id = ?${idx}`); params.push(filters.workflowId); idx++; }
        if (filters?.since) { conditions.push(`started_at >= ?${idx}`); params.push(filters.since); idx++; }
        if (filters?.until) { conditions.push(`started_at <= ?${idx}`); params.push(filters.until); idx++; }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(filters?.limit || 100);
        let rows = await this.all(
            `SELECT * FROM executions ${where} ORDER BY started_at DESC LIMIT ?${idx}`, params
        );

        if (filters?.status && filters.status.length > 0) {
            rows = rows.filter((r: any) => filters.status!.includes(r.status as string));
        }
        return rows.map(r => this.rowToExecution(r));
    }

    async getExecutionStats(): Promise<ExecutionStats[]> {
        const rows = await this.all(`SELECT * FROM executions`);
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
            id: row.id as string,
            workflowId: row.workflow_id as string,
            status: row.status as string,
            triggerType: row.trigger_type as string,
            triggerPayload: (row.trigger_payload as string) || null,
            nodeExecutions: (row.node_executions as string) || null,
            result: (row.result as string) || null,
            error: (row.error as string) || null,
            usage: (row.usage as number) || null,
            startedAt: row.started_at as string,
            endedAt: (row.ended_at as string) || null,
        };
    }

    // =========================================================================
    // Dead Letter Queue
    // =========================================================================

    async createDeadLetter(deadLetter: DeadLetterData): Promise<void> {
        await this.run(
            `INSERT INTO dead_letters (id, workflow_id, execution_id, error, payload, retry_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
            [deadLetter.id, deadLetter.workflowId, deadLetter.executionId, deadLetter.error, deadLetter.payload, deadLetter.retryCount || 0]
        );
    }

    // =========================================================================
    // Agent Tools
    // =========================================================================

    async listAgentTools(profileSlug: string, includeInactive: boolean = false): Promise<AgentToolData[]> {
        const where = includeInactive
            ? `WHERE profile_slug = ?1`
            : `WHERE profile_slug = ?1 AND is_active = 1`;
        const rows = await this.all(
            `SELECT * FROM agent_tools ${where}`, [profileSlug]
        );
        return rows.map((r: any) => ({
            id: r.id, profileSlug: r.profile_slug, type: r.type,
            name: r.name, description: r.description || null,
            config: r.config, isActive: !!r.is_active,
            createdAt: r.created_at, updatedAt: r.updated_at,
        } as AgentToolData));
    }

    async upsertAgentTool(tool: AgentToolData): Promise<void> {
        const now = new Date().toISOString();
        await this.run(
            `INSERT INTO agent_tools (id, profile_slug, type, name, description, config, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               profile_slug=excluded.profile_slug, type=excluded.type, name=excluded.name,
               description=excluded.description, config=excluded.config,
               is_active=excluded.is_active, updated_at=excluded.updated_at`,
            [tool.id, tool.profileSlug, tool.type, tool.name, tool.description,
             tool.config, tool.isActive ? 1 : 0, tool.createdAt || now, now]
        );
    }

    async deleteAgentTool(id: string): Promise<boolean> {
        await this.run(`DELETE FROM agent_tools WHERE id = ?1`, [id]);
        return true;
    }
}
