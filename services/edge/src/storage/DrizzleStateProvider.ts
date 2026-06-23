/**
 * DrizzleStateProvider — Shared base class for Drizzle ORM-based providers
 * 
 * Extracts all common CRUD logic for pages, settings, workflows, executions,
 * and dead letters. Subclasses only need to implement:
 *   - getDb(): returns a Drizzle instance
 *   - init(): runs migrations specific to their storage backend
 *   - initSettings(): optional post-migration hook
 * 
 * Providers using this base:
 *   - LocalSqliteProvider (local libsql file)
 *   - TursoHttpProvider (remote Turso over HTTP)
 * 
 * DRY: ~300 lines of identical CRUD code deduplicated.
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — no calls to FastAPI at runtime.
 */

import { sql, eq, and, desc, or, like } from 'drizzle-orm';
import type { PublishPage, PageLayout, SeoData, DatasourceConfig } from '../schemas/publish';
import type {
    IStateProvider, ProjectSettingsData, PublishedPageSummary,
    WorkflowData, ExecutionData, NewExecutionData, ExecutionStats, DeadLetterData,
    AgentToolData, WorkflowVersionData,
} from './IStateProvider';
import { isMultiTenantSlug } from './IStateProvider';
import { publishedPages, projectSettings, workflowsTable, executionsTable, agentToolsTable, type NewPublishedPage } from './schema';

/** Default favicon path (Frontbase logo) */
const DEFAULT_FAVICON = '/static/icon.png';

/** Map a raw workflow_draft_versions row to WorkflowVersionData. */
function rowToVersion(row: any): WorkflowVersionData {
    return {
        id: row.id,
        workflowId: row.workflow_id,
        version: row.version,
        name: row.name,
        description: row.description,
        triggerType: row.trigger_type,
        nodes: row.nodes,
        edges: row.edges,
        settings: row.settings,
        createdAt: row.created_at,
        createdBy: row.created_by,
        tenantSlug: row.tenant_slug,
    };
}

// =============================================================================
// Abstract Base (subclasses provide getDb())
// =============================================================================

export abstract class DrizzleStateProvider implements IStateProvider {
    /** Subclasses MUST override to return a Drizzle ORM instance. */
    protected abstract getDb(): any; // ReturnType<typeof drizzle> — kept as any to avoid import coupling

    abstract init(): Promise<void>;

    async initSettings(): Promise<void> {
        // Settings table is created by migration v1
    }

    // =========================================================================
    // Pages CRUD
    // =========================================================================

    async upsertPage(page: PublishPage): Promise<{ success: boolean; version: number }> {
        const database = this.getDb();
        const tenantSlug = (page as any).tenantSlug || '_default';
        const record: NewPublishedPage = {
            id: page.id, slug: page.slug, tenantSlug,
            name: page.name,
            title: page.title || null, description: page.description || null,
            layoutData: JSON.stringify(page.layoutData),
            seoData: page.seoData ? JSON.stringify(page.seoData) : null,
            datasources: page.datasources ? JSON.stringify(page.datasources) : null,
            cssBundle: page.cssBundle || null,
            version: page.version, publishedAt: page.publishedAt,
            isPublic: page.isPublic, isHomepage: page.isHomepage,
            contentHash: page.contentHash || null,
        };

        if (page.isHomepage) {
            // Only scope homepage reset to tenant on community engines
            const conditions = [eq(publishedPages.isHomepage, true)];
            if (isMultiTenantSlug(tenantSlug)) {
                conditions.push(eq(publishedPages.tenantSlug, tenantSlug));
            }
            await database.update(publishedPages)
                .set({ isHomepage: false })
                .where(and(...conditions));
        }

        await database.insert(publishedPages)
            .values(record)
            .onConflictDoUpdate({
                target: publishedPages.id,
                set: { ...record, updatedAt: new Date().toISOString() },
            });

        return { success: true, version: page.version };
    }

