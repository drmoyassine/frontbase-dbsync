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
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// =============================================================================
// Published Pages
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
// Inferred Types
// =============================================================================

export type NewPublishedPage = typeof publishedPages.$inferInsert;
export type PublishedPageRow = typeof publishedPages.$inferSelect;
export type WorkflowRow = typeof workflowsTable.$inferSelect;
export type ExecutionRow = typeof executionsTable.$inferSelect;
export type EdgeLogRow = typeof edgeLogsTable.$inferSelect;
export type NewEdgeLog = typeof edgeLogsTable.$inferInsert;
