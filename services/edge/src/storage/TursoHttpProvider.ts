/**
 * TursoHttpProvider — Remote Turso DB implementation of IStateProvider
 * 
 * Thin subclass of DrizzleStateProvider — only provides the DB connection
 * (lazy init for CF Workers compatibility) and migration runner.
 * All CRUD logic lives in the shared base class.
 * 
 * Env vars:
 * - FRONTBASE_STATE_DB_URL: Turso database URL (e.g., libsql://your-db.turso.io)
 * - FRONTBASE_STATE_DB_TOKEN: Turso auth token
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — reads from Turso only, never FastAPI.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import { DrizzleStateProvider } from './DrizzleStateProvider';
import { runMigrations } from './edge-migrations';
import { getStateDbConfig } from '../config/env.js';

export class TursoHttpProvider extends DrizzleStateProvider {
    private _db: ReturnType<typeof drizzle> | null = null;

    /**
     * Lazy DB accessor — creates client on first use.
     * On CF Workers, env vars aren't available at module eval time.
     */
    protected getDb(): ReturnType<typeof drizzle> {
        if (!this._db) {
            const cfg = getStateDbConfig();
            const url = cfg.url;
            const authToken = cfg.token;

            if (!url) {
                throw new Error(
                    '[TursoHttpProvider] FRONTBASE_STATE_DB.url is required. ' +
                    'Set FRONTBASE_STATE_DB JSON env var with url and token.'
                );
            }

            const client = createClient({ url, authToken });
            this._db = drizzle(client);
            console.log(`☁️ TursoHttpProvider connected to: ${url.substring(0, 40)}...`);
        }
        return this._db;
    }

    async init(): Promise<void> {
        await runMigrations(
            async (sqlStr) => { await this.getDb().run(sql.raw(sqlStr)); },
            'Turso'
        );
        console.log('☁️ State DB initialized (Turso)');
    }

    async initSettings(): Promise<void> {
        console.log('☁️ Project settings table initialized (Turso)');
    }
}
