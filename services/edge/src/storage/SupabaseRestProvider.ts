/**
 * SupabaseRestProvider — Supabase state provider via PostgREST
 *
 * Uses @supabase/postgrest-js to interact with Supabase via pure HTTP.
 * Works on ALL edge runtimes (Vercel Edge, CF Workers, Netlify, Deno, etc.)
 * because it uses fetch() — no WebSocket, no TCP, no PG wire protocol.
 *
 * Auth: Uses a scoped JWT minted at provisioning time with
 *   role: frontbase_edge_role — limited to our schema only.
 *   The anon_key is used as the PostgREST API gateway key.
 *
 * Schema: All tables live in a dedicated PG schema (default: `frontbase_edge`)
 *   accessed via Accept-Profile / Content-Profile headers (handled by postgrest-js).
 *
 * Table creation and RLS policies are handled at provisioning time by the backend.
 * init() is a no-op — the runtime only does CRUD.
 *
 * Env vars:
 * - FRONTBASE_SUPABASE_URL:      https://<ref>.supabase.co
 * - FRONTBASE_SUPABASE_ANON_KEY: anon key (API gateway auth)
 * - FRONTBASE_SUPABASE_JWT:      scoped JWT (role: frontbase_edge_role)
 * - FRONTBASE_SCHEMA_NAME:       PG schema (default: frontbase_edge)
 *
 * AGENTS.md §2.1: Edge Self-Sufficiency — no calls to FastAPI at runtime.
 */

import type { PublishPage, PageLayout, SeoData, DatasourceConfig } from '../schemas/publish';
import type {
    IStateProvider, ProjectSettingsData, PublishedPageSummary,
    WorkflowData, ExecutionData, NewExecutionData, ExecutionStats, DeadLetterData,
} from './IStateProvider';

const DEFAULT_FAVICON = '/static/icon.png';
const SCHEMA = process.env.FRONTBASE_SCHEMA_NAME || 'frontbase_edge';

// =============================================================================
// PostgREST Client (lazy singleton)
// =============================================================================

type PgrestClient = import('@supabase/postgrest-js').PostgrestClient;
let _client: PgrestClient | null = null;

function getClient(): PgrestClient {
    if (_client) return _client;

    const supabaseUrl = process.env.FRONTBASE_SUPABASE_URL;
    const anonKey = process.env.FRONTBASE_SUPABASE_ANON_KEY;
    const scopedJwt = process.env.FRONTBASE_SUPABASE_JWT;

    if (!supabaseUrl || !anonKey || !scopedJwt) {
        throw new Error(
            '[SupabaseRestProvider] Missing env vars: FRONTBASE_SUPABASE_URL, ' +
            'FRONTBASE_SUPABASE_ANON_KEY, FRONTBASE_SUPABASE_JWT'
        );
    }

    // Dynamic import would be needed for tree-shaking, but postgrest-js is small.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PostgrestClient } = require('@supabase/postgrest-js');

    _client = new PostgrestClient(`${supabaseUrl}/rest/v1`, {
        headers: {
            apikey: anonKey,                         // API gateway auth
            Authorization: `Bearer ${scopedJwt}`,    // PG role = frontbase_edge_role
        },
        schema: SCHEMA,
    }) as PgrestClient;

    console.log(`🐘 SupabaseRestProvider initialized: ${supabaseUrl} (schema: ${SCHEMA})`);
    return _client;
}

// =============================================================================
// Helper: throw on PostgREST errors
// =============================================================================

function throwIfError(result: { error: any; data: any }, context: string): void {
    if (result.error) {
        const e = result.error;
        const msg = e.message || e.details || e.hint || e.code || JSON.stringify(e);
        throw new Error(`[SupabaseRest] ${context}: ${msg}`);
    }
}

// =============================================================================
// SupabaseRestProvider
// =============================================================================

export class SupabaseRestProvider implements IStateProvider {

    // =========================================================================
    // Lifecycle
    // =========================================================================

