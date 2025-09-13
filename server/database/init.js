const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function initializeDatabase() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/frontbase.db');
  
  // Ensure data directory exists
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Create database connection
  const db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Read and execute schema
  const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  
  // Execute schema (split by semicolons and filter empty statements)
  const statements = schemaSQL.split(';').filter(stmt => stmt.trim());
  
  db.transaction(() => {
    statements.forEach(statement => {
      if (statement.trim()) {
        db.exec(statement);
      }
    });
  })();
  
  console.log('✅ Database initialized successfully');
  console.log(`📍 Database location: ${dbPath}`);
  
  return db;
}

module.exports = { initializeDatabase };

// Allow running this script directly
if (require.main === module) {
  initializeDatabase();
}