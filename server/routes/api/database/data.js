const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('../auth');
const DatabaseManager = require('../../../utils/db');
const { decrypt } = require('../../../utils/encryption');

const router = express.Router();
const db = new DatabaseManager();

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
        const { limit = 20, offset = 0, orderBy, orderDirection, mode = 'builder', select = '*' } = req.query;

        // Extract filter parameters
        const filters = {};
        Object.keys(req.query).forEach(key => {
            if (key.startsWith('filter_')) {
                filters[key.replace('filter_', '')] = req.query[key];
            }
        });

        // Extract searchColumns parameter
        const searchColumns = req.query.searchColumns ? req.query.searchColumns.split(',') : undefined;

        console.log(`🔍 Fetching data for table: ${tableName}`, {
            limit,
            offset,
            orderBy,
            orderDirection,
            filters,
            mode,
            searchColumns
        });

        const anonKey = project?.supabase_anon_key;
        const encryptedServiceKey = project?.supabase_service_key_encrypted;

        if (!anonKey || !project?.supabase_url) {
            return res.status(400).json({
                success: false,
                message: 'Supabase credentials not found at PROJECT level'
            });
        }

        let authKey;
        let authMethod;

        // Determine which key to use based on mode and authentication
        if (mode === 'builder') {
            // Builder mode: Use service key (admin access, bypasses RLS)
            if (!encryptedServiceKey) {
                return res.status(400).json({
                    success: false,
                    message: 'Service key required for builder mode. Please reconnect to Supabase.'
                });
            }

            console.log('🔐 Builder mode: Using PROJECT-level service key for admin access...');
            try {
                authKey = decrypt(JSON.parse(encryptedServiceKey));
                if (!authKey) {
                    throw new Error('Failed to decrypt service key');
                }
                authMethod = 'service';
            } catch (decryptError) {
                console.error('Service key decryption failed:', decryptError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to decrypt service key. Please reconnect to Supabase.'
                });
            }
        } else if (mode === 'published') {
            // Published mode: Use anon key or user JWT
            const userJWT = req.headers.authorization?.replace('Bearer ', '');

            if (userJWT && userJWT !== anonKey) {
                // User is authenticated: Forward JWT for RLS
                authKey = userJWT;
                authMethod = 'user-jwt';
                console.log('🔐 Published mode: Using user JWT for RLS-aware access...');
            } else {
                // Anonymous access: Use anon key
                authKey = anonKey;
                authMethod = 'anon';
                console.log('🔐 Published mode: Using anon key for public access...');
            }
        } else {
            return res.status(400).json({
                success: false,
                message: `Invalid mode: ${mode}. Expected 'builder' or 'published'.`
            });
        }

        // Construct query URL
        let queryUrl = `${project.supabase_url}/rest/v1/${tableName}?select=${select}`;

        // Add pagination
        queryUrl += `&limit=${limit}&offset=${offset}`;

        // Add sorting
        if (orderBy) {
            const direction = orderDirection === 'desc' ? 'desc' : 'asc';

            console.log(`🔍 SORTING DEBUG:`);
            console.log(`  - orderBy: ${orderBy}`);
            console.log(`  - orderDirection: ${orderDirection}`);
            console.log(`  - direction: ${direction}`);

            // PostgREST order syntax: order=columnName.direction
            queryUrl += `&order=${orderBy}.${direction}`;

            console.log(`  - Final order param: order=${orderBy}.${direction}`);
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
                // If searchColumns specified, use them; otherwise fetch schema
                let textColumns = searchColumns;

                if (!textColumns || textColumns.length === 0) {
                    // Auto-detect text columns from sample data
                    const schemaUrl = `${project.supabase_url}/rest/v1/${tableName}?limit=1`;
                    const schemaResponse = await fetch(schemaUrl, {
                        headers: {
                            'Authorization': `Bearer ${authKey}`,
                            'apikey': anonKey
                        }
                    });

                    if (schemaResponse.ok) {
                        const sampleData = await schemaResponse.json();
                        if (sampleData.length > 0) {
                            // Find string columns from the sample data
                            textColumns = Object.keys(sampleData[0]).filter(key =>
                                typeof sampleData[0][key] === 'string'
                            );
                        }
                    }
                }

                if (textColumns && textColumns.length > 0) {
                    // Construct OR filter: col1.ilike.*val*,col2.ilike.*val*
                    const searchVal = `*${filters.search}*`;
                    const orFilter = textColumns.map(col => `${col}.ilike.${searchVal}`).join(',');
                    queryUrl += `&or=(${orFilter})`;
                }
            } catch (err) {
                console.warn('Failed to process search filter', err);
            }
        }

        console.log('Query URL:', queryUrl);

        const response = await fetch(queryUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authKey}`,
                'apikey': anonKey,
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
                total: total,
                debug: {
                    queryUrl,
                    orderBy,
                    orderDirection,
                    mode
                }
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

// Get distinct values for a column
router.post('/distinct-values', authenticateToken, async (req, res) => {
    try {
        const { tableName, column, mode = 'builder' } = req.body;

        if (!tableName || !column) {
            return res.status(400).json({ error: 'Table name and column required' });
        }

        // Get PROJECT level Supabase connection including service key
        const project = db.db.prepare('SELECT supabase_url, supabase_anon_key, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');

        if (!project?.supabase_url) {
            return res.status(400).json({ error: 'Supabase credentials not found' });
        }

        const anonKey = project?.supabase_anon_key;
        const encryptedServiceKey = project?.supabase_service_key_encrypted;

        let authKey;

        // Determine which key to use based on mode
        if (mode === 'builder') {
            // Builder mode: Use service key (admin access, bypasses RLS)
            if (!encryptedServiceKey) {
                return res.status(400).json({ error: 'Service key required for builder mode' });
            }

            authKey = decrypt(JSON.parse(encryptedServiceKey));
            if (!authKey) {
                return res.status(500).json({ error: 'Failed to decrypt service key' });
            }
        } else if (mode === 'published') {
            // Published mode: Use anon key or user JWT
            const userJWT = req.headers.authorization?.replace('Bearer ', '');

            if (userJWT && userJWT !== anonKey) {
                // User is authenticated: Forward JWT for RLS
                authKey = userJWT;
            } else {
                // Anonymous access: Use anon key
                authKey = anonKey;
            }
        } else {
            return res.status(400).json({ error: `Invalid mode: ${mode}` });
        }

        // Fetch distinct values (limit to 1000 to avoid performance issues)
        const queryUrl = `${project.supabase_url}/rest/v1/${tableName}?select=${column}&limit=1000`;

        const response = await fetch(queryUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authKey}`,
                'apikey': anonKey,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            // Deduplicate and filter null values
            const values = [...new Set(data.map(item => item[column]))].filter(val => val !== null && val !== undefined).sort();

            res.json({ success: true, data: values });
        } else {
            const errorText = await response.text();
            console.error('Failed to fetch distinct values:', errorText);
            res.status(400).json({ error: 'Failed to fetch values' });
        }
    } catch (error) {
        console.error('Distinct values error:', error);
        res.status(500).json({ error: 'Failed to fetch distinct values' });
    }
});