    async init(): Promise<void> {
        // Tables & schema are created at provisioning time via Management API.
        // Just verify connectivity by doing a lightweight query.
        const client = getClient();
        const { error } = await client.from('published_pages').select('slug', { count: 'exact', head: true });
        if (error) {
            const e = error;
            const detail = [e.message, e.details, e.hint, e.code].filter(Boolean).join(' | ');
            throw new Error(`[SupabaseRest] init failed: ${detail || JSON.stringify(e)}`);
        }
        console.log(`🐘 SupabaseRestProvider ready (PostgREST) — schema: ${SCHEMA}`);
    }

    async initSettings(): Promise<void> {
        // No-op — settings table created at provisioning time
    }

    // =========================================================================
    // Pages CRUD
    // =========================================================================

    async upsertPage(page: PublishPage): Promise<{ success: boolean; version: number }> {
        const client = getClient();

        // Clear existing homepage flag if this page is the new homepage
        if (page.isHomepage) {
            await client
                .from('published_pages')
                .update({ is_homepage: false })
                .eq('is_homepage', true);
        }

        const row = {
            id: page.id,
            slug: page.slug,
            name: page.name,
            title: page.title || null,
            description: page.description || null,
            layout_data: JSON.stringify(page.layoutData),
            seo_data: page.seoData ? JSON.stringify(page.seoData) : null,
            datasources: page.datasources ? JSON.stringify(page.datasources) : null,
            css_bundle: page.cssBundle || null,
            version: page.version,
            published_at: page.publishedAt,
            is_public: page.isPublic,
            is_homepage: page.isHomepage,
            content_hash: page.contentHash || null,
            updated_at: new Date().toISOString(),
        };

        const result = await client
            .from('published_pages')
            .upsert(row, { onConflict: 'id' });
        throwIfError(result, `upsertPage(${page.slug})`);

        console.log(`🐘 Upserted page (PostgREST): ${page.slug} (v${page.version})`);
        return { success: true, version: page.version };
    }

    private rowToPage(row: Record<string, unknown>): PublishPage {
        return {
            id: row.id as string,
            slug: row.slug as string,
            name: row.name as string,
            title: (row.title as string) || undefined,
            description: (row.description as string) || undefined,
            layoutData: typeof row.layout_data === 'string'
                ? JSON.parse(row.layout_data) as PageLayout
                : row.layout_data as PageLayout,
            seoData: row.seo_data
                ? (typeof row.seo_data === 'string' ? JSON.parse(row.seo_data) as SeoData : row.seo_data as SeoData)
                : undefined,
            datasources: row.datasources
                ? (typeof row.datasources === 'string' ? JSON.parse(row.datasources) as DatasourceConfig[] : row.datasources as DatasourceConfig[])
                : undefined,
            cssBundle: (row.css_bundle as string) || undefined,
            version: row.version as number,
            publishedAt: row.published_at as string,
            isPublic: !!(row.is_public),
            isHomepage: !!(row.is_homepage),
        };
    }

    async getPageBySlug(slug: string): Promise<PublishPage | null> {
        const client = getClient();
        const { data, error } = await client
            .from('published_pages')
            .select('*')
            .eq('slug', slug)
            .maybeSingle();
        if (error) throw new Error(`[SupabaseRest] getPageBySlug: ${error.message}`);
        return data ? this.rowToPage(data) : null;
    }

    async getHomepage(): Promise<PublishPage | null> {
        const client = getClient();
        const { data, error } = await client
            .from('published_pages')
            .select('*')
            .eq('is_homepage', true)
            .maybeSingle();
        if (error) throw new Error(`[SupabaseRest] getHomepage: ${error.message}`);
        return data ? this.rowToPage(data) : null;
    }

    async deletePage(slug: string): Promise<boolean> {
        const client = getClient();
        const result = await client
            .from('published_pages')
            .delete()
            .eq('slug', slug);
        throwIfError(result, `deletePage(${slug})`);
        return true;
    }

