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

import { sql, eq, and, desc } from 'drizzle-orm';
import type { PublishPage, PageLayout, SeoData, DatasourceConfig } from '../schemas/publish';
import type {
    IStateProvider, ProjectSettingsData, PublishedPageSummary,
    WorkflowData, ExecutionData, NewExecutionData, ExecutionStats, DeadLetterData,
    AgentToolData,
} from './IStateProvider';
import { isMultiTenantSlug } from './IStateProvider';
import { publishedPages, projectSettings, workflowsTable, executionsTable, agentToolsTable, type NewPublishedPage } from './schema';

/** Default favicon path (Frontbase logo) */
const DEFAULT_FAVICON = '/static/icon.png';

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
    // Project Settings
    // =========================================================================

    async getProjectSettings(): Promise<ProjectSettingsData> {
        const record = await this.getDb().select()
            .from(projectSettings).where(eq(projectSettings.id, 'default')).get();
        if (!record) {
            return {
                id: 'default', faviconUrl: null, logoUrl: null,
                siteName: null, siteDescription: null, appUrl: null,
                authForms: null,
                updatedAt: new Date().toISOString(),
            };
        }
        return record;
    }

    async getFaviconUrl(): Promise<string> {
        return (await this.getProjectSettings()).faviconUrl || DEFAULT_FAVICON;
    }

    async updateProjectSettings(
        updates: Partial<Omit<ProjectSettingsData, 'id' | 'updatedAt'>>
    ): Promise<ProjectSettingsData> {
        const database = this.getDb();
        const existing = await database.select()
            .from(projectSettings).where(eq(projectSettings.id, 'default')).get();

        if (existing) {
            await database.update(projectSettings)
                .set({ ...updates, updatedAt: new Date().toISOString() })
                .where(eq(projectSettings.id, 'default'));
        } else {
            await database.insert(projectSettings).values({
                id: 'default', ...updates, updatedAt: new Date().toISOString(),
            });
        }
        return this.getProjectSettings();
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

    async getExecutionById(id: string): Promise<ExecutionData | null> {
        const row = await this.getDb().select().from(executionsTable)
            .where(eq(executionsTable.id, id)).get();
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

    async listExecutionsByWorkflow(workflowId: string, limit: number = 20): Promise<ExecutionData[]> {
        return await this.getDb().select().from(executionsTable)
            .where(eq(executionsTable.workflowId, workflowId))
            .orderBy(desc(executionsTable.startedAt))
            .limit(limit) as ExecutionData[];
    }

    async listAllExecutions(filters?: {
        limit?: number; status?: string[]; workflowId?: string;
        since?: string; until?: string;
    }): Promise<ExecutionData[]> {
        const conditions = [];
        if (filters?.workflowId) conditions.push(eq(executionsTable.workflowId, filters.workflowId));
        if (filters?.since) conditions.push(sql`${executionsTable.startedAt} >= ${filters.since}`);
        if (filters?.until) conditions.push(sql`${executionsTable.startedAt} <= ${filters.until}`);

        let query = this.getDb().select().from(executionsTable);
        if (conditions.length > 0) query = query.where(and(...conditions)) as any;
        let rows = await (query as any).orderBy(desc(executionsTable.startedAt)).limit(filters?.limit || 100);

        if (filters?.status && filters.status.length > 0) {
            rows = rows.filter((r: any) => filters.status!.includes(r.status));
        }
        return rows as ExecutionData[];
    }

    async getExecutionStats(): Promise<ExecutionStats[]> {
        const allExecutions = await this.getDb().select().from(executionsTable);
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

    async deleteAgentTool(id: string): Promise<boolean> {
        await this.getDb().delete(agentToolsTable)
            .where(eq(agentToolsTable.id, id));
        return true;
    }
}