    async getPageBySlug(slug: string, tenantSlug?: string): Promise<PublishPage | null> {
        const conditions = [eq(publishedPages.slug, slug)];
        if (isMultiTenantSlug(tenantSlug)) conditions.push(eq(publishedPages.tenantSlug, tenantSlug));
        const record = await this.getDb().select()
            .from(publishedPages).where(and(...conditions)).get();
        return record ? this.recordToPage(record) : null;
    }

    async tenantExists(tenantSlug: string): Promise<boolean> {
        if (!isMultiTenantSlug(tenantSlug)) return true; // Single-tenant always "exists"
        const record = await this.getDb().select({ id: publishedPages.id })
            .from(publishedPages)
            .where(eq(publishedPages.tenantSlug, tenantSlug))
            .limit(1).get();
        return !!record;
    }

    async getHomepage(tenantSlug?: string): Promise<PublishPage | null> {
        const conditions = [eq(publishedPages.isHomepage, true)];
        if (isMultiTenantSlug(tenantSlug)) conditions.push(eq(publishedPages.tenantSlug, tenantSlug));
        const record = await this.getDb().select()
            .from(publishedPages).where(and(...conditions)).get();
        return record ? this.recordToPage(record) : null;
    }

    async deletePage(slug: string, tenantSlug?: string): Promise<boolean> {
        const conditions = [eq(publishedPages.slug, slug)];
        if (isMultiTenantSlug(tenantSlug)) conditions.push(eq(publishedPages.tenantSlug, tenantSlug));
        await this.getDb().delete(publishedPages).where(and(...conditions));
        return true;
    }

    async listPages(tenantSlug?: string): Promise<PublishedPageSummary[]> {
        let query = this.getDb().select({
            id: publishedPages.id, slug: publishedPages.slug, name: publishedPages.name, version: publishedPages.version,
        }).from(publishedPages);
        if (isMultiTenantSlug(tenantSlug)) query = query.where(eq(publishedPages.tenantSlug, tenantSlug));
        return await query;
    }

    async listPublicPageSlugs(tenantSlug?: string): Promise<{ slug: string; updatedAt: string; isHomepage: boolean }[]> {
        const conditions = [eq(publishedPages.isPublic, true)];
        if (isMultiTenantSlug(tenantSlug)) conditions.push(eq(publishedPages.tenantSlug, tenantSlug));
        return await this.getDb().select({
            slug: publishedPages.slug,
            updatedAt: publishedPages.updatedAt,
            isHomepage: publishedPages.isHomepage,
        }).from(publishedPages).where(and(...conditions));
    }

    private recordToPage(record: any): PublishPage {
        return {
            id: record.id, slug: record.slug,
            tenantSlug: record.tenantSlug || '_default',
            name: record.name,
            title: record.title || undefined, description: record.description || undefined,
            layoutData: JSON.parse(record.layoutData) as PageLayout,
            seoData: record.seoData ? JSON.parse(record.seoData) as SeoData : undefined,
            datasources: record.datasources ? JSON.parse(record.datasources) as DatasourceConfig[] : undefined,
            cssBundle: record.cssBundle || undefined,
            version: record.version, publishedAt: record.publishedAt,
            isPublic: record.isPublic, isHomepage: record.isHomepage,
        };
    }

    // =========================================================================
    // Datasource Authorization (V1)
    // =========================================================================

    async isDatasourceAuthorized(datasourceId: string, tenantSlug?: string): Promise<boolean> {
        if (!isMultiTenantSlug(tenantSlug)) {
            return true; // Single-tenant — all datasources are owned
        }
        const pages = await this.getDb().select({
            datasources: publishedPages.datasources
        }).from(publishedPages).where(eq(publishedPages.tenantSlug, tenantSlug));

        for (const page of pages) {
            if (!page.datasources) continue;
            try {
                const dsList = JSON.parse(page.datasources) as DatasourceConfig[];
                if (Array.isArray(dsList) && dsList.some(ds => ds.id === datasourceId)) {
                    return true;
                }
            } catch {
                // ignore JSON parse errors
            }
        }
        return false;
    }

