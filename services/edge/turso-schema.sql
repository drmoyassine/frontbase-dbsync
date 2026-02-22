-- =============================================================================
-- Turso Edge State DB Schema
-- =============================================================================
-- This schema defines the edge state database that lives in the user's Turso
-- instance. It mirrors the local SQLite schema used by LocalSqliteProvider.
--
-- Run this once on your Turso database to set up the edge state tables.
-- Usage: turso db shell <your-db> < turso-schema.sql
-- =============================================================================

-- Published pages (compiled page bundles pushed from the control plane)
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
);

-- Index for fast slug lookups (primary access pattern for SSR)
CREATE INDEX IF NOT EXISTS idx_published_pages_slug ON published_pages(slug);

-- Index for homepage lookup
CREATE INDEX IF NOT EXISTS idx_published_pages_homepage ON published_pages(is_homepage);

-- Project settings (branding, favicon, site info)
CREATE TABLE IF NOT EXISTS project_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    favicon_url TEXT,
    logo_url TEXT,
    site_name TEXT,
    site_description TEXT,
    app_url TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings row
INSERT OR IGNORE INTO project_settings (id, updated_at) VALUES ('default', datetime('now'));
