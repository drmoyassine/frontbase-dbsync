/**
 * LocalSqliteProvider — Local SQLite/LibSQL implementation of IStateProvider
 * 
 * This is a refactor of the existing logic from:
 * - db/pages-store.ts (published pages CRUD)
 * - db/project-settings.ts (project settings CRUD)
 * 
 * Behavior is 100% identical to the original — just wrapped in the
 * IStateProvider interface so it can be swapped for TursoHttpProvider.
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — reads from local SQLite only.
 * AGENTS.md §2.2: Backward Compatibility — preserves all existing behavior.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql, eq, and, desc } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import type { PublishPage, PageLayout, SeoData, DatasourceConfig } from '../schemas/publish';
import type { IStateProvider, ProjectSettingsData, PublishedPageSummary, WorkflowData, ExecutionData, NewExecutionData, ExecutionStats } from './IStateProvider';
import { runMigrations } from './edge-migrations';

// =============================================================================
// Schema Definitions
// =============================================================================

export const publishedPages = sqliteTable('published_pages', {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    title: text('title'),
    description: text('description'),
    layoutData: text('layout_data').notNull(),
    seoData: text('seo_data'),
    datasources: text('datasources'),
    cssBundle: text('css_bundle'),
    version: integer('version').notNull().default(1),
    publishedAt: text('published_at').notNull(),
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(true),
    isHomepage: integer('is_homepage', { mode: 'boolean' }).notNull().default(false),
    contentHash: text('content_hash'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const projectSettings = sqliteTable('project_settings', {
    id: text('id').primaryKey().default('default'),
    faviconUrl: text('favicon_url'),
    logoUrl: text('logo_url'),
    siteName: text('site_name'),
    siteDescription: text('site_description'),
    appUrl: text('app_url'),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

const workflowsTable = sqliteTable('workflows', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    triggerType: text('trigger_type').notNull(),
    triggerConfig: text('trigger_config'),
    nodes: text('nodes').notNull(),
    edges: text('edges').notNull(),
    version: integer('version').notNull().default(1),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    publishedBy: text('published_by'),
});

const executionsTable = sqliteTable('executions', {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').notNull(),
    status: text('status').notNull(),
    triggerType: text('trigger_type').notNull(),
    triggerPayload: text('trigger_payload'),
    nodeExecutions: text('node_executions'),
    result: text('result'),
    error: text('error'),
    usage: real('usage').default(0),
    startedAt: text('started_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    endedAt: text('ended_at'),
});

type NewPublishedPage = typeof publishedPages.$inferInsert;

/** Default favicon path (Frontbase logo) */
const DEFAULT_FAVICON = '/static/icon.png';

// =============================================================================
// Provider Implementation
// =============================================================================

export class LocalSqliteProvider implements IStateProvider {
    private db: ReturnType<typeof drizzle> | null = null;