    async listPages(): Promise<PublishedPageSummary[]> {
        const client = getClient();
        const { data, error } = await client
            .from('published_pages')
            .select('slug, name, version');
        if (error) throw new Error(`[SupabaseRest] listPages: ${error.message}`);
        return (data || []) as PublishedPageSummary[];
    }

    // =========================================================================
    // Project Settings
    // =========================================================================

    async getProjectSettings(): Promise<ProjectSettingsData> {
        const client = getClient();
        const { data, error } = await client
            .from('project_settings')
            .select('*')
            .eq('id', 'default')
            .maybeSingle();
        if (error) throw new Error(`[SupabaseRest] getProjectSettings: ${error.message}`);

        if (!data) {
            return {
                id: 'default', faviconUrl: null, logoUrl: null,
                siteName: null, siteDescription: null, appUrl: null,
                updatedAt: new Date().toISOString(),
            };
        }
        return {
            id: data.id as string,
            faviconUrl: (data.favicon_url as string) || null,
            logoUrl: (data.logo_url as string) || null,
            siteName: (data.site_name as string) || null,
            siteDescription: (data.site_description as string) || null,
            appUrl: (data.app_url as string) || null,
            updatedAt: data.updated_at as string,
        };
    }

    async getFaviconUrl(): Promise<string> {
        return (await this.getProjectSettings()).faviconUrl || DEFAULT_FAVICON;
    }

    async updateProjectSettings(
        updates: Partial<Omit<ProjectSettingsData, 'id' | 'updatedAt'>>
    ): Promise<ProjectSettingsData> {
        const client = getClient();
        const now = new Date().toISOString();

        const row: Record<string, unknown> = {
            id: 'default',
            updated_at: now,
        };
        if (updates.faviconUrl !== undefined) row.favicon_url = updates.faviconUrl;
        if (updates.logoUrl !== undefined) row.logo_url = updates.logoUrl;
        if (updates.siteName !== undefined) row.site_name = updates.siteName;
        if (updates.siteDescription !== undefined) row.site_description = updates.siteDescription;
        if (updates.appUrl !== undefined) row.app_url = updates.appUrl;

        const result = await client
            .from('project_settings')
            .upsert(row, { onConflict: 'id' });
        throwIfError(result, 'updateProjectSettings');

        return this.getProjectSettings();
    }

    // =========================================================================
    // Workflows
    // =========================================================================

    async upsertWorkflow(workflow: WorkflowData): Promise<{ version: number }> {
        const client = getClient();
        const now = new Date().toISOString();

        // Check existing version
        const { data: existing } = await client
            .from('workflows')
            .select('version')
            .eq('id', workflow.id)
            .maybeSingle();

        const newVersion = existing ? ((existing.version as number) || 1) + 1 : 1;

        const row = {
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            trigger_type: workflow.triggerType,
            trigger_config: workflow.triggerConfig,
            nodes: workflow.nodes,
            edges: workflow.edges,
            settings: workflow.settings || null,
            version: newVersion,
            is_active: existing ? undefined : true,  // Only set on insert
            created_at: existing ? undefined : now,   // Only set on insert
            updated_at: now,
            published_by: workflow.publishedBy,
        };

        // Remove undefined fields for upsert
        const cleanRow = Object.fromEntries(
            Object.entries(row).filter(([_, v]) => v !== undefined)
        );

        const result = await client
            .from('workflows')
            .upsert(cleanRow, { onConflict: 'id' });
        throwIfError(result, `upsertWorkflow(${workflow.id})`);

        return { version: newVersion };
    }

    async getWorkflowById(id: string): Promise<WorkflowData | null> {
        const client = getClient();
        const { data, error } = await client
            .from('workflows')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw new Error(`[SupabaseRest] getWorkflowById: ${error.message}`);
        return data ? this.rowToWorkflow(data) : null;
    }

