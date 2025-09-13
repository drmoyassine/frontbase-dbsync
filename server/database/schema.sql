-- Frontbase SQLite Database Schema

-- Single project (one per deployment)
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  supabase_url TEXT,
  supabase_anon_key TEXT,
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

-- Initialize with default project
INSERT OR IGNORE INTO project (id, name, description, created_at, updated_at) 
VALUES ('default', 'My Frontbase Project', 'A new project created with Frontbase', datetime('now'), datetime('now'));