    // =========================================================================
    // Project Settings (tenant-scoped)
    // =========================================================================

    async getProjectSettings(tenantSlug?: string): Promise<ProjectSettingsData> {
        const key = tenantSlug || 'default';
        const record = await this.getDb().select()
            .from(projectSettings).where(eq(projectSettings.id, key)).get();
        if (!record) {
            return {
                id: key, faviconUrl: null, logoUrl: null,
                siteName: null, siteDescription: null, appUrl: null,
                authForms: null,
                updatedAt: new Date().toISOString(),
            };
        }
        return record;
    }

    async getFaviconUrl(tenantSlug?: string): Promise<string> {
        return (await this.getProjectSettings(tenantSlug)).faviconUrl || DEFAULT_FAVICON;
    }

    async updateProjectSettings(
        updates: Partial<Omit<ProjectSettingsData, 'id' | 'updatedAt'>>,
        tenantSlug?: string
    ): Promise<ProjectSettingsData> {
        const database = this.getDb();
        const key = tenantSlug || 'default';
        const existing = await database.select()
            .from(projectSettings).where(eq(projectSettings.id, key)).get();

        if (existing) {
            await database.update(projectSettings)
                .set({ ...updates, updatedAt: new Date().toISOString() })
                .where(eq(projectSettings.id, key));
        } else {
            await database.insert(projectSettings).values({
                id: key, ...updates, updatedAt: new Date().toISOString(),
            });
        }
        return this.getProjectSettings(tenantSlug);
    }

    // =========================================================================
    // Workflows CRUD
    // =========================================================================

    async upsertWorkflow(workflow: WorkflowData): Promise<{ version: number }> {
        const database = this.getDb();
        const existing = await database.select()
            .from(workflowsTable).where(eq(workflowsTable.id, workflow.id)).get();
        const now = new Date().toISOString();

        if (existing) {
            const newVersion = (existing.version || 1) + 1;

            // Automations A6: snapshot the previous version before overwriting.
            try {
                await this.createWorkflowVersion({
                    id: `${existing.id}:v${existing.version}:${now}`,
                    workflowId: existing.id,
                    version: existing.version,
                    name: existing.name,
                    description: existing.description,
                    triggerType: existing.triggerType,
                    nodes: existing.nodes,
                    edges: existing.edges,
                    settings: existing.settings,
                    createdAt: now,
                    createdBy: existing.publishedBy,
                    tenantSlug: existing.tenantSlug || '_default',
                });

                // Prune old versions beyond the retention limit.
                const maxVersions = parseInt(process.env.WORKFLOW_VERSION_LIMIT || '50', 10);
                if (Number.isFinite(maxVersions) && maxVersions > 0) {
                    const all = await this.listWorkflowVersions(existing.id, maxVersions + 5, existing.tenantSlug || '_default');
                    for (const old of all.slice(maxVersions)) {
                        await this.deleteWorkflowVersion(old.id, existing.tenantSlug || '_default').catch(() => {});
                    }
                }
            } catch (snapError) {
                // Snapshot is best-effort — never block a deploy on it.
                console.warn('[DrizzleStateProvider] version snapshot failed:', snapError);
            }

            await database.update(workflowsTable)
                .set({
                    name: workflow.name, description: workflow.description,
                    triggerType: workflow.triggerType, triggerConfig: workflow.triggerConfig,
                    nodes: workflow.nodes, edges: workflow.edges,
                    settings: workflow.settings || null,
                    version: newVersion, updatedAt: now, publishedBy: workflow.publishedBy,
                    tenantSlug: workflow.tenantSlug || '_default',
                })
                .where(eq(workflowsTable.id, workflow.id));
            return { version: newVersion };
        } else {
            await database.insert(workflowsTable).values({
                id: workflow.id, name: workflow.name, description: workflow.description,
                triggerType: workflow.triggerType, triggerConfig: workflow.triggerConfig,
                nodes: workflow.nodes, edges: workflow.edges,
                settings: workflow.settings || null,
                version: 1, isActive: true, createdAt: now, updatedAt: now,
                publishedBy: workflow.publishedBy,
                tenantSlug: workflow.tenantSlug || '_default',
            });
            return { version: 1 };
        }
    }

