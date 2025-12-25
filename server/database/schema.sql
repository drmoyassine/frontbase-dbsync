-- Frontbase SQLite Database Schema

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
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(table_name, policy_name)
);

-- Initialize with default project
INSERT OR IGNORE INTO project (id, name, description, created_at, updated_at) 
VALUES ('default', 'My Frontbase Project', 'A new project created with Frontbase', datetime('now'), datetime('now'));

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