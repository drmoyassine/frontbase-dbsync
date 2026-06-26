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
    tenantSlug?: string;
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
// Workflow Versions Types (Automations A6)
// =============================================================================

export interface WorkflowVersionData {
    id: string;
    workflowId: string;
    version: number;
    name: string;
    description: string | null;
    triggerType: string;
    nodes: string;
    edges: string;
    settings: string | null;
    createdAt: string;
    createdBy: string | null;
    tenantSlug?: string;
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

/** A tenant_secrets row (ciphertext only — never decrypted by providers). */
export interface TenantSecretEntry {
    tenantSlug: string;
    kind: string;
    payload: string;
}

/** Metadata for an edge_secrets row (the ciphertext value is never surfaced). */
export interface EdgeSecretMeta {
    name: string;
    version: number;
    createdAt: string;
    updatedAt: string;
}

/** Full metadata for one edge_secrets row, including createdAt (for GET /secrets/:name). */
export interface EdgeSecretDetail extends EdgeSecretMeta {
    createdAt: string;
    value: string; // ciphertext — only used internally; never returned over the API as-is
}

// =============================================================================
// Edge Secret Audit (Phase 2) — append-only audit trail of vault operations
// =============================================================================

export type AuditOperation = 'create' | 'update' | 'delete' | 'read' | 'rotate' | 'export' | 'import' | 'rollback';
export type AuditStatus = 'success' | 'failure' | 'partial';

/** Input shape for writing an audit entry (id + timestamp assigned by the provider). */
export interface AuditEntryInput {
    operation: AuditOperation;
    secretName: string;          // '*' for vault-wide ops (export/import/rotate)
    version: number;             // version AFTER the operation (0 for vault-wide)
    status: AuditStatus;
    errorMessage?: string | null;
    initiatedBy: string;         // 'system' | 'api'
    metadata?: Record<string, unknown> | null;
}

/** A persisted audit entry (metadata field parsed back to an object). */
export interface AuditEntry {
    id: string;
    operation: AuditOperation;
    secretName: string;
    version: number;
    status: AuditStatus;
    errorMessage: string | null;
    initiatedBy: string;
    timestamp: string;
    metadata: Record<string, unknown> | null;
}

// =============================================================================
// Edge Secret Versioning (Phase 2) — per-secret history for rollback
// =============================================================================

/** Metadata for one version row (the ciphertext `value` is never surfaced via this type). */
export interface EdgeSecretVersionMeta {
    id: string;
    version: number;
    createdAt: string;
    createdVia: string;          // create | update | rotate | rollback
    isActive: boolean;
}

export interface IStateProvider {
    // --- Lifecycle ---
    /** Initialize storage (create tables, run migrations, etc.) */
    init(): Promise<void>;

    // --- Pages ---
    /** Upsert a published page (insert or update) */
    upsertPage(page: PublishPage): Promise<{ success: boolean; version: number }>;
    /** Get a published page by slug (optionally scoped to tenant) */
    getPageBySlug(slug: string, tenantSlug?: string): Promise<PublishPage | null>;
    /** Check if a tenant actually exists (has at least 1 page) */
    tenantExists(tenantSlug: string): Promise<boolean>;
    /** Get the homepage (optionally scoped to tenant) */
    getHomepage(tenantSlug?: string): Promise<PublishPage | null>;
    /** Delete a published page by slug (optionally scoped to tenant) */
    deletePage(slug: string, tenantSlug?: string): Promise<boolean>;
    /** List all published pages (summary only, optionally scoped to tenant) */
    listPages(tenantSlug?: string): Promise<PublishedPageSummary[]>;
    /** List public page slugs for sitemap/llms.txt (optionally scoped to tenant) */
    listPublicPageSlugs(tenantSlug?: string): Promise<{ slug: string; updatedAt: string; isHomepage: boolean }[]>;

