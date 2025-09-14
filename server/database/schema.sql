-- Frontbase SQLite Database Schema

-- Single project (one per deployment)
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  supabase_url TEXT,
  supabase_anon_key TEXT,
  supabase_service_key_encrypted TEXT,
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