    /** Get or create the database connection */
    private getDb() {
        if (!this.db) {
            const client = createClient({
                url: process.env.PAGES_DB_URL || 'file:./data/pages.db',
            });
            this.db = drizzle(client);
        }
        return this.db;
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    async init(): Promise<void> {
        const database = this.getDb();
        await runMigrations(
            async (sqlStr) => { await database.run(sql.raw(sqlStr)); },
            'LocalSqlite'
        );
        console.log('📄 State DB initialized (local SQLite)');
    }

    async initSettings(): Promise<void> {
        // Settings table is created by migration v1
        console.log('⚙️ Project settings database initialized');
    }

    // =========================================================================
    // Pages CRUD
    // =========================================================================

    async upsertPage(page: PublishPage): Promise<{ success: boolean; version: number }> {
        const database = this.getDb();
        const record: NewPublishedPage = {
            id: page.id, slug: page.slug, name: page.name,
            title: page.title || null, description: page.description || null,
            layoutData: JSON.stringify(page.layoutData),
            seoData: page.seoData ? JSON.stringify(page.seoData) : null,
            datasources: page.datasources ? JSON.stringify(page.datasources) : null,
            cssBundle: page.cssBundle || null,
            version: page.version, publishedAt: page.publishedAt,
            isPublic: page.isPublic, isHomepage: page.isHomepage,
            contentHash: page.contentHash || null,
        };

        // Enforce homepage uniqueness: clear old homepage before setting new one
        if (page.isHomepage) {
            await database.update(publishedPages)
                .set({ isHomepage: false })
                .where(eq(publishedPages.isHomepage, true));
            console.log(`📝 Cleared old homepage flag(s) before setting new homepage: ${page.slug}`);
        }

        // Atomic upsert — avoids race condition when multiple targets publish concurrently
        await database.insert(publishedPages)
            .values(record)
            .onConflictDoUpdate({
                target: publishedPages.slug,
                set: { ...record, updatedAt: new Date().toISOString() },
            });

        console.log(`📝 Upserted published page: ${page.slug} (v${page.version})`);
        return { success: true, version: page.version };
    }

    async getPageBySlug(slug: string): Promise<PublishPage | null> {
        const record = await this.getDb().select()
            .from(publishedPages).where(eq(publishedPages.slug, slug)).get();
        if (!record) return null;
        return {
            id: record.id, slug: record.slug, name: record.name,
            title: record.title || undefined, description: record.description || undefined,
            layoutData: JSON.parse(record.layoutData) as PageLayout,
            seoData: record.seoData ? JSON.parse(record.seoData) as SeoData : undefined,
            datasources: record.datasources ? JSON.parse(record.datasources) as DatasourceConfig[] : undefined,
            cssBundle: record.cssBundle || undefined,
            version: record.version, publishedAt: record.publishedAt,
            isPublic: record.isPublic, isHomepage: record.isHomepage,
        };
    }

    async getHomepage(): Promise<PublishPage | null> {
        const record = await this.getDb().select()
            .from(publishedPages).where(eq(publishedPages.isHomepage, true)).get();
        if (!record) return null;
        return {
            id: record.id, slug: record.slug, name: record.name,
            title: record.title || undefined, description: record.description || undefined,
            layoutData: JSON.parse(record.layoutData) as PageLayout,
            seoData: record.seoData ? JSON.parse(record.seoData) as SeoData : undefined,
            datasources: record.datasources ? JSON.parse(record.datasources) as DatasourceConfig[] : undefined,
            cssBundle: record.cssBundle || undefined,
            version: record.version, publishedAt: record.publishedAt,
            isPublic: record.isPublic, isHomepage: record.isHomepage,
        };
    }

    async deletePage(slug: string): Promise<boolean> {
        await this.getDb().delete(publishedPages).where(eq(publishedPages.slug, slug));
        return true;
    }

    async listPages(): Promise<PublishedPageSummary[]> {
        return await this.getDb().select({
            slug: publishedPages.slug, name: publishedPages.name, version: publishedPages.version,
        }).from(publishedPages);
    }

    // =========================================================================
    // Project Settings CRUD
    // =========================================================================

    async getProjectSettings(): Promise<ProjectSettingsData> {
        const record = await this.getDb().select()
            .from(projectSettings).where(eq(projectSettings.id, 'default')).get();
        if (!record) {
            return {
                id: 'default', faviconUrl: null, logoUrl: null, siteName: null,
                siteDescription: null, appUrl: null, updatedAt: new Date().toISOString()
            };
        }
        return record;
    }

    async getFaviconUrl(): Promise<string> {
        const settings = await this.getProjectSettings();
        return settings.faviconUrl || DEFAULT_FAVICON;
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
        console.log('⚙️ Project settings updated');
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
                    version: newVersion, updatedAt: now, publishedBy: workflow.publishedBy,
                })
                .where(eq(workflowsTable.id, workflow.id));
            return { version: newVersion };
        } else {
            await database.insert(workflowsTable).values({
                id: workflow.id, name: workflow.name, description: workflow.description,
                triggerType: workflow.triggerType, triggerConfig: workflow.triggerConfig,
                nodes: workflow.nodes, edges: workflow.edges,
                version: 1, isActive: true, createdAt: now, updatedAt: now,
                publishedBy: workflow.publishedBy,
            });
            return { version: 1 };
        }
    }

    async getWorkflowById(id: string): Promise<WorkflowData | null> {
        const row = await this.getDb().select().from(workflowsTable)
            .where(eq(workflowsTable.id, id)).get();
        return row ? { ...row, isActive: !!row.isActive } as WorkflowData : null;
    }

    async getActiveWebhookWorkflow(id: string): Promise<WorkflowData | null> {
        const row = await this.getDb().select().from(workflowsTable)
            .where(and(eq(workflowsTable.id, id), eq(workflowsTable.isActive, true)))
            .get();
        return row ? { ...row, isActive: !!row.isActive } as WorkflowData : null;
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
        const rows = await this.getDb().select().from(executionsTable)
            .where(eq(executionsTable.workflowId, workflowId))
            .orderBy(desc(executionsTable.startedAt))
            .limit(limit);
        return rows as ExecutionData[];
    }

    async listAllExecutions(filters?: {
        limit?: number;
        status?: string[];
        workflowId?: string;
        since?: string;
        until?: string;
    }): Promise<ExecutionData[]> {
        const conditions = [];
        if (filters?.workflowId) {
            conditions.push(eq(executionsTable.workflowId, filters.workflowId));
        }
        if (filters?.since) {
            conditions.push(sql`${executionsTable.startedAt} >= ${filters.since}`);
        }
        if (filters?.until) {
            conditions.push(sql`${executionsTable.startedAt} <= ${filters.until}`);
        }

        let query = this.getDb().select().from(executionsTable);
        if (conditions.length > 0) {
            query = query.where(and(...conditions)) as any;
        }
        let rows = await (query as any)
            .orderBy(desc(executionsTable.startedAt))
            .limit(filters?.limit || 100);

        // Filter by status in-memory (drizzle SQLite doesn't support IN easily)
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
}
