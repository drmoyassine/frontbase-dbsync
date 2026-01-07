/**
 * Drizzle ORM Schema for Actions Engine
 * 
 * Stores published workflows and execution history.
 * Compatible with both SQLite and PostgreSQL.
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Published Workflows
export const workflows = sqliteTable('workflows', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    triggerType: text('trigger_type').notNull(), // manual, http_webhook, scheduled, data_change
    triggerConfig: text('trigger_config'), // JSON: cron, table, etc.
    nodes: text('nodes').notNull(), // JSON array of nodes
    edges: text('edges').notNull(), // JSON array of edges
    version: integer('version').notNull().default(1),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
    publishedBy: text('published_by'),
});

// Workflow Executions
export const executions = sqliteTable('executions', {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').notNull().references(() => workflows.id),
    status: text('status').notNull(), // started, executing, completed, error, cancelled
    triggerType: text('trigger_type').notNull(),
    triggerPayload: text('trigger_payload'), // JSON: input data
    nodeExecutions: text('node_executions'), // JSON: per-node status
    result: text('result'), // JSON: final output
    error: text('error'),
    usage: real('usage').default(0), // compute credits
    startedAt: text('started_at').notNull().$defaultFn(() => new Date().toISOString()),
    endedAt: text('ended_at'),
});

// Execution Type exports for infer
export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
