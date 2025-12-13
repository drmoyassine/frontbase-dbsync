const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('../auth');
const DatabaseManager = require('../../../utils/db');
const { getProjectContext, handleRouteError } = require('./utils');

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
        const { tableName } = req.params;
        const { limit = 20, offset = 0, orderBy, orderDirection, mode = 'builder', select = '*' } = req.query;

        // Get project context (credentials, auth keys)
        const { supabaseUrl, anonKey, authKey, authMethod } = getProjectContext(db, mode, req);

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
            limit, offset, orderBy, orderDirection, filters, mode, searchColumns
        });

        // Construct query URL
        let queryUrl = `${supabaseUrl}/rest/v1/${tableName}?select=${select}`;
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
                let textColumns = searchColumns;

                if (!textColumns || textColumns.length === 0) {
                    // Auto-detect text columns from sample data
                    const schemaUrl = `${supabaseUrl}/rest/v1/${tableName}?limit=1`;
                    const schemaResponse = await fetch(schemaUrl, {
                        headers: {
                            'Authorization': `Bearer ${authKey}`,
                            'apikey': anonKey
                        }
                    });

                    if (schemaResponse.ok) {
                        const sampleData = await schemaResponse.json();
                        if (sampleData.length > 0) {
                            textColumns = Object.keys(sampleData[0]).filter(key =>
                                typeof sampleData[0][key] === 'string'
                            );
                        }
                    }
                }

                if (textColumns && textColumns.length > 0) {
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
                'Prefer': 'count=exact'
            }
        });

        if (response.ok) {
            const data = await response.json();
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

            res.json({
                success: true,
                data: Array.isArray(data) ? data : [],
                authMethod,
                total: total,
                debug: { queryUrl, orderBy, orderDirection, mode }
            });
        } else {
            const errorText = await response.text();
            console.error(`Failed to fetch table data: ${response.status} - ${errorText}`);

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
        handleRouteError(res, error, 'Fetch table data');
    }
});

// Get distinct values for a column
router.post('/distinct-values', authenticateToken, async (req, res) => {
    try {
        const { tableName, column, mode = 'builder' } = req.body;

        if (!tableName || !column) {
            return res.status(400).json({ error: 'Table name and column required' });
        }

        const { supabaseUrl, anonKey, authKey } = getProjectContext(db, mode, req);

        // Fetch distinct values (limit to 1000)
        const queryUrl = `${supabaseUrl}/rest/v1/${tableName}?select=${column}&limit=1000`;

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
            const values = [...new Set(data.map(item => item[column]))].filter(val => val !== null && val !== undefined).sort();
            res.json({ success: true, data: values });
        } else {
            const errorText = await response.text();
            console.error('Failed to fetch distinct values:', errorText);
            res.status(400).json({ error: 'Failed to fetch values' });
        }
    } catch (error) {
        handleRouteError(res, error, 'Distinct values');
    }
});

// Create record
router.post('/table-data/:tableName', authenticateToken, async (req, res) => {
    try {
        const { tableName } = req.params;
        const data = req.body;
        const mode = 'builder'; // Operations default to builder (service role) usually, but let's check assumptions. 
        // Logic before always used service key. So mode='builder'.

        const { supabaseUrl, authKey } = getProjectContext(db, mode, req);

        const response = await fetch(`${supabaseUrl}/rest/v1/${tableName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authKey}`,
                'apikey': authKey,
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
        handleRouteError(res, error, 'Create record');
    }
});

// Update record
router.put('/table-data/:tableName/:id', authenticateToken, async (req, res) => {
    try {
        const { tableName, id } = req.params;
        const data = req.body;
        const mode = 'builder'; // Default to service key for writes in builder

        const { supabaseUrl, authKey } = getProjectContext(db, mode, req);

        const response = await fetch(`${supabaseUrl}/rest/v1/${tableName}?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${authKey}`,
                'apikey': authKey,
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
        handleRouteError(res, error, 'Update record');
    }
});

// Delete record
router.delete('/table-data/:tableName/:id', authenticateToken, async (req, res) => {
    try {
        const { tableName, id } = req.params;
        const mode = 'builder'; // Default to service key

        const { supabaseUrl, authKey } = getProjectContext(db, mode, req);

        const response = await fetch(`${supabaseUrl}/rest/v1/${tableName}?id=eq.${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authKey}`,
                'apikey': authKey,
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
        handleRouteError(res, error, 'Delete record');
    }
});


// Advanced Query (RPC Proxy)
router.post('/advanced-query', authenticateToken, async (req, res) => {
    try {
        const { rpcName, params, mode = 'builder' } = req.body;

        if (!rpcName) {
            return res.status(400).json({ error: 'RPC Function name required' });
        }

        const { supabaseUrl, anonKey, authKey } = getProjectContext(db, mode, req);

        // Call Supabase RPC
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authKey}`,
                'apikey': anonKey, // apikey header is always required by Supabase/Kong
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params || {})
        });

        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                res.json({ success: true, data: data, rows: data });
            } else {
                res.json({ success: true, ...data });
            }
        } else {
            const errorText = await response.text();
            console.error(`RPC ${rpcName} failed:`, errorText);
            res.status(response.status).json({ success: false, message: errorText });
        }
    } catch (error) {
        handleRouteError(res, error, 'Advanced query');
    }
});

module.exports = router;
