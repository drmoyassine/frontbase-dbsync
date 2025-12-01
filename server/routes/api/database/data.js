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
            console.log(`Sorting by: ${orderBy} (${orderDirection})`);
            const direction = orderDirection === 'desc' ? 'desc' : 'asc';
            // Ensure column name is properly encoded
            queryUrl += `&order=${encodeURIComponent(orderBy)}.${direction}`;
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

// Get distinct values for a column
router.post('/distinct-values', authenticateToken, async (req, res) => {
    try {
        const { tableName, column } = req.body;

        if (!tableName || !column) {
            return res.status(400).json({ error: 'Table name and column required' });
        }

        // Get PROJECT level Supabase connection including service key
        const project = db.db.prepare('SELECT supabase_url, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');

        if (!project?.supabase_service_key_encrypted || !project?.supabase_url) {
            return res.status(400).json({ error: 'Supabase credentials not found' });
        }

        const serviceKey = decrypt(JSON.parse(project.supabase_service_key_encrypted));
        if (!serviceKey) {
            return res.status(500).json({ error: 'Failed to decrypt service key' });
        }

        // Use RPC if available or direct query with distinct
        // Note: PostgREST doesn't support SELECT DISTINCT directly in the URL in older versions, 
        // but we can try using a group by or just fetching unique values if the dataset is small.
        // Better approach: Use a custom RPC or just fetch the column and dedupe in memory (limit to reasonable amount)

        const queryUrl = `${project.supabase_url}/rest/v1/${tableName}?select=${column}&limit=1000`; // Limit to 1000 to avoid performance issues

        const response = await fetch(queryUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${serviceKey}`,
                'apikey': serviceKey,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            // Deduplicate
            const values = [...new Set(data.map(item => item[column]))].filter(val => val !== null && val !== undefined).sort();

            res.json({ success: true, data: values });
        } else {
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

module.exports = router;
