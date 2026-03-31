/**
 * Edge Schema Migrations
 * 
 * Versioned migration system that works identically against:
 * - Local SQLite (better-sqlite3 via Drizzle)
 * - Remote Turso (@libsql/client)
 * 
 * Migrations are checked and applied during provider init().
 * Both providers stay in sync automatically.
 * 
 * To add a new migration:
 *   1. Add entry to MIGRATIONS array with next version number
 *   2. Include all SQL statements needed
 *   3. Both local and cloud DBs will auto-migrate on next startup
 */

// =============================================================================
// Migration Definitions
// =============================================================================

export interface Migration {
    version: number;
    description: string;
    sql: string[];
}

export const MIGRATIONS: Migration[] = [
    {
        version: 1,
        description: 'Initial schema — published_pages + project_settings',
        sql: [
            // Schema version tracking
            `CREATE TABLE IF NOT EXISTS _schema_version (
                version INTEGER PRIMARY KEY,
                description TEXT,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )`,

            // Published pages
            `CREATE TABLE IF NOT EXISTS published_pages (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                title TEXT,
                description TEXT,
                layout_data TEXT NOT NULL,
                seo_data TEXT,
                datasources TEXT,
                css_bundle TEXT,
                version INTEGER NOT NULL DEFAULT 1,
                published_at TEXT NOT NULL,
                is_public INTEGER NOT NULL DEFAULT 1,
                is_homepage INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,

            // Indexes
            `CREATE INDEX IF NOT EXISTS idx_published_pages_slug ON published_pages(slug)`,
            `CREATE INDEX IF NOT EXISTS idx_published_pages_homepage ON published_pages(is_homepage)`,

            // Project settings
            `CREATE TABLE IF NOT EXISTS project_settings (
                id TEXT PRIMARY KEY DEFAULT 'default',
                favicon_url TEXT,
                logo_url TEXT,
                site_name TEXT,
                site_description TEXT,
                app_url TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,

            // Default settings row
            `INSERT OR IGNORE INTO project_settings (id, updated_at) VALUES ('default', datetime('now'))`,
        ],
    },
    {
        version: 2,
        description: 'Add workflows + executions tables',
        sql: [
            `CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                trigger_type TEXT NOT NULL,
                trigger_config TEXT,
                nodes TEXT NOT NULL,
                edges TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                published_by TEXT
            )`,

            `CREATE TABLE IF NOT EXISTS executions (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL REFERENCES workflows(id),
                status TEXT NOT NULL,
                trigger_type TEXT NOT NULL,
                trigger_payload TEXT,
                node_executions TEXT,
                result TEXT,
                error TEXT,
                usage REAL DEFAULT 0,
                started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ended_at TEXT
            )`,

            `CREATE INDEX IF NOT EXISTS idx_executions_workflow ON executions(workflow_id)`,
            `CREATE INDEX IF NOT EXISTS idx_executions_started ON executions(started_at)`,
        ],
    },
    {
        version: 3,
        description: 'Add content_hash column to published_pages',
        sql: [
            `ALTER TABLE published_pages ADD COLUMN content_hash TEXT`,
        ],
    },
    {
        version: 4,
        description: 'Add settings column to workflows',
        sql: [
            `ALTER TABLE workflows ADD COLUMN settings TEXT`,
        ],
    },
    {
        version: 5,
        description: 'Add dead_letters table for DLQ',
        sql: [
            `CREATE TABLE IF NOT EXISTS dead_letters (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                execution_id TEXT NOT NULL,
                error TEXT,
                payload TEXT,
                retry_count INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            )`,
            `CREATE INDEX IF NOT EXISTS idx_dead_letters_workflow ON dead_letters(workflow_id)`,
        ],
    },
    {
        version: 6,
        description: 'Add edge_logs table for persisted runtime logs',
        sql: [
            `CREATE TABLE IF NOT EXISTS edge_logs (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                source TEXT DEFAULT 'runtime',
                metadata TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE INDEX IF NOT EXISTS idx_edge_logs_timestamp ON edge_logs(timestamp DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_edge_logs_level ON edge_logs(level)`,
        ],
    },
    {
        version: 7,
        description: 'Add auth_forms column to project_settings',
        sql: [
            `ALTER TABLE project_settings ADD COLUMN auth_forms TEXT`,
        ],
    },
    {
        version: 8,
        description: 'Add users_config column to project_settings',
        sql: [
            `ALTER TABLE project_settings ADD COLUMN users_config TEXT`,
        ],
    },
];

// =============================================================================
// Migration Runner
// =============================================================================

export type SqlExecutor = (sql: string) => Promise<void>;

/**
 * Run pending migrations using the provided SQL executor function.
 * Works with any database backend — caller provides the execute function.
 * 
 * @param execute - async function that runs a single SQL statement
 * @param providerName - for logging (e.g. "LocalSqlite" or "Turso")
 */
export async function runMigrations(
    execute: SqlExecutor,
    providerName: string
): Promise<void> {
    // Ensure _schema_version table exists (idempotent)
    await execute(`CREATE TABLE IF NOT EXISTS _schema_version (
        version INTEGER PRIMARY KEY,
        description TEXT,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    // Get current version
    // We can't easily read results through a generic executor,
    // so we use a different approach: try each migration and rely on
    // the INSERT OR IGNORE to skip already-applied versions
    let appliedCount = 0;

    for (const migration of MIGRATIONS) {
        try {
            // Run the migration SQL first — most statements are idempotent
            // (CREATE IF NOT EXISTS, INSERT OR IGNORE), but ALTER TABLE
            // ADD COLUMN is not. We catch "duplicate column" errors gracefully.
            for (const sqlStmt of migration.sql) {
                try {
                    await execute(sqlStmt);
                } catch (sqlError: any) {
                    const msg = String(sqlError?.message || sqlError || '');
                    if (msg.includes('duplicate column')) {
                        console.log(`[${providerName}:Migration] Column already exists (v${migration.version}), skipping.`);
                    } else {
                        throw sqlError;
                    }
                }
            }

            // Mark version as applied AFTER SQL succeeds
            // INSERT OR IGNORE so re-runs are idempotent
            await execute(
                `INSERT OR IGNORE INTO _schema_version (version, description) 
                 VALUES (${migration.version}, '${migration.description.replace(/'/g, "''")}')`
            );
            appliedCount++;
        } catch (error) {
            console.error(`[${providerName}:Migration] Failed at v${migration.version}: ${error}`);
            throw error;
        }
    }

    const latestVersion = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
    console.log(`[${providerName}:Migration] Schema at v${latestVersion} (${appliedCount} migrations checked)`);
}
