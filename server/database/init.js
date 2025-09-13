const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/frontbase.db');
const DATA_DIR = path.join(__dirname, '../../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

let db;

function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to SQLite database');
      }
    });
  }
  return db;
}

async function initDatabase() {
  return new Promise((resolve, reject) => {
    const database = getDatabase();
    
    // Enable foreign keys
    database.run('PRAGMA foreign_keys = ON');
    
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

    database.exec(createTables, (err) => {
      if (err) {
        console.error('Error creating tables:', err);
        reject(err);
      } else {
        console.log('Database tables created/verified successfully');
        resolve();
      }
    });
  });
}

module.exports = {
  getDatabase,
  initDatabase
};