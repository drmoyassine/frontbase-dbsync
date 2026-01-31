// src/db/pages-store.ts
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";
var publishedPages = sqliteTable("published_pages", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  title: text("title"),
  description: text("description"),
  // Stored as JSON strings
  layoutData: text("layout_data").notNull(),
  seoData: text("seo_data"),
  datasources: text("datasources"),
  // CSS Bundle (tree-shaken CSS from FastAPI publish)
  cssBundle: text("css_bundle"),
  // Versioning
  version: integer("version").notNull().default(1),
  publishedAt: text("published_at").notNull(),
  // Flags
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
  isHomepage: integer("is_homepage", { mode: "boolean" }).notNull().default(false),
  // Timestamps
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});
var db = null;
function getPagesDb() {
  if (!db) {
    const client = createClient({
      url: process.env.PAGES_DB_URL || "file:./data/pages.db"
    });
    db = drizzle(client);
  }
  return db;
}
async function initPagesDb() {
  const database = getPagesDb();
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
  try {
    await database.run(sql`ALTER TABLE published_pages ADD COLUMN css_bundle TEXT`);
    console.log("\u{1F4C4} Added css_bundle column to published_pages");
  } catch (e) {
  }
  console.log("\u{1F4C4} Published pages database initialized");
}
async function upsertPublishedPage(page) {
  const database = getPagesDb();
  const record = {
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
    isHomepage: page.isHomepage
  };
  const existing = await database.select().from(publishedPages).where(eq(publishedPages.id, page.id)).get();
  if (existing) {
    await database.update(publishedPages).set({
      ...record,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }).where(eq(publishedPages.id, page.id));
    console.log(`\u{1F4DD} Updated published page: ${page.slug} (v${page.version})`);
  } else {
    await database.insert(publishedPages).values(record);
    console.log(`\u{1F4C4} Created published page: ${page.slug} (v${page.version})`);
  }
  return { success: true, version: page.version };
}
async function getPublishedPageBySlug(slug) {
  const database = getPagesDb();
  const record = await database.select().from(publishedPages).where(eq(publishedPages.slug, slug)).get();
  if (!record) return null;
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    title: record.title || void 0,
    description: record.description || void 0,
    layoutData: JSON.parse(record.layoutData),
    seoData: record.seoData ? JSON.parse(record.seoData) : void 0,
    datasources: record.datasources ? JSON.parse(record.datasources) : void 0,
    cssBundle: record.cssBundle || void 0,
    version: record.version,
    publishedAt: record.publishedAt,
    isPublic: record.isPublic,
    isHomepage: record.isHomepage
  };
}
async function getHomepage() {
  const database = getPagesDb();
  const record = await database.select().from(publishedPages).where(eq(publishedPages.isHomepage, true)).get();
  if (!record) return null;
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    title: record.title || void 0,
    description: record.description || void 0,
    layoutData: JSON.parse(record.layoutData),
    seoData: record.seoData ? JSON.parse(record.seoData) : void 0,
    datasources: record.datasources ? JSON.parse(record.datasources) : void 0,
    cssBundle: record.cssBundle || void 0,
    version: record.version,
    publishedAt: record.publishedAt,
    isPublic: record.isPublic,
    isHomepage: record.isHomepage
  };
}
async function deletePublishedPage(slug) {
  const database = getPagesDb();
  const result = await database.delete(publishedPages).where(eq(publishedPages.slug, slug));
  return true;
}
async function listPublishedPages() {
  const database = getPagesDb();
  const records = await database.select({
    slug: publishedPages.slug,
    name: publishedPages.name,
    version: publishedPages.version
  }).from(publishedPages);
  return records;
}

export {
  publishedPages,
  getPagesDb,
  initPagesDb,
  upsertPublishedPage,
  getPublishedPageBySlug,
  getHomepage,
  deletePublishedPage,
  listPublishedPages
};
