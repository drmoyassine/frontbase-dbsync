import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

console.log('Loading better-sqlite3...');

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use environment variable for DB path, with fallback
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/frontbase.db');
const DATA_DIR = path.dirname(DB_PATH);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('Created data directory:', DATA_DIR);
}

// Ensure uploads directory exists - use environment variable if set
const UPLOADS_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('Created uploads directory:', UPLOADS_DIR);
}

let db;

function getDatabase() {
  if (!db) {
    console.log('Initializing database connection to:', DB_PATH);
    try {
      db = new Database(DB_PATH);
      console.log('Connected to SQLite database successfully');
      // Enable foreign keys
      db.pragma('foreign_keys = ON');
      console.log('Foreign keys enabled successfully');
    } catch (err) {
      console.error('Error opening database:', err);
      throw err;
    }
  }
  return db;
}

async function initDatabase() {
  try {
    console.log('Getting database instance...');
    const database = getDatabase();
    
    console.log('Creating database tables...');
    // Create tables
    const createTables = `
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Projects table
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        user_id INTEGER NOT NULL,
        settings JSON DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Pages table
      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        title TEXT,
        description TEXT,
        keywords TEXT,
        is_public BOOLEAN DEFAULT 1,
        is_homepage BOOLEAN DEFAULT 0,
        layout_data JSON NOT NULL DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      -- App variables table
      CREATE TABLE IF NOT EXISTS app_variables (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        value TEXT,
        type TEXT NOT NULL DEFAULT 'static',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      -- Indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
      CREATE INDEX IF NOT EXISTS idx_pages_project_id ON pages(project_id);
      CREATE INDEX IF NOT EXISTS idx_app_variables_project_id ON app_variables(project_id);
    `;

    database.exec(createTables);
    console.log('Database tables created/verified successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

export {
  getDatabase,
  initDatabase
};