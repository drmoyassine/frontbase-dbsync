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

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies?.session_token;
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Clean up expired sessions
  deleteExpiredSessionsStmt.run();

  const session = getSessionStmt.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const user = getUserByIdStmt.get(session.user_id);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

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

    // Set secure cookie
    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

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

    // Set secure cookie
    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

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

// Get current user
router.get('/me', authenticateToken, (req, res) => {
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