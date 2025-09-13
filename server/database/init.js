const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function initializeDatabase() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/frontbase.db');
  
  console.log('📍 Database path:', dbPath);
  
  // Ensure data directory exists
  const dataDir = path.dirname(dbPath);
  console.log('📁 Data directory:', dataDir);
  
  if (!fs.existsSync(dataDir)) {
    console.log('📁 Creating data directory...');
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✅ Data directory created');
  } else {
    console.log('✅ Data directory exists');
  }
  
  // Check directory permissions
  try {
    const testFile = path.join(dataDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('✅ Data directory is writable');
  } catch (error) {
    console.error('❌ Data directory is not writable:', error.message);
    throw error;
  }
  
  // Create database connection
  console.log('🔗 Creating database connection...');
  let db;
  try {
    db = new Database(dbPath);
    console.log('✅ Database connection created');
  } catch (error) {
    console.error('❌ Failed to create database connection:', error.message);
    throw error;
  }
  
  // Enable foreign keys
  console.log('🔧 Enabling foreign keys...');
  try {
    db.pragma('foreign_keys = ON');
    console.log('✅ Foreign keys enabled');
  } catch (error) {
    console.error('❌ Failed to enable foreign keys:', error.message);
    throw error;
  }
  
  // Read and execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  console.log('📖 Reading schema from:', schemaPath);
  
  let schemaSQL;
  try {
    schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    console.log('✅ Schema file read successfully');
    console.log('📏 Schema length:', schemaSQL.length, 'characters');
  } catch (error) {
    console.error('❌ Failed to read schema file:', error.message);
    throw error;
  }
  
  // Execute schema (split by semicolons and filter empty statements)
  const statements = schemaSQL.split(';').filter(stmt => stmt.trim());
  console.log('📝 Executing', statements.length, 'SQL statements...');
  
  try {
    db.transaction(() => {
      statements.forEach((statement, index) => {
        if (statement.trim()) {
          try {
            db.exec(statement);
            console.log(`✅ Statement ${index + 1}/${statements.length} executed`);
          } catch (error) {
            console.error(`❌ Failed to execute statement ${index + 1}:`, error.message);
            console.error('Statement:', statement.substring(0, 100) + '...');
            throw error;
          }
        }
      });
    })();
    console.log('✅ All SQL statements executed successfully');
  } catch (error) {
    console.error('❌ Transaction failed:', error.message);
    throw error;
  }
  
  console.log('✅ Database initialized successfully');
  console.log(`📍 Database location: ${dbPath}`);
  
  return db;
}

module.exports = { initializeDatabase };

// Allow running this script directly
if (require.main === module) {
  initializeDatabase();
}