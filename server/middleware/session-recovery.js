const crypto = require('crypto');

// Session recovery middleware for when localStorage shows user should be authenticated
// but server session is missing (e.g., after container restart)
const sessionRecovery = (dbManager) => {
  const createSessionStmt = dbManager.db.prepare(`
    INSERT INTO user_sessions (id, user_id, session_token, expires_at, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);

  const getUserByIdStmt = dbManager.db.prepare('SELECT * FROM users WHERE id = ?');

  return (req, res, next) => {
    // Apply to all protected API routes that might need session recovery
    const protectedPaths = ['/me', '/database/connections', '/database/', '/project/', '/pages/', '/variables/'];
    const isProtectedRoute = protectedPaths.some(path => req.path.includes(path)) && req.method === 'GET';
    
    if (!isProtectedRoute) {
      return next();
    }

    console.log('🔄 SESSION RECOVERY: Checking for recovery scenario');
    
    // Check if this is a recovery request (custom header from frontend)
    const recoveryUserId = req.headers['x-recovery-user-id'];
    const authHeader = req.headers.authorization;
    
    if (!recoveryUserId || !authHeader || !authHeader.startsWith('Bearer recovery-')) {
      console.log('🔄 SESSION RECOVERY: Not a recovery request, proceeding normally');
      return next();
    }

    console.log('🔄 SESSION RECOVERY: Recovery request detected for user:', recoveryUserId);

    try {
      // Verify user exists
      const user = getUserByIdStmt.get(recoveryUserId);
      if (!user) {
        console.log('🔄 SESSION RECOVERY: User not found, cannot recover');
        return res.status(401).json({ 
          error: 'User not found',
          recovery: false 
        });
      }

      console.log('🔄 SESSION RECOVERY: User found, creating new session');

      // Create new session
      const sessionId = crypto.randomUUID();
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      createSessionStmt.run(sessionId, user.id, sessionToken, expiresAt.toISOString());

      // Set cookie with same logic as auth.js
      const isProduction = process.env.NODE_ENV === 'production';
      const cookieOptions = {
        httpOnly: true,
        secure: isProduction && (req.headers['x-forwarded-proto'] === 'https' || req.secure),
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        ...(req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1') 
            ? { domain: `.${req.headers.host.split('.').slice(-2).join('.')}` } 
            : {})
      };

      res.cookie('session_token', sessionToken, cookieOptions);

      console.log('🔄 SESSION RECOVERY: New session created successfully');

      // Return user data
      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        recovered: true
      });

    } catch (error) {
      console.error('🔄 SESSION RECOVERY: Error during recovery:', error);
      res.status(500).json({ 
        error: 'Session recovery failed',
        recovery: false 
      });
    }
  };
};

module.exports = sessionRecovery;