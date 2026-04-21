/**
 * IStateProvider - Storage adapter interface for the Edge Engine
 * 
 * This defines the contract for how the Edge Engine reads/writes:
 * - Published pages and project settings
 * - Workflows and execution history
 * 
 * Implementations:
 * - LocalSqliteProvider: local SQLite file (self-hosted)
 * - TursoHttpProvider: remote Turso DB over HTTP (cloud/BYOE)
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — providers read from their own
 * state DB only, never call FastAPI at runtime.
 */

import type { PublishPage, DatasourceConfig } from '../schemas/publish';

// =============================================================================
// Tenant Scoping Utility
// =============================================================================

/**
 * Returns true only when the tenantSlug represents an actual multi-tenant
 * context (i.e., a community engine serving multiple tenants).
 *
 * '_default' and undefined mean the engine is single-tenant:
 *   - Self-host: no multi-tenancy
 *   - BYOE (paid plan): dedicated engine, one tenant owns everything
 *
 * Only community engines (shared workers) pass a real slug like 'acme'.
 * Providers MUST use this to decide whether to add tenant_slug WHERE clauses.
 */
export function isMultiTenantSlug(tenantSlug?: string): tenantSlug is string {
    return !!tenantSlug && tenantSlug !== '_default';
}

// =============================================================================
// Published Page Types (provider-agnostic)
// =============================================================================

export interface PublishedPageSummary {
    id: string;
    slug: string;
    name: string;
    version: number;
}

// =============================================================================
// Project Settings Types
// =============================================================================

export interface ProjectSettingsData {
    id: string;
    faviconUrl: string | null;
    logoUrl: string | null;
    siteName: string | null;
    siteDescription: string | null;
    appUrl: string | null;
    authForms: string | null;  // JSON map: { [formId]: AuthFormConfig }
    updatedAt: string;
}

// =============================================================================
// Workflow Types (provider-agnostic)
// =============================================================================

export interface WorkflowData {
    id: string;
    name: string;
    description: string | null;
    triggerType: string;   // manual, http_webhook, scheduled, data_change
    triggerConfig: string | null;  // JSON string
    nodes: string;         // JSON string
    edges: string;         // JSON string
    settings: string | null;  // JSON string — per-workflow settings (rate limit, debounce, etc.)
    version: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    publishedBy: string | null;
}

export interface NewExecutionData {
    id: string;
    workflowId: string;
    status: string;
    triggerType: string;
    triggerPayload?: string | null;
    nodeExecutions?: string | null;
    startedAt: string;
}

export interface ExecutionData {
    id: string;
    workflowId: string;
    status: string;
    triggerType: string;
    triggerPayload: string | null;
    nodeExecutions: string | null;
    result: string | null;
    error: string | null;
    usage: number | null;
    startedAt: string;
    endedAt: string | null;
}

export interface ExecutionStats {
    workflowId: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
}

export interface DeadLetterData {
    id: string;
    workflowId: string;
    executionId: string;
    error: string | null;
    payload: string | null;
    retryCount?: number;
}

// =============================================================================
// Agent Tool Types
// =============================================================================

export interface AgentToolData {
    id: string;
    profileSlug: string;
    type: 'workflow' | 'mcp_server';
    name: string;             // LLM-facing tool name
    description: string | null;
    config: string;           // JSON string (type-discriminated)
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

// =============================================================================
// Agent Tool Config Shapes (parsed from config JSON)
// =============================================================================

export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required: boolean;
    description: string;
    default?: any;
    enum?: string[];
}

export interface WorkflowToolConfig {
    workflowId: string;
    parameters: ToolParameter[];
}

export interface McpServerToolConfig {
    url: string;
    transport: 'streamable-http';
    headers?: Record<string, string>;
    toolFilter?: string[];   // Only import these tool names
}

// =============================================================================
// State Provider Interface
// =============================================================================

export interface IStateProvider {
    // --- Lifecycle ---
    /** Initialize storage (create tables, run migrations, etc.) */
    init(): Promise<void>;

    // --- Pages ---
    /** Upsert a published page (insert or update) */
    upsertPage(page: PublishPage): Promise<{ success: boolean; version: number }>;
    /** Get a published page by slug (optionally scoped to tenant) */
    getPageBySlug(slug: string, tenantSlug?: string): Promise<PublishPage | null>;
    /** Get the homepage (optionally scoped to tenant) */
    getHomepage(tenantSlug?: string): Promise<PublishPage | null>;
    /** Delete a published page by slug (optionally scoped to tenant) */
    deletePage(slug: string, tenantSlug?: string): Promise<boolean>;
    /** List all published pages (summary only, optionally scoped to tenant) */
    listPages(tenantSlug?: string): Promise<PublishedPageSummary[]>;
    /** List public page slugs for sitemap/llms.txt (optionally scoped to tenant) */
    listPublicPageSlugs(tenantSlug?: string): Promise<{ slug: string; updatedAt: string; isHomepage: boolean }[]>;

    // --- Project Settings ---
    /** Initialize settings storage */
    initSettings(): Promise<void>;
    /** Get project settings (returns defaults if not set) */
    getProjectSettings(): Promise<ProjectSettingsData>;
    /** Get favicon URL (with fallback to default) */
    getFaviconUrl(): Promise<string>;
    /** Update project settings */
    updateProjectSettings(
        updates: Partial<Omit<ProjectSettingsData, 'id' | 'updatedAt'>>
    ): Promise<ProjectSettingsData>;

    // --- Workflows ---
    /** Upsert a workflow (insert or update). Returns version number. */
    upsertWorkflow(workflow: WorkflowData): Promise<{ version: number }>;
    /** Get a workflow by ID */
    getWorkflowById(id: string): Promise<WorkflowData | null>;
    /** Get an active webhook-triggered workflow by ID */
    getActiveWebhookWorkflow(id: string): Promise<WorkflowData | null>;
    /** List all deployed workflows */
    listWorkflows(): Promise<WorkflowData[]>;
    /** Delete a workflow by ID */
    deleteWorkflow(id: string): Promise<boolean>;
    /** Toggle workflow active/inactive */
    toggleWorkflow(id: string, isActive: boolean): Promise<void>;

    // --- Executions ---
    /** Create a new execution record */
    createExecution(execution: NewExecutionData): Promise<void>;
    /** Get an execution by ID */
    getExecutionById(id: string): Promise<ExecutionData | null>;
    /** Update an execution (status, result, error, etc.) */
    updateExecution(id: string, updates: Partial<ExecutionData>): Promise<void>;
    /** List executions for a workflow, ordered by most recent */
    listExecutionsByWorkflow(workflowId: string, limit?: number): Promise<ExecutionData[]>;
    /** List all executions across all workflows, with optional filters */
    listAllExecutions(filters?: {
        limit?: number;
        status?: string[];
        workflowId?: string;
        since?: string;
        until?: string;
    }): Promise<ExecutionData[]>;
    /** Get execution stats (counts) for all workflows */
    getExecutionStats(): Promise<ExecutionStats[]>;

    // --- Dead Letter Queue ---
    /** Write a failed execution to the dead letters table (optional) */
    createDeadLetter?(deadLetter: DeadLetterData): Promise<void>;

    // --- Agent Tools ---
    /** List agent tools for a profile (active only by default) */
    listAgentTools(profileSlug: string, includeInactive?: boolean): Promise<AgentToolData[]>;
    /** Upsert an agent tool */
    upsertAgentTool(tool: AgentToolData): Promise<void>;
    /** Delete an agent tool by ID */
    deleteAgentTool(id: string): Promise<boolean>;
}
