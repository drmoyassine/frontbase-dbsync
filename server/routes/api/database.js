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
      return res.status(400).json({
        success: false,
        message: 'Service key required for table operations'
      });
    }
    
    const serviceKey = decrypt(JSON.parse(encryptedServiceKey));
    if (!serviceKey) {
      return res.status(400).json({
        success: false,
        message: 'Failed to decrypt service key'
      });
    }
    
    const url = settings.supabase_url;
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    });
    
    if (!response.ok) {
      return res.status(400).json({
        success: false,
        message: 'Failed to fetch tables from Supabase'
      });
    }

    const data = await response.json();
    
    // Extract table information from OpenAPI spec
    const tables = [];
    if (data.paths) {
      Object.keys(data.paths).forEach(path => {
        if (path.startsWith('/') && !path.includes('{')) {
          const tableName = path.substring(1);
          if (tableName && !tableName.includes('/')) {
            tables.push({
              name: tableName,
              schema: 'public',
              path: path
            });
          }
        }
      });
    }
    
    res.json({
      success: true,
      data: { tables }
    });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tables'
    });
  }
});

// Get table schema
router.get('/table-schema/:tableName', authenticateToken, async (req, res) => {
  try {
    const settings = db.getUserSettings(req.user.id);
    const { tableName } = req.params;
    const encryptedServiceKey = settings.supabase_service_key_encrypted;
    
    if (!encryptedServiceKey) {
      return res.status(400).json({
        success: false,
        message: 'Service key required'
      });
    }

    const serviceKey = decrypt(JSON.parse(encryptedServiceKey));
    if (!serviceKey || !settings.supabase_url) {
      return res.status(400).json({
        success: false,
        message: 'Supabase credentials not found'
      });
    }

    // Query information_schema for actual column details
    const schemaQuery = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns 
      WHERE table_name = '${tableName}' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `;

    const response = await fetch(`${settings.supabase_url}/rest/v1/rpc/get_table_schema`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        query: schemaQuery
      })
    });

    if (response.ok) {
      const schemaData = await response.json();
      res.json({
        success: true,
        data: { 
          table_name: tableName, 
          columns: schemaData || []
        }
      });
    } else {
      // Fallback: try to get schema from first row
      const fallbackResponse = await fetch(`${settings.supabase_url}/rest/v1/${tableName}?limit=1`, {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey
        }
      });
      
      if (fallbackResponse.ok) {
        const data = await fallbackResponse.json();
        const columns = data.length > 0 ? Object.keys(data[0]).map(col => ({
          column_name: col,
          data_type: 'unknown',
          is_nullable: 'YES'
        })) : [];
        
        res.json({
          success: true,
          data: { table_name: tableName, columns }
        });
      } else {
        res.json({
          success: true,
          data: { table_name: tableName, columns: [] }
        });
      }
    }
  } catch (error) {
    console.error('Error fetching table schema:', error);
    res.json({
      success: true,
      data: { table_name: req.params.tableName, columns: [] }
    });
  }
});

// Get table data preview
router.get('/table-data/:tableName', authenticateToken, async (req, res) => {
  try {
    const settings = db.getUserSettings(req.user.id);
    const { tableName } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    const anonKey = settings.supabase_anon_key;
    const encryptedServiceKey = settings.supabase_service_key_encrypted;
    
    if (!anonKey || !settings.supabase_url) {
      return res.status(400).json({
        success: false,
        message: 'Supabase credentials not found'
      });
    }

    // Try with anon key first
    let response = await fetch(`${settings.supabase_url}/rest/v1/${tableName}?limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
        'Content-Type': 'application/json'
      }
    });

    // If anon key fails and we have service key, try with service key
    if (!response.ok && encryptedServiceKey) {
      try {
        const serviceKey = decrypt(JSON.parse(encryptedServiceKey));
        if (serviceKey) {
          response = await fetch(`${settings.supabase_url}/rest/v1/${tableName}?limit=${limit}&offset=${offset}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'apikey': serviceKey,
              'Content-Type': 'application/json'
            }
          });
        }
      } catch (decryptError) {
        console.error('Service key decryption failed:', decryptError);
      }
    }

    if (response.ok) {
      const data = await response.json();
      res.json({ success: true, data });
    } else {
      const errorText = await response.text();
      res.status(response.status).json({
        success: false,
        message: `Failed to fetch table data: ${errorText || 'Unknown error'}`
      });
    }
  } catch (error) {
    console.error('Error fetching table data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch table data'
    });
  }
});

module.exports = router;