// Create record
router.post('/table-data/:tableName', authenticateToken, async (req, res) => {
    try {
        const { tableName } = req.params;
        const data = req.body;

        // Get PROJECT level Supabase connection including service key
        const project = db.db.prepare('SELECT supabase_url, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');

        if (!project?.supabase_service_key_encrypted || !project?.supabase_url) {
            return res.status(400).json({ error: 'Supabase credentials not found' });
        }

        const serviceKey = decrypt(JSON.parse(project.supabase_service_key_encrypted));

        const response = await fetch(`${project.supabase_url}/rest/v1/${tableName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceKey}`,
                'apikey': serviceKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            const result = await response.json();
            res.json({ success: true, data: result });
        } else {
            const error = await response.text();
            res.status(400).json({ success: false, message: error });
        }
    } catch (error) {
        console.error('Create record error:', error);
        res.status(500).json({ error: 'Failed to create record' });
    }
});

// Update record
router.put('/table-data/:tableName/:id', authenticateToken, async (req, res) => {
    try {
        const { tableName, id } = req.params;
        const data = req.body;

        // Get PROJECT level Supabase connection including service key
        const project = db.db.prepare('SELECT supabase_url, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');

        if (!project?.supabase_service_key_encrypted || !project?.supabase_url) {
            return res.status(400).json({ error: 'Supabase credentials not found' });
        }

        const serviceKey = decrypt(JSON.parse(project.supabase_service_key_encrypted));

        // We need to know the primary key name. For now assume 'id' or try to infer?
        // The id param is passed in URL.
        // We'll try to match against 'id' column. If the table uses a different PK, this might fail.
        // A more robust solution would query the schema first to find the PK.
        // For now, let's assume 'id' is the PK or try to use the passed ID.

        const response = await fetch(`${project.supabase_url}/rest/v1/${tableName}?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${serviceKey}`,
                'apikey': serviceKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            const result = await response.json();
            res.json({ success: true, data: result });
        } else {
            const error = await response.text();
            res.status(400).json({ success: false, message: error });
        }
    } catch (error) {
        console.error('Update record error:', error);
        res.status(500).json({ error: 'Failed to update record' });
    }
});

