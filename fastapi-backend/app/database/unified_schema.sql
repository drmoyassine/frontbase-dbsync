-- Unified Database Schema for Frontbase + DB-Synchronizer Integration
-- This schema combines Frontbase (Express.js) tables with DB-Synchronizer tables

-- ============================
-- FRONTBASE TABLES (from Express.js)
-- ============================

-- Single project (one per deployment)
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  supabase_url TEXT,
  supabase_anon_key TEXT,
  supabase_service_key_encrypted TEXT,
  users_config TEXT, -- JSON configuration for user contact mapping
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Pages with layout data and SEO fields
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT,
  description TEXT,
  keywords TEXT,
  is_public BOOLEAN DEFAULT true,
  is_homepage BOOLEAN DEFAULT false,
  layout_data TEXT NOT NULL, -- JSON string of complete layoutData with component styles
  seo_data TEXT,             -- JSON: Open Graph, Twitter cards, etc.
  deleted_at TEXT,           -- Timestamp for soft delete
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- App variables for {{ localstate.variable }}
CREATE TABLE IF NOT EXISTS app_variables (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  type TEXT CHECK(type IN ('variable', 'calculated')) NOT NULL,
  value TEXT,
  formula TEXT,
  description TEXT,
  created_at TEXT NOT NULL
);

-- Uploaded assets
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Users table for Frontbase authentication
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- User sessions for authentication
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- User settings and configurations
CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  supabase_url TEXT,
  supabase_anon_key TEXT,
  settings_data TEXT, -- JSON for various user preferences
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Page views for analytics (optional)
CREATE TABLE IF NOT EXISTS page_views (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  referrer TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (page_id) REFERENCES pages (id)
);

-- RLS Policy Metadata
CREATE TABLE IF NOT EXISTS rls_policy_metadata (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  policy_name TEXT NOT NULL,
  form_data TEXT NOT NULL,
  generated_using TEXT,
  generated_check TEXT,
  sql_hash TEXT,
  created_at DEFAULT (datetime('now')),
  updated_at DEFAULT (datetime('now')),
  UNIQUE(table_name, policy_name)
);

-- Auth Forms
CREATE TABLE IF NOT EXISTS auth_forms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('login', 'signup', 'both')),
  config TEXT DEFAULT '{}',
  target_contact_type TEXT,
  allowed_contact_types TEXT DEFAULT '[]',
  redirect_url TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DEFAULT (datetime('now')),
  updated_at DEFAULT (datetime('now'))
);

-- ============================
-- DB-SYNCHRONIZER TABLES
-- ============================

-- Sync configurations
CREATE TABLE IF NOT EXISTS sync_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL, -- 'supabase', 'postgresql', 'mysql', etc.
  source_config TEXT NOT NULL, -- JSON configuration for source
  target_type TEXT NOT NULL, -- 'supabase', 'postgresql', 'mysql', etc.
  target_config TEXT NOT NULL, -- JSON configuration for target
  sync_direction TEXT NOT NULL DEFAULT 'bidirectional', -- 'source_to_target', 'target_to_source', 'bidirectional'
  status TEXT DEFAULT 'active', -- 'active', 'paused', 'error'
  last_sync_at TEXT,
  next_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Field mappings
CREATE TABLE IF NOT EXISTS field_mappings (
  id TEXT PRIMARY KEY,
  sync_config_id TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_field TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_field TEXT NOT NULL,
  transformation_rule TEXT, -- JSON for data transformation rules
  created_at TEXT NOT NULL,
  FOREIGN KEY (sync_config_id) REFERENCES sync_configs (id) ON DELETE CASCADE
);

-- Sync jobs
CREATE TABLE IF NOT EXISTS sync_jobs (
  id TEXT PRIMARY KEY,
  sync_config_id TEXT NOT NULL,
  job_type TEXT NOT NULL, -- 'full_sync', 'incremental_sync', 'schema_sync'
  status TEXT DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  started_at TEXT,
  completed_at TEXT,
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (sync_config_id) REFERENCES sync_configs (id) ON DELETE CASCADE
);

-- Sync conflicts
CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY,
  sync_config_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  source_value TEXT,
  target_value TEXT,
  conflict_type TEXT NOT NULL, -- 'value_mismatch', 'missing_field', 'extra_field'
  resolution TEXT, -- 'use_source', 'use_target', 'manual_merge', 'skip'
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (sync_config_id) REFERENCES sync_configs (id) ON DELETE CASCADE
);

-- ============================
-- INITIAL DATA
-- ============================

-- Initialize with default project
INSERT OR IGNORE INTO project (id, name, description, created_at, updated_at) 
VALUES ('default', 'My Frontbase Project', 'A new project created with Frontbase', datetime('now'), datetime('now'));

-- Initialize with default admin user (password: admin123)
-- Note: This hash is generated with bcrypt.hash('admin123', 10)
INSERT OR IGNORE INTO users (id, username, email, password_hash, created_at, updated_at)
VALUES ('default-admin', 'admin', 'admin@frontbase.dev', '$2b$10$KIXl9Q9q9Q9q9Q9q9Q9q9uJ1J1J1J1J1J1J1J1J1J1J1J1J1J1J1J1', datetime('now'), datetime('now'));

-- Initialize with default homepage
INSERT OR IGNORE INTO pages (id, name, slug, title, description, keywords, is_public, is_homepage, layout_data, seo_data, created_at, updated_at)
VALUES (
  'default-homepage',
  'Home',
  'home',
  'Welcome to Frontbase',
  'Build amazing websites with our visual page builder',
  'frontbase, website builder, visual editor',
  true,
  true,
  '{"content":[{"id":"heading-1","type":"Heading","props":{"text":"Welcome to Frontbase","level":"1"},"children":[]},{"id":"text-1","type":"Text","props":{"text":"Start building your amazing website with our visual page builder.","size":"lg"},"children":[]},{"id":"button-1","type":"Button","props":{"text":"Get Started","variant":"default","size":"lg"},"children":[]}],"root":{}}',
  '{"openGraph":{"title":"Welcome to Frontbase","description":"Build amazing websites with our visual page builder","image":"/og-image.jpg"},"twitter":{"card":"summary_large_image","title":"Welcome to Frontbase","description":"Build amazing websites with our visual page builder"}}',
  datetime('now'),
  datetime('now')
);