    async getWorkflowById(id: string, tenantSlug?: string): Promise<WorkflowData | null> {
        const conditions = [eq(workflowsTable.id, id)];
        if (tenantSlug) conditions.push(eq(workflowsTable.tenantSlug, tenantSlug));
        
        const row = await this.getDb().select().from(workflowsTable)
            .where(and(...conditions)).get();
        return row ? { ...row, isActive: !!row.isActive } as WorkflowData : null;
    }

    async getActiveWebhookWorkflow(id: string, tenantSlug?: string): Promise<WorkflowData | null> {
        const conditions = [eq(workflowsTable.id, id), eq(workflowsTable.isActive, true)];
        if (tenantSlug) conditions.push(eq(workflowsTable.tenantSlug, tenantSlug));
        
        const row = await this.getDb().select().from(workflowsTable)
            .where(and(...conditions))
            .get();
        return row ? { ...row, isActive: !!row.isActive } as WorkflowData : null;
    }

    async listWorkflows(tenantSlug?: string): Promise<WorkflowData[]> {
        const conditions = [];
        if (tenantSlug) conditions.push(eq(workflowsTable.tenantSlug, tenantSlug));
        
        let query = this.getDb().select().from(workflowsTable);
        if (conditions.length > 0) query = query.where(and(...conditions)) as any;
        
        const rows = await query;
        return rows.map((r: any) => ({ ...r, isActive: !!r.isActive } as WorkflowData));
    }

    async deleteWorkflow(id: string, tenantSlug?: string): Promise<boolean> {
        const conditions = [eq(workflowsTable.id, id)];
        if (tenantSlug) conditions.push(eq(workflowsTable.tenantSlug, tenantSlug));
        
        await this.getDb().delete(workflowsTable).where(and(...conditions));
        return true;
    }

    async toggleWorkflow(id: string, isActive: boolean, tenantSlug?: string): Promise<void> {
        const conditions = [eq(workflowsTable.id, id)];
        if (tenantSlug) conditions.push(eq(workflowsTable.tenantSlug, tenantSlug));
        
        await this.getDb().update(workflowsTable)
            .set({ isActive: isActive, updatedAt: new Date().toISOString() })
            .where(and(...conditions));
    }

    // =========================================================================
    // Executions CRUD
    // =========================================================================

    async createExecution(execution: NewExecutionData): Promise<void> {
        await this.getDb().insert(executionsTable).values({
            id: execution.id, workflowId: execution.workflowId,
            status: execution.status, triggerType: execution.triggerType,
            triggerPayload: execution.triggerPayload || null,
            nodeExecutions: execution.nodeExecutions || null,
            startedAt: execution.startedAt,
        });
    }

    async getExecutionById(id: string, tenantSlug?: string): Promise<ExecutionData | null> {
        let query = this.getDb().select({
            id: executionsTable.id,
            workflowId: executionsTable.workflowId,
            status: executionsTable.status,
            triggerType: executionsTable.triggerType,
            triggerPayload: executionsTable.triggerPayload,
            nodeExecutions: executionsTable.nodeExecutions,
            result: executionsTable.result,
            error: executionsTable.error,
            usage: executionsTable.usage,
            startedAt: executionsTable.startedAt,
            endedAt: executionsTable.endedAt,
        }).from(executionsTable)
        .where(eq(executionsTable.id, id));

        if (tenantSlug) {
            query = query.leftJoin(workflowsTable, eq(executionsTable.workflowId, workflowsTable.id))
                         .where(and(eq(executionsTable.id, id), eq(workflowsTable.tenantSlug, tenantSlug))) as any;
        }

        const row = await query.get();
        return row as ExecutionData | null;
    }

