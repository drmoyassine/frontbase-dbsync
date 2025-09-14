const express = require('express');
const { authenticateToken } = require('./auth');
const DatabaseManager = require('../../utils/db');
const { encrypt, decrypt } = require('../../utils/encryption');

const router = express.Router();
const db = new DatabaseManager();

// Get database connections for current user
router.get('/connections', authenticateToken, async (req, res) => {
  try {
    const settings = db.getUserSettings(req.user.id);
    
    const connections = {
      supabase: {
        connected: !!(settings.supabase_url && settings.supabase_anon_key),
        url: settings.supabase_url || '',
        hasServiceKey: !!settings.supabase_service_key_encrypted
      }
    };
    
    res.json(connections);
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({ error: 'Failed to get connections' });
  }
});

// Test Supabase connection
router.post('/test-supabase', authenticateToken, async (req, res) => {
  try {
    const { url, anonKey } = req.body;
    
    if (!url || !anonKey) {
      return res.status(400).json({ error: 'URL and anon key required' });
    }
    
    // Test the connection by making a simple request
    const testResponse = await fetch(`${url}/rest/v1/`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    
    if (testResponse.ok) {
      res.json({ success: true, message: 'Connection successful' });
    } else {
      res.status(400).json({ error: 'Connection failed - invalid credentials' });
    }
  } catch (error) {
    console.error('Test connection error:', error);
    res.status(400).json({ error: 'Connection failed - unable to reach server' });
  }
});

// Save Supabase connection
router.post('/connect-supabase', authenticateToken, async (req, res) => {
  try {
    const { url, anonKey, serviceKey } = req.body;
    
    if (!url || !anonKey) {
      return res.status(400).json({ error: 'URL and anon key required' });
    }
    
    // Save connection details
    db.updateUserSetting(req.user.id, 'supabase_url', url);
    db.updateUserSetting(req.user.id, 'supabase_anon_key', anonKey);
    
    // Encrypt and save service key if provided
    if (serviceKey) {
      const encryptedServiceKey = encrypt(serviceKey);
      db.updateUserSetting(req.user.id, 'supabase_service_key_encrypted', JSON.stringify(encryptedServiceKey));
    }
    
    res.json({ success: true, message: 'Connection saved successfully' });
  } catch (error) {
    console.error('Save connection error:', error);
    res.status(500).json({ error: 'Failed to save connection' });
  }
});

// Disconnect Supabase
router.delete('/disconnect-supabase', authenticateToken, async (req, res) => {
  try {
    db.updateUserSetting(req.user.id, 'supabase_url', '');
    db.updateUserSetting(req.user.id, 'supabase_anon_key', '');
    db.updateUserSetting(req.user.id, 'supabase_service_key_encrypted', '');
    
    res.json({ success: true, message: 'Disconnected successfully' });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Get Supabase tables (requires service key)
router.get('/supabase-tables', authenticateToken, async (req, res) => {
  try {
    const settings = db.getUserSettings(req.user.id);
    const encryptedServiceKey = settings.supabase_service_key_encrypted;
    
    if (!encryptedServiceKey) {
      return res.status(400).json({ error: 'Service key required for table operations' });
    }
    
    const serviceKey = decrypt(JSON.parse(encryptedServiceKey));
    if (!serviceKey) {
      return res.status(400).json({ error: 'Failed to decrypt service key' });
    }
    
    const url = settings.supabase_url;
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    });
    
    if (!response.ok) {
      return res.status(400).json({ error: 'Failed to fetch tables' });
    }
    
    // This is a simplified response - in a real implementation you'd query the schema
    res.json({ 
      tables: [
        { name: 'users', rows: 'Unknown' },
        { name: 'posts', rows: 'Unknown' }
      ]
    });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({ error: 'Failed to get tables' });
  }
});

module.exports = router;