    // --- Datasource Authorization ---
    /** Verify that a datasourceId belongs to a tenant's published pages (V1 guard) */
    isDatasourceAuthorized(datasourceId: string, tenantSlug?: string): Promise<boolean>;

    // --- Project Settings ---
    /** Initialize settings storage */
    initSettings(): Promise<void>;
    /** Get project settings (returns defaults if not set) */
    getProjectSettings(tenantSlug?: string): Promise<ProjectSettingsData>;
    /** Get favicon URL (with fallback to default) */
    getFaviconUrl(tenantSlug?: string): Promise<string>;
    /** Update project settings */
    updateProjectSettings(
        updates: Partial<Omit<ProjectSettingsData, 'id' | 'updatedAt'>>,
        tenantSlug?: string
    ): Promise<ProjectSettingsData>;

    // --- Workflows ---
    /** Upsert a workflow (insert or update). Returns version number. */
    upsertWorkflow(workflow: WorkflowData): Promise<{ version: number }>;
    /** Get a workflow by ID */
    getWorkflowById(id: string, tenantSlug?: string): Promise<WorkflowData | null>;
    /** Get an active webhook-triggered workflow by ID */
    getActiveWebhookWorkflow(id: string, tenantSlug?: string): Promise<WorkflowData | null>;
    /** List all deployed workflows */
    listWorkflows(tenantSlug?: string): Promise<WorkflowData[]>;
    /** Delete a workflow by ID */
    deleteWorkflow(id: string, tenantSlug?: string): Promise<boolean>;
    /** Toggle workflow active/inactive */
    toggleWorkflow(id: string, isActive: boolean, tenantSlug?: string): Promise<void>;

    // --- Executions ---
    /** Create a new execution record */
    createExecution(execution: NewExecutionData): Promise<void>;
    /** Get an execution by ID */
    getExecutionById(id: string, tenantSlug?: string): Promise<ExecutionData | null>;
    /** Update an execution (status, result, error, etc.) */
    updateExecution(id: string, updates: Partial<ExecutionData>): Promise<void>;
    /** List executions for a workflow, ordered by most recent */
    listExecutionsByWorkflow(workflowId: string, limit?: number, tenantSlug?: string): Promise<ExecutionData[]>;
    /** List all executions across all workflows, with optional filters */
    listAllExecutions(filters?: {
        limit?: number;
        status?: string[];
        workflowId?: string;
        since?: string;
        until?: string;
        tenantSlug?: string;
    }): Promise<ExecutionData[]>;
    /** Get execution stats (counts) for all workflows */
    getExecutionStats(tenantSlug?: string): Promise<ExecutionStats[]>;

    // --- Dead Letter Queue ---
    /** Write a failed execution to the dead letters table (optional) */
    createDeadLetter?(deadLetter: DeadLetterData): Promise<void>;

    // --- Workflow Versions (Automations A6; optional — providers without a
    //     persisted versions table simply omit these and the route 503s) ---
    createWorkflowVersion?(version: WorkflowVersionData): Promise<void>;
    listWorkflowVersions?(workflowId: string, limit?: number, tenantSlug?: string): Promise<WorkflowVersionData[]>;
    getWorkflowVersion?(id: string, tenantSlug?: string): Promise<WorkflowVersionData | null>;
    rollbackToVersion?(workflowId: string, versionId: string, tenantSlug?: string): Promise<void>;
    deleteWorkflowVersion?(id: string, tenantSlug?: string): Promise<boolean>;

    // --- Agent Tools ---
    /** List agent tools for a profile (active only by default) */
    listAgentTools(profileSlug: string, includeInactive?: boolean): Promise<AgentToolData[]>;
    /** Upsert an agent tool */
    upsertAgentTool(tool: AgentToolData): Promise<void>;
    /** Delete an agent tool by ID */
    deleteAgentTool(id: string, tenantSlug?: string): Promise<boolean>;

