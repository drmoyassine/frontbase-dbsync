// src/db/project-settings.ts
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { sql, eq } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
var projectSettings = sqliteTable("project_settings", {
  id: text("id").primaryKey().default("default"),
  // Branding
  faviconUrl: text("favicon_url"),
  // Custom favicon URL or null for default
  logoUrl: text("logo_url"),
  // Site logo
  // Site info
  siteName: text("site_name"),
  siteDescription: text("site_description"),
  appUrl: text("app_url"),
  // Public app URL
  // Timestamps
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});
var DEFAULT_FAVICON = "/static/icon.png";
var db = null;
function getSettingsDb() {
  if (!db) {
    const client = createClient({
      url: process.env.PAGES_DB_URL || "file:./data/pages.db"
    });
    db = drizzle(client);
  }
  return db;
}
async function initProjectSettingsDb() {
  const database = getSettingsDb();
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
  console.log("\u2699\uFE0F Project settings database initialized");
}
async function getProjectSettings() {
  const database = getSettingsDb();
  const record = await database.select().from(projectSettings).where(eq(projectSettings.id, "default")).get();
  if (!record) {
    return {
      id: "default",
      faviconUrl: null,
      logoUrl: null,
      siteName: null,
      siteDescription: null,
      appUrl: null,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  return record;
}
async function getFaviconUrl() {
  const settings = await getProjectSettings();
  return settings.faviconUrl || DEFAULT_FAVICON;
}
async function updateProjectSettings(updates) {
  const database = getSettingsDb();
  const existing = await database.select().from(projectSettings).where(eq(projectSettings.id, "default")).get();
  if (existing) {
    await database.update(projectSettings).set({
      ...updates,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }).where(eq(projectSettings.id, "default"));
  } else {
    await database.insert(projectSettings).values({
      id: "default",
      ...updates,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  console.log("\u2699\uFE0F Project settings updated");
  return getProjectSettings();
}

export {
  projectSettings,
  DEFAULT_FAVICON,
  initProjectSettingsDb,
  getProjectSettings,
  getFaviconUrl,
  updateProjectSettings
};
