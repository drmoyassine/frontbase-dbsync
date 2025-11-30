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
    // Get project-level Supabase settings including service key
    const project = db.db.prepare('SELECT supabase_url, supabase_anon_key, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');

    // Check for legacy user-level service key and migrate if found
    const userSettings = db.getUserSettings(req.user.id);
    let projectServiceKey = project?.supabase_service_key_encrypted;

    // Migration: move user-level service key to project level
    if (!projectServiceKey && userSettings.supabase_service_key_encrypted) {
      console.log('🔄 Migrating service key from user to project level...');
      db.updateProjectServiceKey(userSettings.supabase_service_key_encrypted);

      // Clear the old user-level key
      db.updateUserSetting(req.user.id, 'supabase_service_key_encrypted', '');

      // Refresh project data
      const updatedProject = db.db.prepare('SELECT supabase_url, supabase_anon_key, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');
      projectServiceKey = updatedProject?.supabase_service_key_encrypted;
      console.log('✅ Service key migration completed');
    }

    const connections = {
      supabase: {
        connected: !!(project?.supabase_url && project?.supabase_anon_key),
        url: project?.supabase_url || '',
        hasServiceKey: !!projectServiceKey
      }
    };

    console.log('🔍 Connection status debug:', {
      userId: req.user.id,
      project_url: !!project?.supabase_url,
      project_anon: !!project?.supabase_anon_key,
      project_service_key: !!projectServiceKey,
      legacy_user_service_key: !!userSettings.supabase_service_key_encrypted,
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

    console.log('🔧 Saving Supabase connection at PROJECT level...');
    console.log('🔍 Connection details:', { url: !!url, anonKey: !!anonKey, serviceKey: !!serviceKey });

    // Save connection details at PROJECT level (including service key)
    let updateData = { supabase_url: url, supabase_anon_key: anonKey };

    // Encrypt and save service key at PROJECT level if provided
    if (serviceKey) {
      console.log('🔐 Encrypting and storing service key at PROJECT level...');
      const encryptedServiceKey = encrypt(serviceKey);
      updateData.supabase_service_key_encrypted = JSON.stringify(encryptedServiceKey);
    }

    db.updateProject(updateData);

    // Verify the save was successful
    const savedProject = db.getProject();
    console.log('✅ Supabase connection verification:', {
      url_saved: !!savedProject.supabase_url,
      anon_key_saved: !!savedProject.supabase_anon_key,
      service_key_saved: !!savedProject.supabase_service_key_encrypted
    });

    res.json({ success: true, message: 'Connection saved successfully' });
  } catch (error) {
    console.error('Save connection error:', error);
    res.status(500).json({ error: 'Failed to save connection' });
  }
});

