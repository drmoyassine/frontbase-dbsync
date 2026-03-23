/**
 * LocalSqliteProvider — Local SQLite/LibSQL implementation of IStateProvider
 * 
 * Thin subclass of DrizzleStateProvider — only provides the DB connection
 * and migration runner. All CRUD logic lives in the shared base class.
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — reads from local SQLite only.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import { DrizzleStateProvider } from './DrizzleStateProvider';
import { runMigrations } from './edge-migrations';
import { publishedPages, projectSettings } from './schema';

// Re-export for backward compatibility (some files may import from here)
export { publishedPages, projectSettings };

export class LocalSqliteProvider extends DrizzleStateProvider {
    private db: ReturnType<typeof drizzle> | null = null;

    protected getDb() {
        if (!this.db) {
            const client = createClient({
                url: process.env.PAGES_DB_URL || 'file:./data/pages.db',
            });
            this.db = drizzle(client);
        }
        return this.db;
    }

    async init(): Promise<void> {
        const database = this.getDb();
        await runMigrations(
            async (sqlStr) => { await database.run(sql.raw(sqlStr)); },
            'LocalSqlite'
        );
        console.log('📄 State DB initialized (local SQLite)');
    }

    async initSettings(): Promise<void> {
        console.log('⚙️ Project settings database initialized');
    }
}
