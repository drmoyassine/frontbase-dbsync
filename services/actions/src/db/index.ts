/**
 * Database Connection - DB Agnostic Layer
 * 
 * Switches between SQLite (via libsql) and PostgreSQL based on environment.
 */

import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { createClient } from '@libsql/client';
import postgres from 'postgres';
import * as schema from './schema';

const dbType = process.env.DB_TYPE || 'sqlite';

let db: ReturnType<typeof drizzleLibsql> | ReturnType<typeof drizzlePostgres>;

if (dbType === 'postgres') {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is required for PostgreSQL connection');
    }
    const client = postgres(connectionString);
    db = drizzlePostgres(client, { schema }) as any;
    console.log('📦 Connected to PostgreSQL');
} else {
    // Use file: protocol for local SQLite with relative path
    const sqlitePath = process.env.SQLITE_PATH || './data/actions.db';

    // Ensure data directory exists
    const fs = await import('fs');
    const path = await import('path');
    const dataDir = path.dirname(sqlitePath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Create libsql client (pure JS, no native dependencies)
    const client = createClient({
        url: `file:${sqlitePath}`,
    });

    db = drizzleLibsql(client, { schema });
    console.log(`📦 Connected to SQLite: ${sqlitePath}`);
}

export { db };
export type DbClient = typeof db;
