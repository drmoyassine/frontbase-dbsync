const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function migrateSoftDelete() {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/frontbase.db');
    console.log('📍 Database path:', dbPath);

    if (!fs.existsSync(dbPath)) {
        console.error('❌ Database file not found at:', dbPath);
        process.exit(1);
    }

    const db = new Database(dbPath);

    try {
        console.log('🔄 Checking pages table schema...');

        // Check if deleted_at column exists
        const tableInfo = db.pragma('table_info(pages)');
        const hasDeletedAt = tableInfo.some(col => col.name === 'deleted_at');

        if (hasDeletedAt) {
            console.log('✅ deleted_at column already exists');
        } else {
            console.log('📝 Adding deleted_at column to pages table...');
            db.exec('ALTER TABLE pages ADD COLUMN deleted_at TEXT');
            console.log('✅ deleted_at column added successfully');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        db.close();
    }
}

migrateSoftDelete();
