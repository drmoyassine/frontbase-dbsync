/**
 * TursoHttpProvider — Remote Turso DB implementation of IStateProvider
 * 
 * Connects to a user-owned Turso database via @libsql/client over HTTP.
 * Used when FRONTBASE_ENV=cloud. The same schema is used as LocalSqliteProvider —
 * both are LibSQL-compatible SQLite databases.
 * 
 * Env vars:
 * - FRONTBASE_STATE_DB_URL: Turso database URL (e.g., libsql://your-db.turso.io)
 * - FRONTBASE_STATE_DB_TOKEN: Turso auth token
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — reads from Turso only, never FastAPI.
 * AGENTS.md §2.4: Zero Runtime Coupling — no knowledge of FastAPI internals.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql, eq } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { PublishPage, PageLayout, SeoData, DatasourceConfig } from '../schemas/publish';
import type { IStateProvider, ProjectSettingsData, PublishedPageSummary } from './IStateProvider';

// =============================================================================
// Schema Definitions (identical to LocalSqliteProvider — same DB schema)
// =============================================================================

const publishedPages = sqliteTable('published_pages', {
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
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

const projectSettings = sqliteTable('project_settings', {
    id: text('id').primaryKey().default('default'),
    faviconUrl: text('favicon_url'),
    logoUrl: text('logo_url'),
    siteName: text('site_name'),
    siteDescription: text('site_description'),
    appUrl: text('app_url'),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

type NewPublishedPage = typeof publishedPages.$inferInsert;

/** Default favicon path (Frontbase logo) */
const DEFAULT_FAVICON = '/static/icon.png';

// =============================================================================
// Provider Implementation
// =============================================================================

export class TursoHttpProvider implements IStateProvider {
    private db: ReturnType<typeof drizzle>;

    constructor() {
        const url = process.env.FRONTBASE_STATE_DB_URL;
        const authToken = process.env.FRONTBASE_STATE_DB_TOKEN;

        if (!url) {
            throw new Error(
                '[TursoHttpProvider] FRONTBASE_STATE_DB_URL is required when FRONTBASE_ENV=cloud. ' +
                'Set this to your Turso database URL (e.g., libsql://your-db.turso.io).'
            );
        }

        const client = createClient({ url, authToken });
        this.db = drizzle(client);
        console.log(`☁️ TursoHttpProvider connected to: ${url.substring(0, 40)}...`);
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    async init(): Promise<void> {
        // Create pages table (same DDL as LocalSqliteProvider)
        await this.db.run(sql`
            CREATE TABLE IF NOT EXISTS published_pages (
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
            )
        `);

        try {
            await this.db.run(sql`ALTER TABLE published_pages ADD COLUMN css_bundle TEXT`);
            console.log('☁️ Added css_bundle column to published_pages (Turso)');
        } catch (e) {
            // Column already exists
        }

        console.log('☁️ Published pages table initialized (Turso)');
    }

    async initSettings(): Promise<void> {
        await this.db.run(sql`
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
        console.log('☁️ Project settings table initialized (Turso)');
    }

    // =========================================================================
    // Pages CRUD
    // =========================================================================

    async upsertPage(page: PublishPage): Promise<{ success: boolean; version: number }> {
        const record: NewPublishedPage = {
            id: page.id,
            slug: page.slug,
            name: page.name,
            title: page.title || null,
            description: page.description || null,
            layoutData: JSON.stringify(page.layoutData),
            seoData: page.seoData ? JSON.stringify(page.seoData) : null,
            datasources: page.datasources ? JSON.stringify(page.datasources) : null,
            cssBundle: page.cssBundle || null,
            version: page.version,
            publishedAt: page.publishedAt,
            isPublic: page.isPublic,
            isHomepage: page.isHomepage,
        };

        const existing = await this.db.select()
            .from(publishedPages)
            .where(eq(publishedPages.id, page.id))
            .get();

        if (existing) {
            await this.db.update(publishedPages)
                .set({
                    ...record,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(publishedPages.id, page.id));

            console.log(`☁️ Updated page (Turso): ${page.slug} (v${page.version})`);
        } else {
            await this.db.insert(publishedPages).values(record);
            console.log(`☁️ Created page (Turso): ${page.slug} (v${page.version})`);
        }

        return { success: true, version: page.version };
    }

    async getPageBySlug(slug: string): Promise<PublishPage | null> {
        const record = await this.db.select()
            .from(publishedPages)
            .where(eq(publishedPages.slug, slug))
            .get();

        if (!record) return null;

        return {
            id: record.id,
            slug: record.slug,
            name: record.name,
            title: record.title || undefined,
            description: record.description || undefined,
            layoutData: JSON.parse(record.layoutData) as PageLayout,
            seoData: record.seoData ? JSON.parse(record.seoData) as SeoData : undefined,
            datasources: record.datasources ? JSON.parse(record.datasources) as DatasourceConfig[] : undefined,
            cssBundle: record.cssBundle || undefined,
            version: record.version,
            publishedAt: record.publishedAt,
            isPublic: record.isPublic,
            isHomepage: record.isHomepage,
        };
    }

    async getHomepage(): Promise<PublishPage | null> {
        const record = await this.db.select()
            .from(publishedPages)
            .where(eq(publishedPages.isHomepage, true))
            .get();

        if (!record) return null;

        const result = {
            id: record.id,
            slug: record.slug,
            name: record.name,
            title: record.title || undefined,
            description: record.description || undefined,
            layoutData: JSON.parse(record.layoutData) as PageLayout,
            seoData: record.seoData ? JSON.parse(record.seoData) as SeoData : undefined,
            datasources: record.datasources ? JSON.parse(record.datasources) as DatasourceConfig[] : undefined,
            cssBundle: record.cssBundle || undefined,
            version: record.version,
            publishedAt: record.publishedAt,
            isPublic: record.isPublic,
            isHomepage: record.isHomepage,
        };
        console.log(`[turso-provider] getHomepage: cssBundle present: ${!!result.cssBundle}, length: ${result.cssBundle?.length || 0}`);
        return result;
    }

    async deletePage(slug: string): Promise<boolean> {
        await this.db.delete(publishedPages)
            .where(eq(publishedPages.slug, slug));
        return true;
    }

    async listPages(): Promise<PublishedPageSummary[]> {
        return await this.db.select({
            slug: publishedPages.slug,
            name: publishedPages.name,
            version: publishedPages.version,
        }).from(publishedPages);
    }

    // =========================================================================
    // Project Settings CRUD
    // =========================================================================

    async getProjectSettings(): Promise<ProjectSettingsData> {
        const record = await this.db.select()
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

    async getFaviconUrl(): Promise<string> {
        const settings = await this.getProjectSettings();
        return settings.faviconUrl || DEFAULT_FAVICON;
    }

    async updateProjectSettings(
        updates: Partial<Omit<ProjectSettingsData, 'id' | 'updatedAt'>>
    ): Promise<ProjectSettingsData> {
        const existing = await this.db.select()
            .from(projectSettings)
            .where(eq(projectSettings.id, 'default'))
            .get();

        if (existing) {
            await this.db.update(projectSettings)
                .set({
                    ...updates,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(projectSettings.id, 'default'));
        } else {
            await this.db.insert(projectSettings).values({
                id: 'default',
                ...updates,
                updatedAt: new Date().toISOString(),
            });
        }

        console.log('☁️ Project settings updated (Turso)');
        return this.getProjectSettings();
    }
}