    async getActiveWebhookWorkflow(id: string): Promise<WorkflowData | null> {
        const client = getClient();
        const { data, error } = await client
            .from('workflows')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .maybeSingle();
        if (error) throw new Error(`[SupabaseRest] getActiveWebhookWorkflow: ${error.message}`);
        return data ? this.rowToWorkflow(data) : null;
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
        };
    }

    // =========================================================================
    // Executions
    // =========================================================================

    async createExecution(execution: NewExecutionData): Promise<void> {
        const client = getClient();
        const result = await client
            .from('executions')
            .insert({
                id: execution.id,
                workflow_id: execution.workflowId,
                status: execution.status,
                trigger_type: execution.triggerType,
                trigger_payload: execution.triggerPayload || null,
                node_executions: execution.nodeExecutions || null,
                started_at: execution.startedAt,
            });
        throwIfError(result, 'createExecution');
    }

    async getExecutionById(id: string): Promise<ExecutionData | null> {
        const client = getClient();
        const { data, error } = await client
            .from('executions')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw new Error(`[SupabaseRest] getExecutionById: ${error.message}`);
        return data ? this.rowToExecution(data) : null;
    }

    async updateExecution(id: string, updates: Partial<ExecutionData>): Promise<void> {
        const client = getClient();
        const row: Record<string, unknown> = {};
        if (updates.status !== undefined) row.status = updates.status;
        if (updates.result !== undefined) row.result = updates.result;
        if (updates.error !== undefined) row.error = updates.error;
        if (updates.nodeExecutions !== undefined) row.node_executions = updates.nodeExecutions;
        if (updates.usage !== undefined) row.usage = updates.usage;
        if (updates.endedAt !== undefined) row.ended_at = updates.endedAt;

        if (Object.keys(row).length > 0) {
            const result = await client
                .from('executions')
                .update(row)
                .eq('id', id);
            throwIfError(result, `updateExecution(${id})`);
        }
    }

    async listExecutionsByWorkflow(workflowId: string, limit: number = 20): Promise<ExecutionData[]> {
        const client = getClient();
        const { data, error } = await client
            .from('executions')
            .select('*')
            .eq('workflow_id', workflowId)
            .order('started_at', { ascending: false })
            .limit(limit);
        if (error) throw new Error(`[SupabaseRest] listExecutionsByWorkflow: ${error.message}`);
        return (data || []).map(r => this.rowToExecution(r));
    }

    async listAllExecutions(filters?: {
        limit?: number; status?: string[]; workflowId?: string; since?: string; until?: string;
    }): Promise<ExecutionData[]> {
        const client = getClient();
        let query = client
            .from('executions')
            .select('*')
            .order('started_at', { ascending: false })
            .limit(filters?.limit || 100);

        if (filters?.workflowId) query = query.eq('workflow_id', filters.workflowId);
        if (filters?.since) query = query.gte('started_at', filters.since);
        if (filters?.until) query = query.lte('started_at', filters.until);
        if (filters?.status && filters.status.length > 0) {
            query = query.in('status', filters.status);
        }

        const { data, error } = await query;
        if (error) throw new Error(`[SupabaseRest] listAllExecutions: ${error.message}`);
        return (data || []).map(r => this.rowToExecution(r));
    }

    async getExecutionStats(): Promise<ExecutionStats[]> {
        const client = getClient();
        const { data, error } = await client
            .from('executions')
            .select('workflow_id, status');
        if (error) throw new Error(`[SupabaseRest] getExecutionStats: ${error.message}`);

        const statsMap = new Map<string, ExecutionStats>();
        for (const row of data || []) {
            const wid = row.workflow_id as string;
            const current = statsMap.get(wid) || { workflowId: wid, totalRuns: 0, successfulRuns: 0, failedRuns: 0 };
            current.totalRuns++;
            if (row.status === 'completed') current.successfulRuns++;
            else if (row.status === 'error') current.failedRuns++;
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
        const client = getClient();
        const result = await client
            .from('dead_letters')
            .insert({
                id: deadLetter.id,
                workflow_id: deadLetter.workflowId,
                execution_id: deadLetter.executionId,
                error: deadLetter.error,
                payload: deadLetter.payload,
                retry_count: deadLetter.retryCount || 0,
            });
        throwIfError(result, 'createDeadLetter');
    }
}
