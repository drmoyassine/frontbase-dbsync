/**
 * Database Connection - Universal HTTP-First Layer
 * 
 * For LOCAL DEVELOPMENT: Uses LibSQL (SQLite) - single driver type
 * For PRODUCTION/EDGE: Environment determines driver:
 *   - DB_TYPE=neon: Neon PostgreSQL (HTTP)
 *   - DB_TYPE=turso: Turso SQLite (HTTP)
 *   - DB_TYPE=sqlite: Local SQLite file
 * 
 * Edge-compatible: No Node.js-specific dependencies (fs, path removed)
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

// Database type from environment
const dbType = process.env.DB_TYPE || 'sqlite';

// For local development, we use LibSQL which is compatible with:
// - Local SQLite files (file: protocol)
// - Turso remote databases (https: protocol)
// This gives us a single driver type and eliminates union type issues

let connectionUrl: string;
let authToken: string | undefined;

if (dbType === 'turso') {
    // Turso Remote SQLite (HTTP-first, Edge-compatible)
    connectionUrl = process.env.TURSO_DATABASE_URL || '';
    authToken = process.env.TURSO_AUTH_TOKEN;
    if (!connectionUrl) {
        throw new Error('TURSO_DATABASE_URL is required for Turso connection');
    }
    console.log('📦 Connected to Turso SQLite (HTTP)');
} else {
    // Local SQLite via libsql (for development)
    const sqlitePath = process.env.SQLITE_PATH || './data/actions.db';
    connectionUrl = `file:${sqlitePath}`;
    console.log(`📦 Connected to SQLite: ${sqlitePath}`);
}

// Create the client with single driver type
const client = createClient({
    url: connectionUrl,
    authToken
});

// Single driver type - no union!
export const db = drizzle(client, { schema });
export type DbClient = typeof db;
