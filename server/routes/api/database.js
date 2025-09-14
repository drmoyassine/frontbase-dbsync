const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('./auth');
const DatabaseManager = require('../../utils/db');
const { encrypt, decrypt } = require('../../utils/encryption');

const router = express.Router();
const db = new DatabaseManager();

// Get database connections (PROJECT level)
router.get('/connections', authenticateToken, async (req, res) => {
  try {
    // Get project-level Supabase settings
    const project = db.db.prepare('SELECT supabase_url, supabase_anon_key FROM project WHERE id = ?').get('default');
    
    // Get user-level service key (for now, until we move it to project level)
    const settings = db.getUserSettings(req.user.id);
    
    const connections = {
      supabase: {
        connected: !!(project?.supabase_url && project?.supabase_anon_key),
        url: project?.supabase_url || '',
        hasServiceKey: !!settings.supabase_service_key_encrypted
      }
    };
    
    console.log('Connection status check:', {
      project_url: !!project?.supabase_url,
      project_anon: !!project?.supabase_anon_key,
      user_service_key: !!settings.supabase_service_key_encrypted,
      connected: connections.supabase.connected
    });
    
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

// Save Supabase connection (PROJECT level)
router.post('/connect-supabase', authenticateToken, async (req, res) => {
  try {
    const { url, anonKey, serviceKey } = req.body;
    
    if (!url || !anonKey) {
      return res.status(400).json({ error: 'URL and anon key required' });
    }
    
    console.log('Saving Supabase connection at PROJECT level...');
    
    // Save connection details at PROJECT level
    const projectStmt = db.db.prepare(`
      UPDATE project 
      SET supabase_url = ?, 
          supabase_anon_key = ?,
          updated_at = datetime('now')
      WHERE id = 'default'
    `);
    projectStmt.run(url, anonKey);
    
    // Encrypt and save service key if provided (user level for now)
    if (serviceKey) {
      const encryptedServiceKey = encrypt(serviceKey);
      db.updateUserSetting(req.user.id, 'supabase_service_key_encrypted', JSON.stringify(encryptedServiceKey));
    }
    
    console.log('✅ Supabase connection saved at PROJECT level');
    res.json({ success: true, message: 'Connection saved successfully' });
  } catch (error) {
    console.error('Save connection error:', error);
    res.status(500).json({ error: 'Failed to save connection' });
  }
});

// Disconnect Supabase (PROJECT level)
router.delete('/disconnect-supabase', authenticateToken, async (req, res) => {
  try {
    console.log('Disconnecting Supabase at PROJECT level...');
    
    // Clear project-level settings
    const projectStmt = db.db.prepare(`
      UPDATE project 
      SET supabase_url = NULL, 
          supabase_anon_key = NULL,
          updated_at = datetime('now')
      WHERE id = 'default'
    `);
    projectStmt.run();
    
    // Clear user-level service key
    db.updateUserSetting(req.user.id, 'supabase_service_key_encrypted', '');
    
    console.log('✅ Supabase disconnected at PROJECT level');
    res.json({ success: true, message: 'Disconnected successfully' });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Get Supabase tables (requires service key) - Uses PROJECT level connection
router.get('/supabase-tables', authenticateToken, async (req, res) => {
  try {
    // Get PROJECT level Supabase URL
    const project = db.db.prepare('SELECT supabase_url FROM project WHERE id = ?').get('default');
    
    // Get service key from user settings (for now)
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
      console.error('Service key decryption failed - this may indicate encryption key mismatch');
      return res.status(400).json({
        success: false,
        message: 'Failed to decrypt service key. This may indicate an encryption key mismatch. Please check your ENCRYPTION_KEY environment variable or reconnect to Supabase.',
        requiresReconnection: true
      });
    }
    
    const url = project?.supabase_url;
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
  // Add stronger cache-busting headers
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    'ETag': crypto.randomUUID(),
    'Last-Modified': new Date().toUTCString()
  });

  try {
    // Get PROJECT level Supabase URL
    const project = db.db.prepare('SELECT supabase_url FROM project WHERE id = ?').get('default');
    
    // Get service key from user settings (for now)
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
    if (!serviceKey || !project?.supabase_url) {
      console.error('Service key decryption failed or URL missing - encryption key mismatch possible');
      return res.status(400).json({
        success: false,
        message: 'Failed to decrypt Supabase credentials. This may indicate an encryption key mismatch. Please check your ENCRYPTION_KEY environment variable or reconnect to Supabase.',
        requiresReconnection: true
      });
    }

    // Direct query to information_schema via REST API
    const schemaUrl = `${project.supabase_url}/rest/v1/rpc/exec_sql`;
    const schemaQuery = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN true ELSE false END as is_primary,
        CASE WHEN tc.constraint_type = 'FOREIGN KEY' THEN true ELSE false END as is_foreign
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu 
        ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
      LEFT JOIN information_schema.table_constraints tc 
        ON kcu.constraint_name = tc.constraint_name
      WHERE c.table_name = '${tableName}' 
        AND c.table_schema = 'public'
      ORDER BY c.ordinal_position
    `;

    console.log('Fetching schema for table:', tableName);
    
    let response = await fetch(schemaUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ 
        query: schemaQuery
      })
    });

    if (!response.ok) {
      console.log('Schema RPC failed, trying direct query approach');
      // Alternative: direct query to columns table
      const directUrl = `${project.supabase_url}/rest/v1/information_schema.columns?table_name=eq.${tableName}&table_schema=eq.public&select=column_name,data_type,is_nullable,column_default`;
      
      response = await fetch(directUrl, {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json'
        }
      });
    }

    if (response.ok) {
      const schemaData = await response.json();
      console.log('Schema data received:', schemaData);
      
      // Handle different response formats
      let columns = Array.isArray(schemaData) ? schemaData : (schemaData.data || []);
      
      res.json({
        success: true,
        data: { 
          table_name: tableName, 
          columns: columns
        }
      });
    } else {
      console.log('Both schema queries failed, using fallback');
      // Fallback: try to get schema from first row
      const fallbackResponse = await fetch(`${project.supabase_url}/rest/v1/${tableName}?limit=1`, {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey
        }
      });
      
      if (fallbackResponse.ok) {
        const data = await fallbackResponse.json();
        const columns = data.length > 0 ? Object.keys(data[0]).map(col => ({
          column_name: col,
          data_type: typeof data[0][col],
          is_nullable: 'YES'
        })) : [];
        
        console.log('Fallback schema extracted:', columns);
        
        res.json({
          success: true,
          data: { table_name: tableName, columns }
        });
      } else {
        console.log('Fallback also failed');
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
  // Add stronger cache-busting headers
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    'ETag': crypto.randomUUID(),
    'Last-Modified': new Date().toUTCString()
  });

  try {
    // Get PROJECT level Supabase connection
    const project = db.db.prepare('SELECT supabase_url, supabase_anon_key FROM project WHERE id = ?').get('default');
    
    // Get service key from user settings (for now)
    const settings = db.getUserSettings(req.user.id);
    const { tableName } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    console.log(`Fetching data for table: ${tableName}, limit: ${limit}, offset: ${offset}`);
    
    const anonKey = project?.supabase_anon_key;
    const encryptedServiceKey = settings.supabase_service_key_encrypted;
    
    if (!anonKey || !project?.supabase_url) {
      return res.status(400).json({
        success: false,
        message: 'Supabase credentials not found at PROJECT level'
      });
    }

    let authMethod = 'service';
    let response;

    // Use service key exclusively for dashboard access (bypasses RLS)
    if (!encryptedServiceKey) {
      return res.status(400).json({
        success: false,
        message: 'Service key required for dashboard database access. Please reconnect to Supabase.'
      });
    }

    console.log('Using service key for admin dashboard access...');
    try {
      const serviceKey = decrypt(JSON.parse(encryptedServiceKey));
      if (!serviceKey) {
        throw new Error('Failed to decrypt service key');
      }

      response = await fetch(`${project.supabase_url}/rest/v1/${tableName}?limit=${limit}&offset=${offset}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json'
        }
      });
    } catch (decryptError) {
      console.error('Service key decryption failed:', decryptError);
      return res.status(500).json({
        success: false,
        message: 'Failed to decrypt service key. Please reconnect to Supabase.'
      });
    }

    if (response.ok) {
      const data = await response.json();
      console.log(`Success with ${authMethod} key. Rows fetched: ${Array.isArray(data) ? data.length : 0}`);
      
      // Always return data array, even if empty
      const responseData = Array.isArray(data) ? data : [];
      
      res.json({ 
        success: true, 
        data: responseData,
        authMethod,
        total: responseData.length
      });
    } else {
      const errorText = await response.text();
      console.error(`Failed to fetch table data: ${response.status} - ${errorText}`);
      
      // Check if it's an RLS policy error
      if (response.status === 401 || errorText.includes('RLS')) {
        res.status(response.status).json({
          success: false,
          message: `Access denied: Table may have Row Level Security enabled. ${errorText}`,
          isRLSError: true
        });
      } else {
        res.status(response.status).json({
          success: false,
          message: `Failed to fetch table data: ${errorText || 'Unknown error'}`
        });
      }
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