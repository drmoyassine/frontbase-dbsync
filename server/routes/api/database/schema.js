const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('../auth');
const DatabaseManager = require('../../../utils/db');
const { decrypt } = require('../../../utils/encryption');

const router = express.Router();
const db = new DatabaseManager();

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
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN true ELSE false END as is_primary,
        CASE WHEN tc.constraint_type = 'FOREIGN KEY' THEN true ELSE false END as is_foreign,
        ccu.table_name as foreign_table,
        ccu.column_name as foreign_column
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu 
        ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
      LEFT JOIN information_schema.table_constraints tc 
        ON kcu.constraint_name = tc.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.constraint_type = 'FOREIGN KEY'
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
            console.warn('⚠️ Schema RPC failed. The "exec_sql" function might be missing.');
            console.warn('Please run the "supabase_setup.sql" script in your Supabase SQL Editor to enable schema introspection.');

            // Try direct query to information_schema.columns (only works if exposed)
            const directUrl = `${project.supabase_url}/rest/v1/information_schema.columns?table_name=eq.${tableName}&table_schema=eq.public&select=column_name,data_type,is_nullable,column_default`;

            try {
                response = await fetch(directUrl, {
                    headers: {
                        'Authorization': `Bearer ${serviceKey}`,
                        'apikey': serviceKey,
                        'Content-Type': 'application/json'
                    }
                });
            } catch (e) {
                console.log('Direct information_schema query failed');
            }
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

module.exports = router;