    async updateExecution(id: string, updates: Partial<ExecutionData>): Promise<void> {
        const setValues: Record<string, any> = {};
        if (updates.status !== undefined) setValues.status = updates.status;
        if (updates.result !== undefined) setValues.result = updates.result;
        if (updates.error !== undefined) setValues.error = updates.error;
        if (updates.nodeExecutions !== undefined) setValues.nodeExecutions = updates.nodeExecutions;
        if (updates.usage !== undefined) setValues.usage = updates.usage;
        if (updates.endedAt !== undefined) setValues.endedAt = updates.endedAt;

        if (Object.keys(setValues).length > 0) {
            await this.getDb().update(executionsTable)
                .set(setValues).where(eq(executionsTable.id, id));
        }
    }

    async listExecutionsByWorkflow(workflowId: string, limit: number = 20, tenantSlug?: string): Promise<ExecutionData[]> {
        let query = this.getDb().select({
            id: executionsTable.id,
            workflowId: executionsTable.workflowId,
            status: executionsTable.status,
            triggerType: executionsTable.triggerType,
            triggerPayload: executionsTable.triggerPayload,
            nodeExecutions: executionsTable.nodeExecutions,
            result: executionsTable.result,
            error: executionsTable.error,
            usage: executionsTable.usage,
            startedAt: executionsTable.startedAt,
            endedAt: executionsTable.endedAt,
        }).from(executionsTable)
        .where(eq(executionsTable.workflowId, workflowId));

        if (tenantSlug) {
            query = query.leftJoin(workflowsTable, eq(executionsTable.workflowId, workflowsTable.id))
                         .where(and(eq(executionsTable.workflowId, workflowId), eq(workflowsTable.tenantSlug, tenantSlug))) as any;
        }

        return await query.orderBy(desc(executionsTable.startedAt)).limit(limit) as ExecutionData[];
    }

    async listAllExecutions(filters?: {
        limit?: number; status?: string[]; workflowId?: string;
        since?: string; until?: string;
        tenantSlug?: string;
    }): Promise<ExecutionData[]> {
        const conditions = [];
        if (filters?.workflowId) conditions.push(eq(executionsTable.workflowId, filters.workflowId));
        if (filters?.since) conditions.push(sql`${executionsTable.startedAt} >= ${filters.since}`);
        if (filters?.until) conditions.push(sql`${executionsTable.startedAt} <= ${filters.until}`);
        if (filters?.tenantSlug) conditions.push(eq(workflowsTable.tenantSlug, filters.tenantSlug));

        let query = this.getDb().select({
            id: executionsTable.id,
            workflowId: executionsTable.workflowId,
            status: executionsTable.status,
            triggerType: executionsTable.triggerType,
            triggerPayload: executionsTable.triggerPayload,
            nodeExecutions: executionsTable.nodeExecutions,
            result: executionsTable.result,
            error: executionsTable.error,
            usage: executionsTable.usage,
            startedAt: executionsTable.startedAt,
            endedAt: executionsTable.endedAt,
        }).from(executionsTable);

        if (filters?.tenantSlug) {
            query = query.leftJoin(workflowsTable, eq(executionsTable.workflowId, workflowsTable.id)) as any;
        }

        if (conditions.length > 0) query = query.where(and(...conditions)) as any;
        let rows = await (query as any).orderBy(desc(executionsTable.startedAt)).limit(filters?.limit || 100);

        if (filters?.status && filters.status.length > 0) {
            rows = rows.filter((r: any) => filters.status!.includes(r.status));
        }
        return rows as ExecutionData[];
    }

