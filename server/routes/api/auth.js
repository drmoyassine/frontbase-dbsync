const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const DatabaseManager = require('../../utils/db');

const router = express.Router();
const db = new DatabaseManager();

// Prepare authentication statements
const getUserByUsernameStmt = db.db.prepare('SELECT * FROM users WHERE username = ?');
const getUserByEmailStmt = db.db.prepare('SELECT * FROM users WHERE email = ?');
const getUserByIdStmt = db.db.prepare('SELECT * FROM users WHERE id = ?');
const createUserStmt = db.db.prepare(`
  INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
`);

const createSessionStmt = db.db.prepare(`
  INSERT INTO user_sessions (id, user_id, session_token, expires_at, created_at)
  VALUES (?, ?, ?, ?, datetime('now'))
`);
const getSessionStmt = db.db.prepare('SELECT * FROM user_sessions WHERE session_token = ? AND datetime(expires_at) > datetime(\'now\')');
const deleteSessionStmt = db.db.prepare('DELETE FROM user_sessions WHERE session_token = ?');
const deleteExpiredSessionsStmt = db.db.prepare('DELETE FROM user_sessions WHERE datetime(expires_at) <= datetime(\'now\')');

// Authentication middleware with enhanced debugging
const authenticateToken = (req, res, next) => {
  console.log('🔐 AUTH MIDDLEWARE: Starting authentication check');
  console.log('🔐 AUTH MIDDLEWARE: Request URL:', req.originalUrl);
  console.log('🔐 AUTH MIDDLEWARE: Request method:', req.method);
  console.log('🔐 AUTH MIDDLEWARE: Cookie header:', req.headers.cookie);
  console.log('🔐 AUTH MIDDLEWARE: Parsed cookies:', req.cookies);
  
  const token = req.cookies?.session_token;
  console.log('🔐 AUTH MIDDLEWARE: Session token present:', !!token);
  console.log('🔐 AUTH MIDDLEWARE: Token length:', token ? token.length : 0);
  
  if (!token) {
    console.log('🔐 AUTH MIDDLEWARE: No session token - rejecting');
    return res.status(401).json({ 
      error: 'Authentication required',
      debug: 'No session_token cookie found'
    });
  }

  // Clean up expired sessions
  console.log('🔐 AUTH MIDDLEWARE: Cleaning expired sessions');
  try {
    const deletedCount = deleteExpiredSessionsStmt.run();
    console.log('🔐 AUTH MIDDLEWARE: Deleted expired sessions:', deletedCount.changes);
  } catch (error) {
    console.error('🔐 AUTH MIDDLEWARE: Error cleaning expired sessions:', error);
  }

  console.log('🔐 AUTH MIDDLEWARE: Looking up session in database');
  const session = getSessionStmt.get(token);
  console.log('🔐 AUTH MIDDLEWARE: Session found:', !!session);
  
  if (session) {
    console.log('🔐 AUTH MIDDLEWARE: Session details:', {
      id: session.id,
      user_id: session.user_id,
      expires_at: session.expires_at,
      created_at: session.created_at
    });
  }
  
  if (!session) {
    console.log('🔐 AUTH MIDDLEWARE: Invalid or expired session - rejecting');
    return res.status(401).json({ 
      error: 'Invalid or expired session',
      debug: 'Session not found in database or expired'
    });
  }

  console.log('🔐 AUTH MIDDLEWARE: Looking up user in database');
  const user = getUserByIdStmt.get(session.user_id);
  console.log('🔐 AUTH MIDDLEWARE: User found:', !!user);
  
  if (!user) {
    console.log('🔐 AUTH MIDDLEWARE: User not found - rejecting');
    return res.status(401).json({ 
      error: 'User not found',
      debug: 'User ID from session not found in users table'
    });
  }

  console.log('🔐 AUTH MIDDLEWARE: Authentication successful for user:', user.username);
  req.user = user;
  next();
};

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Find user by username or email
    let user = getUserByUsernameStmt.get(username);
    if (!user) {
      user = getUserByEmailStmt.get(username);
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session
    const sessionId = crypto.randomUUID();
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    createSessionStmt.run(sessionId, user.id, sessionToken, expiresAt.toISOString());

    // Set secure cookie with environment-aware settings
    const isProduction = process.env.NODE_ENV === 'production';
    const isEasypanel = process.env.EASYPANEL || process.env.RAILWAY || process.env.VERCEL;
    
    console.log('🍪 LOGIN: Setting session cookie');
    console.log('🍪 LOGIN: Environment:', process.env.NODE_ENV);
    console.log('🍪 LOGIN: Production mode:', isProduction);
    console.log('🍪 LOGIN: Platform detected:', isEasypanel ? 'platform' : 'local');
    console.log('🍪 LOGIN: Request headers:', {
      host: req.headers.host,
      'x-forwarded-proto': req.headers['x-forwarded-proto'],
      'x-forwarded-host': req.headers['x-forwarded-host']
    });
    
    const cookieOptions = {
      httpOnly: true,
      // Only use secure in production AND when we have HTTPS
      secure: isProduction && (req.headers['x-forwarded-proto'] === 'https' || req.secure),
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      // Add domain only if we're on a custom domain (not localhost)
      ...(req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1') 
          ? { domain: `.${req.headers.host.split('.').slice(-2).join('.')}` } 
          : {})
    };
    
    console.log('🍪 LOGIN: Cookie options:', cookieOptions);
    
    res.cookie('session_token', sessionToken, cookieOptions);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = getUserByUsernameStmt.get(username) || getUserByEmailStmt.get(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();

    // Create user
    createUserStmt.run(userId, username, email, passwordHash);

    // Create session
    const sessionId = crypto.randomUUID();
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    createSessionStmt.run(sessionId, userId, sessionToken, expiresAt.toISOString());

    // Set secure cookie with environment-aware settings
    const isProduction = process.env.NODE_ENV === 'production';
    const isEasypanel = process.env.EASYPANEL || process.env.RAILWAY || process.env.VERCEL;
    
    console.log('🍪 REGISTER: Setting session cookie');
    console.log('🍪 REGISTER: Environment:', process.env.NODE_ENV);
    console.log('🍪 REGISTER: Production mode:', isProduction);
    console.log('🍪 REGISTER: Platform detected:', isEasypanel ? 'platform' : 'local');
    
    const cookieOptions = {
      httpOnly: true,
      // Only use secure in production AND when we have HTTPS
      secure: isProduction && (req.headers['x-forwarded-proto'] === 'https' || req.secure),
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      // Add domain only if we're on a custom domain (not localhost)
      ...(req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1') 
          ? { domain: `.${req.headers.host.split('.').slice(-2).join('.')}` } 
          : {})
    };
    
    console.log('🍪 REGISTER: Cookie options:', cookieOptions);
    
    res.cookie('session_token', sessionToken, cookieOptions);

    res.status(201).json({
      user: {
        id: userId,
        username,
        email
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user with detailed logging
router.get('/me', authenticateToken, (req, res) => {
  console.log('🔐 /me endpoint: User authenticated successfully:', req.user.username);
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email
    }
  });
});

// Demo info endpoint
router.get('/demo-info', (req, res) => {
  const isDemoMode = !process.env.ADMIN_USERNAME && !process.env.ADMIN_PASSWORD;
  res.json({ isDemoMode });
});

// Logout endpoint
router.post('/logout', (req, res) => {
  const token = req.cookies?.session_token;
  
  if (token) {
    deleteSessionStmt.run(token);
  }

  res.clearCookie('session_token');
  res.json({ success: true });
});

module.exports = { router, authenticateToken };