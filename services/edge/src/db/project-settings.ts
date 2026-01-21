/**
 * Project Settings Store
 * 
 * Local storage for project-level settings in Edge.
 * Ensures Edge is self-sufficient post-publish (no FastAPI calls at runtime).
 * Settings are synced during publish or via /api/import/settings endpoint.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql, eq } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// =============================================================================
// Schema Definition
// =============================================================================

export const projectSettings = sqliteTable('project_settings', {
    id: text('id').primaryKey().default('default'),

    // Branding
    faviconUrl: text('favicon_url'),  // Custom favicon URL or null for default
    logoUrl: text('logo_url'),        // Site logo

    // Site info
    siteName: text('site_name'),
    siteDescription: text('site_description'),
    appUrl: text('app_url'),          // Public app URL

    // Timestamps
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type ProjectSettings = typeof projectSettings.$inferSelect;
export type NewProjectSettings = typeof projectSettings.$inferInsert;

// Default favicon path (Frontbase logo)
export const DEFAULT_FAVICON = '/static/icon.png';

// =============================================================================
// Database Client (reuses pages.db)
// =============================================================================

let db: ReturnType<typeof drizzle> | null = null;

function getSettingsDb() {
    if (!db) {
        const client = createClient({
            url: process.env.PAGES_DB_URL || 'file:./data/pages.db',
        });
        db = drizzle(client);
    }
    return db;
}

// =============================================================================
// Initialize Database
// =============================================================================

export async function initProjectSettingsDb() {
    const database = getSettingsDb();

    // Create table if not exists
    await database.run(sql`
        CREATE TABLE IF NOT EXISTS project_settings (
            id TEXT PRIMARY KEY DEFAULT 'default',
            favicon_url TEXT,
            logo_url TEXT,
            site_name TEXT,
            site_description TEXT,
            app_url TEXT,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('⚙️ Project settings database initialized');
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get project settings (returns defaults if not set)
 */
export async function getProjectSettings(): Promise<ProjectSettings> {
    const database = getSettingsDb();

    const record = await database.select()
        .from(projectSettings)
        .where(eq(projectSettings.id, 'default'))
        .get();

    if (!record) {
        return {
            id: 'default',
            faviconUrl: null,
            logoUrl: null,
            siteName: null,
            siteDescription: null,
            appUrl: null,
            updatedAt: new Date().toISOString(),
        };
    }

    return record;
}

/**
 * Get favicon URL (with fallback to default)
 */
export async function getFaviconUrl(): Promise<string> {
    const settings = await getProjectSettings();
    return settings.faviconUrl || DEFAULT_FAVICON;
}

/**
 * Update project settings
 */
export async function updateProjectSettings(
    updates: Partial<Omit<ProjectSettings, 'id' | 'updatedAt'>>
): Promise<ProjectSettings> {
    const database = getSettingsDb();

    // Check if settings exist
    const existing = await database.select()
        .from(projectSettings)
        .where(eq(projectSettings.id, 'default'))
        .get();

    if (existing) {
        // Update
        await database.update(projectSettings)
            .set({
                ...updates,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(projectSettings.id, 'default'));
    } else {
        // Insert
        await database.insert(projectSettings).values({
            id: 'default',
            ...updates,
            updatedAt: new Date().toISOString(),
        });
    }

    console.log('⚙️ Project settings updated');
    return getProjectSettings();
}
