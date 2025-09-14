// Session monitoring utility for debugging session persistence issues

const monitorSessions = (dbManager) => {
  console.log('🔍 SESSION MONITOR: Starting session monitoring');
  
  // Log current sessions every 30 seconds
  setInterval(() => {
    try {
      const sessions = dbManager.db.prepare(`
        SELECT 
          us.id,
          us.user_id,
          u.username,
          us.expires_at,
          us.created_at,
          datetime(us.expires_at) > datetime('now') as is_valid
        FROM user_sessions us
        LEFT JOIN users u ON us.user_id = u.id
        ORDER BY us.created_at DESC
        LIMIT 10
      `).all();

      if (sessions.length > 0) {
        console.log('🔍 SESSION MONITOR: Active sessions:');
        sessions.forEach(session => {
          console.log(`  - ${session.username}: ${session.is_valid ? 'VALID' : 'EXPIRED'} (expires: ${session.expires_at})`);
        });
      } else {
        console.log('🔍 SESSION MONITOR: No sessions found');
      }
    } catch (error) {
      console.error('🔍 SESSION MONITOR: Error checking sessions:', error);
    }
  }, 30000); // Every 30 seconds

  // Monitor database file changes
  const fs = require('fs');
  const path = require('path');
  
  if (process.env.DB_PATH) {
    try {
      fs.watchFile(process.env.DB_PATH, (curr, prev) => {
        console.log('🔍 SESSION MONITOR: Database file changed');
        console.log(`  - Size: ${prev.size} -> ${curr.size}`);
        console.log(`  - Modified: ${prev.mtime} -> ${curr.mtime}`);
      });
    } catch (error) {
      console.error('🔍 SESSION MONITOR: Cannot watch database file:', error);
    }
  }
};

module.exports = { monitorSessions };