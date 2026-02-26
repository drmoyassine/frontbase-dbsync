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
            // Check if already applied by trying to insert the version record
            // If it already exists, INSERT OR IGNORE silently skips
            await execute(
                `INSERT OR IGNORE INTO _schema_version (version, description) 
                 VALUES (${migration.version}, '${migration.description.replace(/'/g, "''")}')`
            );

            // Check if we actually inserted (i.e., this is a new migration)
            // We do this by running the migration SQL — CREATE IF NOT EXISTS
            // and INSERT OR IGNORE make this idempotent
            for (const sql of migration.sql) {
                await execute(sql);
            }
            appliedCount++;
        } catch (error) {
            console.error(`[${providerName}:Migration] Failed at v${migration.version}: ${error}`);
            throw error;
        }
    }

    const latestVersion = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
    console.log(`[${providerName}:Migration] Schema at v${latestVersion} (${appliedCount} migrations checked)`);
}