    // --- Tenant Secrets (community/shared workers only) ---
    //
    // Per-tenant encrypted blobs stored in the worker's own state-DB so that
    // secrets (datasources, auth, …) scale by rows instead of env-var size.
    // `payload` is opaque AES-256-GCM ciphertext (base64) — providers never
    // inspect it. The decryption key lives in FRONTBASE_SECRETS_KEY (env).
    //
    // See docs/plans/[PERFORMANCE] community-worker-tenant-secrets-in-statedb.md
    /** Read a tenant secret blob as ciphertext (null if absent). */
    getTenantSecret(tenantSlug: string, kind: string): Promise<string | null>;
    /** Upsert a tenant secret blob (ciphertext). */
    upsertTenantSecret(tenantSlug: string, kind: string, payload: string): Promise<void>;
    /** Delete a tenant secret blob (on unpublish/offboard). */
    deleteTenantSecret(tenantSlug: string, kind: string): Promise<void>;
    /**
     * List ALL tenant secret blobs (ciphertext) — optional. Used by the control
     * plane for key-rotation read-back / dry-run verification + diagnostics.
     * Providers without an efficient listing path may omit this (route 501s).
     */
    listTenantSecrets?(): Promise<TenantSecretEntry[]>;

    // --- Edge Secrets (local vault — standalone/self-hosted engines) ---
    //
    // Engine-level infrastructure credentials (datasources, cache, queue, …)
    // stored as AES-256-GCM ciphertext so users never hand-edit `.env`. The
    // control plane pushes these via POST /api/config/secrets; the boot loader
    // decrypts them into process.env at startup. `value` is opaque ciphertext
    // — providers never inspect it. The decryption key is derived from
    // FRONTBASE_SYSTEM_KEY (see config/edgeSecrets.ts).
    //
    // See docs/edge-local-vault.md
    /** Upsert an edge secret (ciphertext). Bumps `version` on update. Returns the resulting version. */
    setEdgeSecret?(name: string, value: string): Promise<number>;
    /** Read one edge secret's ciphertext + version (null if absent). */
    getEdgeSecret?(name: string): Promise<{ value: string; version: number } | null>;
    /**
     * Read one edge secret's full row incl. createdAt + ciphertext (null if absent).
     * Optional — used by GET /secrets/:name to surface createdAt; providers without it
     * fall back to updatedAt. The ciphertext MUST NOT be returned over the API.
     */
    getEdgeSecretDetail?(name: string): Promise<EdgeSecretDetail | null>;
    /** List edge secret metadata (names + versions + timestamps — never ciphertext). */
    listEdgeSecrets?(): Promise<EdgeSecretMeta[]>;
    /** Delete an edge secret by name (also removes its version history). */
    deleteEdgeSecret?(name: string): Promise<void>;

    // --- Edge Secret Audit (Phase 2; optional — providers without persistence omit
    //     these and the audit facade no-ops) ---
    /** Append an audit entry. Best-effort: never throws from the caller's perspective. */
    logAudit?(entry: AuditEntryInput): Promise<void>;
    /** Recent audit entries for a single secret (newest first). */
    getAuditHistory?(secretName: string, limit?: number): Promise<AuditEntry[]>;
    /** Paginated audit entries across all secrets (newest first). */
    getAuditEntries?(limit?: number, offset?: number): Promise<{ entries: AuditEntry[]; total: number }>;

    // --- Edge Secret Versioning (Phase 2; optional) ---
    /** Version history for a secret (newest first). Never returns ciphertext. */
    getSecretVersions?(name: string): Promise<EdgeSecretVersionMeta[]>;
    /** Restore a secret to a prior version's ciphertext. Throws if the version is absent. */
    rollbackSecret?(name: string, targetVersion: number): Promise<{ version: number }>;
    /** Delete a specific (non-active) version row. Throws if it is the active version. */
    deleteSecretVersion?(name: string, version: number): Promise<void>;
}