    async getExecutionStats(tenantSlug?: string): Promise<ExecutionStats[]> {
        let query = this.getDb().select({
            id: executionsTable.id,
            workflowId: executionsTable.workflowId,
            status: executionsTable.status,
            triggerType: executionsTable.triggerType,
            triggerPayload: executionsTable.triggerPayload,
            nodeExecutions: executionsTable.nodeExecutions,
            result: executionsTable.result,
            error: executionsTable.error,
            usage: executionsTable.usage,
            startedAt: executionsTable.startedAt,
            endedAt: executionsTable.endedAt,
        }).from(executionsTable);

        if (tenantSlug) {
            query = query.leftJoin(workflowsTable, eq(executionsTable.workflowId, workflowsTable.id))
                         .where(eq(workflowsTable.tenantSlug, tenantSlug)) as any;
        }

        const allExecutions = await query;
        const statsMap = new Map<string, ExecutionStats>();

        for (const exec of allExecutions) {
            const current = statsMap.get(exec.workflowId) || {
                workflowId: exec.workflowId, totalRuns: 0, successfulRuns: 0, failedRuns: 0,
            };
            current.totalRuns++;
            if (exec.status === 'completed') current.successfulRuns++;
            else if (exec.status === 'error') current.failedRuns++;
            statsMap.set(exec.workflowId, current);
        }
        return Array.from(statsMap.values());
    }

    // =========================================================================
    // Dead Letter Queue
    // =========================================================================

    async createDeadLetter(deadLetter: DeadLetterData): Promise<void> {
        await this.getDb().run(sql`
            INSERT INTO dead_letters (id, workflow_id, execution_id, error, payload, retry_count)
            VALUES (${deadLetter.id}, ${deadLetter.workflowId}, ${deadLetter.executionId},
                    ${deadLetter.error}, ${deadLetter.payload}, ${deadLetter.retryCount || 0})
        `);
    }

    // =========================================================================
    // Workflow Versions (Automations A6)
    // =========================================================================

    async createWorkflowVersion(version: WorkflowVersionData): Promise<void> {
        await this.getDb().run(sql`
            INSERT INTO workflow_draft_versions
                (id, workflow_id, version, name, description, trigger_type, nodes, edges, settings, created_at, created_by, tenant_slug)
            VALUES (${version.id}, ${version.workflowId}, ${version.version}, ${version.name},
                    ${version.description}, ${version.triggerType}, ${version.nodes}, ${version.edges},
                    ${version.settings}, ${version.createdAt}, ${version.createdBy},
                    ${version.tenantSlug || '_default'})
        `);
    }

    async listWorkflowVersions(workflowId: string, limit: number = 50, tenantSlug?: string): Promise<WorkflowVersionData[]> {
        const rows = tenantSlug
            ? await this.getDb().all(sql`
                SELECT * FROM workflow_draft_versions
                WHERE workflow_id = ${workflowId} AND tenant_slug = ${tenantSlug}
                ORDER BY created_at DESC LIMIT ${limit}
              `)
            : await this.getDb().all(sql`
                SELECT * FROM workflow_draft_versions
                WHERE workflow_id = ${workflowId}
                ORDER BY created_at DESC LIMIT ${limit}
              `);
        return (rows || []).map(rowToVersion);
    }

    async getWorkflowVersion(id: string, tenantSlug?: string): Promise<WorkflowVersionData | null> {
        const row = tenantSlug
            ? await this.getDb().get(sql`
                SELECT * FROM workflow_draft_versions
                WHERE id = ${id} AND tenant_slug = ${tenantSlug}
              `)
            : await this.getDb().get(sql`
                SELECT * FROM workflow_draft_versions WHERE id = ${id}
              `);
        return row ? rowToVersion(row) : null;
    }

    async rollbackToVersion(workflowId: string, versionId: string, tenantSlug?: string): Promise<void> {
        const version = await this.getWorkflowVersion(versionId, tenantSlug);
        if (!version) throw new Error(`Version ${versionId} not found`);

        const conditions = [sql`id = ${workflowId}`];
        if (tenantSlug) conditions.push(sql`tenant_slug = ${tenantSlug}`);

        // Bump version + restore content.
        await this.getDb().run(sql`
            UPDATE workflows SET
                name = ${version.name},
                description = ${version.description},
                trigger_type = ${version.triggerType},
                nodes = ${version.nodes},
                edges = ${version.edges},
                settings = ${version.settings},
                version = version + 1,
                updated_at = ${new Date().toISOString()}
            WHERE ${sql.join(conditions, sql` AND `)}
        `);
    }

