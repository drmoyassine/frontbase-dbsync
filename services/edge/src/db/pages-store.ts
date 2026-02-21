/**
 * Published Pages Store (Phase 2)
 * 
 * Local storage layer for published pages.
 * Uses SQLite/LibSQL for local development, D1 for Edge deployment.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { PublishPage, PageLayout, SeoData, DatasourceConfig } from '../schemas/publish';

// =============================================================================
// Schema Definition
// =============================================================================

export const publishedPages = sqliteTable('published_pages', {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    title: text('title'),
    description: text('description'),

    // Stored as JSON strings
    layoutData: text('layout_data').notNull(),
    seoData: text('seo_data'),
    datasources: text('datasources'),

    // CSS Bundle (tree-shaken CSS from FastAPI publish)
    cssBundle: text('css_bundle'),

    // Versioning
    version: integer('version').notNull().default(1),
    publishedAt: text('published_at').notNull(),

    // Flags
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(true),
    isHomepage: integer('is_homepage', { mode: 'boolean' }).notNull().default(false),

    // Timestamps
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type PublishedPage = typeof publishedPages.$inferSelect;
export type NewPublishedPage = typeof publishedPages.$inferInsert;

// =============================================================================
// Database Client
// =============================================================================

let db: ReturnType<typeof drizzle> | null = null;

export function getPagesDb() {
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

export async function initPagesDb() {
    const database = getPagesDb();

    // Create table if not exists
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

// =============================================================================
// CRUD Operations
// =============================================================================

import { eq } from 'drizzle-orm';

/**
 * Upsert a published page (insert or update)
 */
export async function upsertPublishedPage(page: PublishPage): Promise<{ success: boolean; version: number }> {
    const database = getPagesDb();

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

    // Check if page exists
    const existing = await database.select()
        .from(publishedPages)
        .where(eq(publishedPages.id, page.id))
        .get();

    if (existing) {
        // Update existing page
        await database.update(publishedPages)
            .set({
                ...record,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(publishedPages.id, page.id));

        console.log(`📝 Updated published page: ${page.slug} (v${page.version}), cssBundle: ${page.cssBundle ? page.cssBundle.length + ' bytes' : 'null'}`);
    } else {
        // Insert new page
        await database.insert(publishedPages).values(record);
        console.log(`📄 Created published page: ${page.slug} (v${page.version}), cssBundle: ${page.cssBundle ? page.cssBundle.length + ' bytes' : 'null'}`);
    }

    return { success: true, version: page.version };
}

/**
 * Get page by slug
 */
export async function getPublishedPageBySlug(slug: string): Promise<PublishPage | null> {
    const database = getPagesDb();

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

/**
 * Get homepage
 */
export async function getHomepage(): Promise<PublishPage | null> {
    const database = getPagesDb();

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

/**
 * Delete page by slug
 */
export async function deletePublishedPage(slug: string): Promise<boolean> {
    const database = getPagesDb();

    const result = await database.delete(publishedPages)
        .where(eq(publishedPages.slug, slug));

    return true;
}

/**
 * List all published pages
 */
export async function listPublishedPages(): Promise<Array<{ slug: string; name: string; version: number }>> {
    const database = getPagesDb();

    const records = await database.select({
        slug: publishedPages.slug,
        name: publishedPages.name,
        version: publishedPages.version,
    }).from(publishedPages);

    return records;
}
