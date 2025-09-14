// Startup verification script for container restart issues

const checkStartupHealth = (dbManager) => {
  console.log('🚀 STARTUP CHECK: Beginning comprehensive startup verification');
  
  const checks = {
    databaseFile: false,
    databaseConnection: false,
    criticalTables: false,
    sessionTable: false,
    userTable: false,
    filePermissions: false
  };

  try {
    // 1. Check database file exists and is accessible
    const fs = require('fs');
    const dbPath = process.env.DB_PATH;
    
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      console.log('🚀 STARTUP CHECK: Database file found');
      console.log(`  - Size: ${stats.size} bytes`);
      console.log(`  - Modified: ${stats.mtime}`);
      checks.databaseFile = true;
    } else {
      console.error('🚀 STARTUP CHECK: Database file missing at:', dbPath);
    }

    // 2. Test database connection
    try {
      const testQuery = dbManager.db.prepare('SELECT 1 as test');
      const result = testQuery.get();
      if (result.test === 1) {
        console.log('🚀 STARTUP CHECK: Database connection verified');
        checks.databaseConnection = true;
      }
    } catch (error) {
      console.error('🚀 STARTUP CHECK: Database connection failed:', error.message);
    }

    // 3. Check critical tables exist
    try {
      const tables = dbManager.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
      `).all();
      
      const tableNames = tables.map(t => t.name);
      const requiredTables = ['users', 'user_sessions', 'project_config', 'pages'];
      const missingTables = requiredTables.filter(table => !tableNames.includes(table));
      
      if (missingTables.length === 0) {
        console.log('🚀 STARTUP CHECK: All critical tables present');
        checks.criticalTables = true;
      } else {
        console.error('🚀 STARTUP CHECK: Missing tables:', missingTables);
      }
    } catch (error) {
      console.error('🚀 STARTUP CHECK: Table check failed:', error.message);
    }

    // 4. Check session table specifically
    try {
      const sessionCount = dbManager.db.prepare('SELECT COUNT(*) as count FROM user_sessions').get();
      console.log('🚀 STARTUP CHECK: Session table accessible, sessions:', sessionCount.count);
      checks.sessionTable = true;
    } catch (error) {
      console.error('🚀 STARTUP CHECK: Session table check failed:', error.message);
    }

    // 5. Check user table
    try {
      const userCount = dbManager.db.prepare('SELECT COUNT(*) as count FROM users').get();
      console.log('🚀 STARTUP CHECK: User table accessible, users:', userCount.count);
      checks.userTable = true;
    } catch (error) {
      console.error('🚀 STARTUP CHECK: User table check failed:', error.message);
    }

    // 6. Check file permissions
    try {
      const testFile = require('path').join(require('path').dirname(dbPath), '.permission-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log('🚀 STARTUP CHECK: File permissions verified');
      checks.filePermissions = true;
    } catch (error) {
      console.error('🚀 STARTUP CHECK: File permission check failed:', error.message);
    }

    // Summary
    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    
    console.log(`🚀 STARTUP CHECK: ${passedChecks}/${totalChecks} checks passed`);
    
    if (passedChecks === totalChecks) {
      console.log('🚀 STARTUP CHECK: ✅ All startup checks PASSED - system ready');
    } else {
      console.log('🚀 STARTUP CHECK: ⚠️  Some checks FAILED - may experience issues');
      console.log('🚀 STARTUP CHECK: Failed checks:', 
        Object.entries(checks)
          .filter(([_, passed]) => !passed)
          .map(([check, _]) => check)
          .join(', ')
      );
    }

    return { success: passedChecks === totalChecks, checks, passedChecks, totalChecks };

  } catch (error) {
    console.error('🚀 STARTUP CHECK: Critical error during startup check:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { checkStartupHealth };