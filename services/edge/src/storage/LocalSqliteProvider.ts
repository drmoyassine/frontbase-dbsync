/**
 * LocalSqliteProvider — Local SQLite/LibSQL implementation of IStateProvider
 * 
 * This is a refactor of the existing logic from:
 * - db/pages-store.ts (published pages CRUD)
 * - db/project-settings.ts (project settings CRUD)
 * 
 * Behavior is 100% identical to the original — just wrapped in the
 * IStateProvider interface so it can be swapped for TursoHttpProvider.
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — reads from local SQLite only.
 * AGENTS.md §2.2: Backward Compatibility — preserves all existing behavior.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql, eq } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { PublishPage, PageLayout, SeoData, DatasourceConfig } from '../schemas/publish';
import type { IStateProvider, ProjectSettingsData, PublishedPageSummary } from './IStateProvider';

// =============================================================================
// Schema Definitions (moved from pages-store.ts and project-settings.ts)
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
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const projectSettings = sqliteTable('project_settings', {
    id: text('id').primaryKey().default('default'),
    faviconUrl: text('favicon_url'),
    logoUrl: text('logo_url'),
    siteName: text('site_name'),
    siteDescription: text('site_description'),
    appUrl: text('app_url'),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

type PublishedPage = typeof publishedPages.$inferSelect;
type NewPublishedPage = typeof publishedPages.$inferInsert;

/** Default favicon path (Frontbase logo) */
const DEFAULT_FAVICON = '/static/icon.png';

// =============================================================================
// Provider Implementation
// =============================================================================

export class LocalSqliteProvider implements IStateProvider {
    private db: ReturnType<typeof drizzle> | null = null;

    /** Get or create the database connection */
    private getDb() {
        if (!this.db) {
            const client = createClient({
                url: process.env.PAGES_DB_URL || 'file:./data/pages.db',
            });
            this.db = drizzle(client);
        }
        return this.db;
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    async init(): Promise<void> {
        const database = this.getDb();

        // Create pages table
        await database.run(sql`
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

        // Migration: Add css_bundle column if it doesn't exist
        try {
            await database.run(sql`ALTER TABLE published_pages ADD COLUMN css_bundle TEXT`);
            console.log('📄 Added css_bundle column to published_pages');
        } catch (e) {
            // Column already exists, ignore
        }

        console.log('📄 Published pages database initialized');
    }

    async initSettings(): Promise<void> {
        const database = this.getDb();

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

    // =========================================================================
    // Pages CRUD
    // =========================================================================

    async upsertPage(page: PublishPage): Promise<{ success: boolean; version: number }> {
        const database = this.getDb();

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

        const existing = await database.select()
            .from(publishedPages)
            .where(eq(publishedPages.id, page.id))
            .get();

        if (existing) {
            await database.update(publishedPages)
                .set({
                    ...record,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(publishedPages.id, page.id));

            console.log(`📝 Updated published page: ${page.slug} (v${page.version}), cssBundle: ${page.cssBundle ? page.cssBundle.length + ' bytes' : 'null'}`);
        } else {
            await database.insert(publishedPages).values(record);
            console.log(`📄 Created published page: ${page.slug} (v${page.version}), cssBundle: ${page.cssBundle ? page.cssBundle.length + ' bytes' : 'null'}`);
        }

        return { success: true, version: page.version };
    }

    async getPageBySlug(slug: string): Promise<PublishPage | null> {
        const database = this.getDb();

        const record = await database.select()
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
        const database = this.getDb();

        const record = await database.select()
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
        console.log(`[pages-store] getHomepage: cssBundle present: ${!!result.cssBundle}, length: ${result.cssBundle?.length || 0}, raw column: ${record.cssBundle ? record.cssBundle.length + ' bytes' : 'NULL'}`);
        return result;
    }

    async deletePage(slug: string): Promise<boolean> {
        const database = this.getDb();

        await database.delete(publishedPages)
            .where(eq(publishedPages.slug, slug));

        return true;
    }

    async listPages(): Promise<PublishedPageSummary[]> {
        const database = this.getDb();

        const records = await database.select({
            slug: publishedPages.slug,
            name: publishedPages.name,
            version: publishedPages.version,
        }).from(publishedPages);

        return records;
    }

    // =========================================================================
    // Project Settings CRUD
    // =========================================================================

    async getProjectSettings(): Promise<ProjectSettingsData> {
        const database = this.getDb();

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

    async getFaviconUrl(): Promise<string> {
        const settings = await this.getProjectSettings();
        return settings.faviconUrl || DEFAULT_FAVICON;
    }

    async updateProjectSettings(
        updates: Partial<Omit<ProjectSettingsData, 'id' | 'updatedAt'>>
    ): Promise<ProjectSettingsData> {
        const database = this.getDb();

        const existing = await database.select()
            .from(projectSettings)
            .where(eq(projectSettings.id, 'default'))
            .get();

        if (existing) {
            await database.update(projectSettings)
                .set({
                    ...updates,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(projectSettings.id, 'default'));
        } else {
            await database.insert(projectSettings).values({
                id: 'default',
                ...updates,
                updatedAt: new Date().toISOString(),
            });
        }

        console.log('⚙️ Project settings updated');
        return this.getProjectSettings();
    }
}