    async deleteWorkflowVersion(id: string, tenantSlug?: string): Promise<boolean> {
        const result = tenantSlug
            ? await this.getDb().run(sql`
                DELETE FROM workflow_draft_versions WHERE id = ${id} AND tenant_slug = ${tenantSlug}
              `)
            : await this.getDb().run(sql`
                DELETE FROM workflow_draft_versions WHERE id = ${id}
              `);
        // better-sqlite3 returns { changes: n }; treat >0 as deleted.
        return !result || (result as any).changes === undefined ? true : (result as any).changes > 0;
    }

    // =========================================================================
    // Agent Tools CRUD
    // =========================================================================

    async listAgentTools(profileSlug: string, includeInactive: boolean = false): Promise<AgentToolData[]> {
        const conditions = [eq(agentToolsTable.profileSlug, profileSlug)];
        if (!includeInactive) {
            conditions.push(eq(agentToolsTable.isActive, true));
        }

        const rows = await this.getDb().select().from(agentToolsTable)
            .where(and(...conditions));

        return rows.map((r: any) => ({
            ...r,
            isActive: !!r.isActive,
        } as AgentToolData));
    }

    async upsertAgentTool(tool: AgentToolData): Promise<void> {
        const now = new Date().toISOString();
        await this.getDb().insert(agentToolsTable)
            .values({
                id: tool.id,
                profileSlug: tool.profileSlug,
                type: tool.type,
                name: tool.name,
                description: tool.description,
                config: tool.config,
                isActive: tool.isActive,
                createdAt: tool.createdAt || now,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: agentToolsTable.id,
                set: {
                    profileSlug: tool.profileSlug,
                    type: tool.type,
                    name: tool.name,
                    description: tool.description,
                    config: tool.config,
                    isActive: tool.isActive,
                    updatedAt: now,
                },
            });
    }

    async deleteAgentTool(id: string, tenantSlug?: string): Promise<boolean> {
        const conditions = [eq(agentToolsTable.id, id)];
        if (tenantSlug && tenantSlug !== '_default') {
            const orCond = or(
                eq(agentToolsTable.profileSlug, tenantSlug),
                like(agentToolsTable.profileSlug, `${tenantSlug}:%`)
            );
            if (orCond) {
                conditions.push(orCond);
            }
        }
        const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
        await this.getDb().delete(agentToolsTable)
            .where(whereClause);
        return true;
    }

    // =========================================================================
    // Tenant Secrets (community/shared workers)
    // =========================================================================

    async getTenantSecret(tenantSlug: string, kind: string): Promise<string | null> {
        const row = await this.getDb().get(sql`
            SELECT payload FROM tenant_secrets
            WHERE tenant_slug = ${tenantSlug} AND kind = ${kind}
        `);
        return row ? row.payload : null;
    }

    async upsertTenantSecret(tenantSlug: string, kind: string, payload: string): Promise<void> {
        await this.getDb().run(sql`
            INSERT INTO tenant_secrets (tenant_slug, kind, payload, updated_at)
            VALUES (${tenantSlug}, ${kind}, ${payload}, ${new Date().toISOString()})
            ON CONFLICT(tenant_slug, kind) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at
        `);
    }

    async deleteTenantSecret(tenantSlug: string, kind: string): Promise<void> {
        await this.getDb().run(sql`
            DELETE FROM tenant_secrets WHERE tenant_slug = ${tenantSlug} AND kind = ${kind}
        `);
    }

    async listTenantSecrets(): Promise<{ tenantSlug: string; kind: string; payload: string }[]> {
        const rows = await this.getDb().all(sql`
            SELECT tenant_slug, kind, payload FROM tenant_secrets
        `);
        return (rows as Array<{ tenant_slug: string; kind: string; payload: string }>).map(r => ({
            tenantSlug: r.tenant_slug,
            kind: r.kind,
            payload: r.payload,
        }));
    }
}