// Delete record
router.delete('/table-data/:tableName/:id', authenticateToken, async (req, res) => {
    try {
        const { tableName, id } = req.params;

        // Get PROJECT level Supabase connection including service key
        const project = db.db.prepare('SELECT supabase_url, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');

        if (!project?.supabase_service_key_encrypted || !project?.supabase_url) {
            return res.status(400).json({ error: 'Supabase credentials not found' });
        }

        const serviceKey = decrypt(JSON.parse(project.supabase_service_key_encrypted));

        const response = await fetch(`${project.supabase_url}/rest/v1/${tableName}?id=eq.${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${serviceKey}`,
                'apikey': serviceKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            }
        });

        if (response.ok) {
            const result = await response.json();
            res.json({ success: true, data: result });
        } else {
            const error = await response.text();
            res.status(400).json({ success: false, message: error });
        }
    } catch (error) {
        console.error('Delete record error:', error);
        res.status(500).json({ error: 'Failed to delete record' });
    }
});


// Advanced Query (RPC Proxy)
router.post('/advanced-query', authenticateToken, async (req, res) => {
    try {
        const { tableName, rpcName, params, mode = 'builder' } = req.body;

        if (!rpcName) {
            return res.status(400).json({ error: 'RPC Function name required' });
        }

        // Get PROJECT level Supabase connection
        const project = db.db.prepare('SELECT supabase_url, supabase_anon_key, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');

        if (!project?.supabase_url) {
            return res.status(400).json({ error: 'Supabase credentials not found' });
        }

        const anonKey = project?.supabase_anon_key;
        const encryptedServiceKey = project?.supabase_service_key_encrypted;
        let authKey;

        // Determine Auth Key
        if (mode === 'builder') {
            if (!encryptedServiceKey) {
                return res.status(400).json({ error: 'Service key required for builder mode' });
            }
            try {
                authKey = decrypt(JSON.parse(encryptedServiceKey));
            } catch (e) {
                return res.status(500).json({ error: 'Failed to decrypt service key' });
            }
        } else {
            // Published/User mode
            const userJWT = req.headers.authorization?.replace('Bearer ', '');
            if (userJWT && userJWT !== anonKey) {
                authKey = userJWT;
            } else {
                authKey = anonKey;
            }
        }

        // Call Supabase RPC
        const response = await fetch(`${project.supabase_url}/rest/v1/rpc/${rpcName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authKey}`,
                'apikey': anonKey, // apikey header is always required by Supabase/Kong
                'Content-Type': 'application/json',
                'Prefer': 'params=single-object' // Force single JSON object argument
            },
            body: JSON.stringify(params || {})
        });

        if (response.ok) {
            const data = await response.json();
            // RPCs usually return the result directly.
            // frontbase_get_rows returns { rows: [], total: ... }
            res.json({ success: true, ...data });
        } else {
            const errorText = await response.text();
            console.error(`RPC ${rpcName} failed:`, errorText);
            res.status(response.status).json({ success: false, message: errorText });
        }
    } catch (error) {
        console.error('Advanced query error:', error);
        res.status(500).json({ error: 'Failed to execute advanced query' });
    }
});

module.exports = router;
