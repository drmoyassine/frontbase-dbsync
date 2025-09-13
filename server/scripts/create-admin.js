const bcrypt = require('bcrypt');
const DatabaseManager = require('../utils/db');

async function createAdminUser() {
  const db = new DatabaseManager();
  
  try {
    // Generate proper hash for 'admin123'
    const passwordHash = await bcrypt.hash('admin123', 10);
    console.log('Generated password hash:', passwordHash);
    
    // Delete existing admin user if exists
    const deleteStmt = db.db.prepare('DELETE FROM users WHERE username = ?');
    deleteStmt.run('admin');
    
    // Create new admin user with correct hash
    const createUserStmt = db.db.prepare(`
      INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    
    createUserStmt.run('default-admin', 'admin', 'admin@frontbase.dev', passwordHash);
    
    console.log('Admin user created successfully with username: admin, password: admin123');
    
    // Verify the user was created
    const getUserStmt = db.db.prepare('SELECT * FROM users WHERE username = ?');
    const user = getUserStmt.get('admin');
    
    if (user) {
      console.log('Verification: Admin user exists in database');
      
      // Test password verification
      const isValid = await bcrypt.compare('admin123', user.password_hash);
      console.log('Password verification test:', isValid ? 'PASS' : 'FAIL');
    } else {
      console.log('ERROR: Admin user not found after creation');
    }
    
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    db.close();
  }
}

// Run if called directly
if (require.main === module) {
  createAdminUser();
}

module.exports = createAdminUser;