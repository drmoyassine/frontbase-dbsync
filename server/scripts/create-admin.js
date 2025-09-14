const bcrypt = require('bcrypt');
const DatabaseManager = require('../utils/db');

async function createAdminUser() {
  const db = new DatabaseManager();
  
  try {
    // Get admin credentials from environment variables or use defaults
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@frontbase.dev';
    
    // Validate admin password length for security
    if (adminPassword.length < 6) {
      console.error('ERROR: Admin password must be at least 6 characters long');
      return;
    }
    
    // Generate proper hash for the admin password
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    console.log('Generated password hash for admin user');
    
    // Delete existing admin user if exists
    const deleteStmt = db.db.prepare('DELETE FROM users WHERE username = ?');
    deleteStmt.run(adminUsername);
    
    // Create new admin user with correct hash
    const createUserStmt = db.db.prepare(`
      INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    
    createUserStmt.run('default-admin', adminUsername, adminEmail, passwordHash);
    
    const isCustomCredentials = process.env.ADMIN_USERNAME || process.env.ADMIN_PASSWORD;
    console.log(`Admin user created successfully with username: ${adminUsername}${!isCustomCredentials ? ', password: admin123' : ' (custom credentials)'}`);
    
    // Verify the user was created
    const getUserStmt = db.db.prepare('SELECT * FROM users WHERE username = ?');
    const user = getUserStmt.get(adminUsername);
    
    if (user) {
      console.log('Verification: Admin user exists in database');
      
      // Test password verification
      const isValid = await bcrypt.compare(adminPassword, user.password_hash);
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