// Disconnect Supabase (PROJECT level)
router.delete('/disconnect-supabase', authenticateToken, async (req, res) => {
  try {
    console.log('🔧 Disconnecting Supabase at PROJECT level...');

    // Clear ALL project-level settings including service key
    db.updateProject({
      supabase_url: null,
      supabase_anon_key: null,
      supabase_service_key_encrypted: null
    });

    // Also clear any legacy user-level service key
    db.updateUserSetting(req.user.id, 'supabase_service_key_encrypted', '');

    console.log('✅ Supabase completely disconnected at PROJECT level');
    res.json({ success: true, message: 'Disconnected successfully' });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Get Supabase tables (requires service key) - Uses PROJECT level connection
router.get('/supabase-tables', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Fetching Supabase tables for user:', req.user.id);

    // Get PROJECT level Supabase connection including service key
    const project = db.db.prepare('SELECT supabase_url, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');

    console.log('🔍 Project connection data:', {
      has_url: !!project?.supabase_url,
      has_service_key: !!project?.supabase_service_key_encrypted
    });

    if (!project?.supabase_service_key_encrypted) {
      console.log('❌ No service key found at PROJECT level');
      return res.status(400).json({
        success: false,
        message: 'Service key required for table operations'
      });
    }

    console.log('🔐 Attempting to decrypt service key...');
    const serviceKey = decrypt(JSON.parse(project.supabase_service_key_encrypted));
    if (!serviceKey) {
      console.error('❌ Service key decryption failed - this may indicate encryption key mismatch');
      return res.status(400).json({
        success: false,
        message: 'Failed to decrypt service key. This may indicate an encryption key mismatch. Please check your ENCRYPTION_KEY environment variable or reconnect to Supabase.',
        requiresReconnection: true
      });
    }
    console.log('✅ Service key decrypted successfully');

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
    // Get PROJECT level Supabase connection including service key
    const project = db.db.prepare('SELECT supabase_url, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');

    const { tableName } = req.params;

    if (!project?.supabase_service_key_encrypted) {
      return res.status(400).json({
        success: false,
        message: 'Service key required'
      });
    }

    const serviceKey = decrypt(JSON.parse(project.supabase_service_key_encrypted));
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
    // Get PROJECT level Supabase connection including service key
    const project = db.db.prepare('SELECT supabase_url, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');

    const { tableName } = req.params;

    if (!project?.supabase_service_key_encrypted) {
      return res.status(400).json({
        success: false,
        message: 'Service key required'
      });
    }

    const serviceKey = decrypt(JSON.parse(project.supabase_service_key_encrypted));
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
    // Get PROJECT level Supabase connection including service key
    const project = db.db.prepare('SELECT supabase_url, supabase_anon_key, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');

    const { tableName } = req.params;
    const { limit = 20, offset = 0, orderBy, orderDirection } = req.query;

    // Extract filter parameters
    const filters = {};
    Object.keys(req.query).forEach(key => {
      if (key.startsWith('filter_')) {
        filters[key.replace('filter_', '')] = req.query[key];
      }
    });

    console.log(`🔍 Fetching data for table: ${tableName}`, {
      limit,
      offset,
      orderBy,
      orderDirection,
      filters
    });

    const anonKey = project?.supabase_anon_key;
    const encryptedServiceKey = project?.supabase_service_key_encrypted;

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

    console.log('🔐 Using PROJECT-level service key for admin dashboard access...');
    let serviceKey;
    try {
      serviceKey = decrypt(JSON.parse(encryptedServiceKey));
      if (!serviceKey) {
        throw new Error('Failed to decrypt service key');
      }
    } catch (decryptError) {
      console.error('Service key decryption failed:', decryptError);
      return res.status(500).json({
        success: false,
        message: 'Failed to decrypt service key. Please reconnect to Supabase.'
      });
    }

    // Construct query URL
    let queryUrl = `${project.supabase_url}/rest/v1/${tableName}?select=*`;

    // Add pagination
    queryUrl += `&limit=${limit}&offset=${offset}`;

    // Add sorting
    if (orderBy) {
      const direction = orderDirection === 'desc' ? 'desc' : 'asc';
      queryUrl += `&order=${orderBy}.${direction}`;
    }

    // Add specific column filters
    Object.entries(filters).forEach(([key, value]) => {
      if (key !== 'search' && value !== undefined && value !== null && value !== '') {
        queryUrl += `&${key}=eq.${encodeURIComponent(String(value))}`;
      }
    });

    // Handle global search if present
    if (filters.search) {
      try {
        // We need to know text columns for global search
        // Reuse the schema fetching logic or make a quick call to get columns
        const schemaUrl = `${project.supabase_url}/rest/v1/${tableName}?limit=1`;
        const schemaResponse = await fetch(schemaUrl, {
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey
          }
        });

        if (schemaResponse.ok) {
          const sampleData = await schemaResponse.json();
          if (sampleData.length > 0) {
            // Find string columns from the sample data
            const textColumns = Object.keys(sampleData[0]).filter(key =>
              typeof sampleData[0][key] === 'string'
            );

            if (textColumns.length > 0) {
              // Construct OR filter: col1.ilike.*val*,col2.ilike.*val*
              const searchVal = `*${filters.search}*`;
              const orFilter = textColumns.map(col => `${col}.ilike.${searchVal}`).join(',');
              queryUrl += `&or=(${orFilter})`;
            }
          }
        }
      } catch (err) {
        console.warn('Failed to infer columns for search, skipping search filter', err);
      }
    }

    console.log('Query URL:', queryUrl);

    response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact' // Request total count
      }
    });

    if (response.ok) {
      const data = await response.json();

      // Get total count from Content-Range header
      // Format: 0-19/125
      const contentRange = response.headers.get('content-range');
      let total = 0;
      if (contentRange) {
        const parts = contentRange.split('/');
        if (parts.length === 2) {
          total = parseInt(parts[1], 10) || 0;
        }
      } else {
        total = Array.isArray(data) ? data.length : 0;
      }

      console.log(`Success with ${authMethod} key. Rows fetched: ${Array.isArray(data) ? data.length : 0}, Total: ${total}`);

      // Always return data array, even if empty
      const responseData = Array.isArray(data) ? data : [];

      res.json({
        success: true,
        data: responseData,
        authMethod,
        total: total
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