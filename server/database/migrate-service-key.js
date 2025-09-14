const Database = require('better-sqlite3');
const path = require('path');

/**
 * Migration script to move service keys from user-level to project-level storage
 * This ensures all admins can access the same Supabase connection
 */
function migrateServiceKeyToProjectLevel() {
  console.log('🔄 Starting service key migration to project level...');
  
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/frontbase.db');
  const db = new Database(dbPath);
  
  try {
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    
    // First, check if the project table already has the service key column
    const columns = db.prepare("PRAGMA table_info(project)").all();
    const hasServiceKeyColumn = columns.some(col => col.name === 'supabase_service_key_encrypted');
    
    if (!hasServiceKeyColumn) {
      console.log('📋 Adding supabase_service_key_encrypted column to project table...');
      db.prepare('ALTER TABLE project ADD COLUMN supabase_service_key_encrypted TEXT').run();
      console.log('✅ Column added successfully');
    } else {
      console.log('✅ Project table already has service key column');
    }
    
    // Check if there's already a service key at project level
    const project = db.prepare('SELECT supabase_service_key_encrypted FROM project WHERE id = ?').get('default');
    
    if (!project?.supabase_service_key_encrypted) {
      console.log('🔍 Looking for user-level service keys to migrate...');
      
      // Find any user with a service key
      const usersWithServiceKeys = db.prepare(`
        SELECT user_id, settings_data 
        FROM user_settings 
        WHERE settings_data LIKE '%supabase_service_key_encrypted%'
      `).all();
      
      if (usersWithServiceKeys.length > 0) {
        console.log(`📦 Found ${usersWithServiceKeys.length} user(s) with service keys`);
        
        // Take the first one (they should all be the same for a project)
        const userSettings = usersWithServiceKeys[0];
        
        try {
          const settingsData = JSON.parse(userSettings.settings_data);
          const serviceKey = settingsData.supabase_service_key_encrypted;
          
          if (serviceKey) {
            console.log('🔐 Migrating service key to project level...');
            
            // Move to project level
            db.prepare(`
              UPDATE project 
              SET supabase_service_key_encrypted = ?, 
                  updated_at = datetime('now')
              WHERE id = 'default'
            `).run(serviceKey);
            
            console.log('✅ Service key migrated to project level');
            
            // Clean up user-level service keys
            console.log('🧹 Cleaning up user-level service keys...');
            for (const userSetting of usersWithServiceKeys) {
              try {
                const settings = JSON.parse(userSetting.settings_data);
                delete settings.supabase_service_key_encrypted;
                
                db.prepare(`
                  UPDATE user_settings 
                  SET settings_data = ?, updated_at = datetime('now')
                  WHERE user_id = ?
                `).run(JSON.stringify(settings), userSetting.user_id);
              } catch (err) {
                console.warn(`⚠️  Could not clean up service key for user ${userSetting.user_id}:`, err.message);
              }
            }
            
            console.log('✅ Migration completed successfully');
          }
        } catch (parseError) {
          console.warn('⚠️  Could not parse user settings data:', parseError.message);
        }
      } else {
        console.log('ℹ️  No user-level service keys found to migrate');
      }
    } else {
      console.log('✅ Service key already exists at project level');
    }
    
    // Verify final state
    const finalProject = db.prepare('SELECT supabase_url, supabase_anon_key, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');
    console.log('🔍 Final migration state:', {
      has_url: !!finalProject?.supabase_url,
      has_anon_key: !!finalProject?.supabase_anon_key,
      has_service_key: !!finalProject?.supabase_service_key_encrypted
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    db.close();
  }
  
  console.log('🎉 Service key migration completed');
}

// Allow running this script directly
if (require.main === module) {
  migrateServiceKeyToProjectLevel();
}

module.exports = { migrateServiceKeyToProjectLevel };