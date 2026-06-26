/**
 * Shared Drizzle Schema — Single Source of Truth
 * 
 * All SQLite table definitions used by both TursoHttpProvider and LocalSqliteProvider.
 * This prevents schema drift between the two providers — a column added to one
 * must be added here, automatically propagating to both.
 * 
 * See: performance-optimization.md §3.1 — "Drizzle Schema Consistency"
 */

import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

// =============================================================================
// Published Pages
// =============================================================================

export const publishedPages = sqliteTable('published_pages', {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    tenantSlug: text('tenant_slug').notNull().default('_default'),
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

// =============================================================================
// Project Settings
// =============================================================================

export const projectSettings = sqliteTable('project_settings', {
    id: text('id').primaryKey().default('default'),
    faviconUrl: text('favicon_url'),
    logoUrl: text('logo_url'),
    siteName: text('site_name'),
    siteDescription: text('site_description'),
    appUrl: text('app_url'),
    authForms: text('auth_forms'),  // JSON map: { [formId]: { type, title, primaryColor, providers, ... } }
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

// =============================================================================
// Workflows
// =============================================================================

export const workflowsTable = sqliteTable('workflows', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    triggerType: text('trigger_type').notNull(),
    triggerConfig: text('trigger_config'),
    nodes: text('nodes').notNull(),
    edges: text('edges').notNull(),
    settings: text('settings'),
    version: integer('version').notNull().default(1),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    publishedBy: text('published_by'),
    tenantSlug: text('tenant_slug').notNull().default('_default'),
});

// =============================================================================
// Executions
// =============================================================================

export const executionsTable = sqliteTable('executions', {
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

// =============================================================================
// Edge Logs (persisted runtime logs from provider APIs)
// =============================================================================

export const edgeLogsTable = sqliteTable('edge_logs', {
    id: text('id').primaryKey(),
    timestamp: text('timestamp').notNull(),
    level: text('level').notNull(),          // debug | info | warn | error
    message: text('message').notNull(),
    source: text('source').default('runtime'),  // runtime | request | error | system
    metadata: text('metadata'),              // JSON string — provider-specific extras
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

// =============================================================================
// Agent Tools (user-configured tools for AI agent profiles)
// =============================================================================

export const agentToolsTable = sqliteTable('agent_tools', {
    id: text('id').primaryKey(),
    profileSlug: text('profile_slug').notNull(),      // Which agent profile owns this tool
    type: text('type').notNull(),                      // 'workflow' | 'mcp_server'
    name: text('name').notNull(),                      // LLM-facing tool name (e.g., "send_welcome_email")
    description: text('description'),                  // LLM-facing description
    config: text('config').notNull(),                  // JSON blob (type-discriminated)
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

// =============================================================================
// Tenant Secrets (community/shared workers — encrypted per-tenant blobs)
// =============================================================================

export const tenantSecrets = sqliteTable(
    'tenant_secrets',
    {
        tenantSlug: text('tenant_slug').notNull(),
        kind: text('kind').notNull(),                 // 'datasources' | 'auth' | 'agent_profiles' | 'security' | 'storage'
        payload: text('payload').notNull(),            // AES-256-GCM ciphertext (base64)
        updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => [primaryKey({ columns: [table.tenantSlug, table.kind] })],
);

// =============================================================================
// Edge Secrets (local vault — encrypted engine-level infrastructure credentials
// for standalone/self-hosted deployments; eliminates manual .env juggling)
// =============================================================================

export const edgeSecrets = sqliteTable('edge_secrets', {
    name: text('name').primaryKey(),                    // e.g. 'FRONTBASE_DATASOURCES'
    value: text('value').notNull(),                     // AES-256-GCM ciphertext (base64)
    version: integer('version').notNull().default(1),   // bumped on each upsert (rotation support)
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

// =============================================================================
// Edge Secret Audit (local vault — Phase 2: append-only audit trail of every
// secret operation: create/update/delete/read/rotate/export/import/rollback)
// =============================================================================

export const edgeSecretAudit = sqliteTable('edge_secret_audit', {
    id: text('id').primaryKey(),
    operation: text('operation').notNull(),       // create | update | delete | read | rotate | export | import | rollback
    secretName: text('secret_name').notNull(),     // '*' for vault-wide ops (export/import/rotate)
    version: integer('version').notNull(),         // version AFTER the operation (0 for vault-wide)
    status: text('status').notNull(),              // success | failure | partial
    errorMessage: text('error_message'),           // null on success
    initiatedBy: text('initiated_by').notNull(),   // system | api
    timestamp: text('timestamp').notNull().default(sql`CURRENT_TIMESTAMP`),
    metadata: text('metadata'),                    // JSON: rotation progress, rollback-from, etc.
});

// =============================================================================
// Edge Secret Versions (local vault — Phase 2: per-secret version history for
// rollback support; one row per write, only the `is_active` row matches edge_secrets)
// =============================================================================

export const edgeSecretVersions = sqliteTable('edge_secret_versions', {
    id: text('id').primaryKey(),
    secretName: text('secret_name').notNull(),
    version: integer('version').notNull(),
    value: text('value').notNull(),                // AES-256-GCM ciphertext (base64) — same format as edge_secrets
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    createdVia: text('created_via').notNull(),     // create | update | rotate | rollback
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
});

// =============================================================================
// Inferred Types
// =============================================================================

export type NewPublishedPage = typeof publishedPages.$inferInsert;
export type PublishedPageRow = typeof publishedPages.$inferSelect;
export type WorkflowRow = typeof workflowsTable.$inferSelect;
export type ExecutionRow = typeof executionsTable.$inferSelect;
export type EdgeLogRow = typeof edgeLogsTable.$inferSelect;
export type NewEdgeLog = typeof edgeLogsTable.$inferInsert;
export type AgentToolRow = typeof agentToolsTable.$inferSelect;
export type NewAgentTool = typeof agentToolsTable.$inferInsert;
export type TenantSecretRow = typeof tenantSecrets.$inferSelect;
export type EdgeSecretRow = typeof edgeSecrets.$inferSelect;
export type EdgeSecretAuditRow = typeof edgeSecretAudit.$inferSelect;
export type EdgeSecretVersionRow = typeof edgeSecretVersions.$inferSelect;
