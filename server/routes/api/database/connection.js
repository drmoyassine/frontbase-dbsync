const express = require('express');
const { z } = require('zod');
const DatabaseManager = require('../../../utils/db');
const { encrypt } = require('../../../utils/encryption');
const {
    validateBody,
    validateQuery
} = require('../../../validation/middleware');
const {
    TestConnectionRequestSchema,
    ConnectSupabaseRequestSchema
} = require('../../../validation/schemas');

const router = express.Router();
const db = new DatabaseManager();

// No-op middleware for authenticateToken since auth is removed
const authenticateToken = (req, res, next) => next();

// Get database connections (PROJECT level)
router.get('/connections', authenticateToken, validateQuery(z.object({
    schema: z.string().optional().default('public')
})), async (req, res) => {
    try {
        console.log('📡 Fetching Supabase connections at PROJECT level...');
        // Get project-level Supabase settings including service key
        const project = db.db.prepare('SELECT supabase_url, supabase_anon_key, supabase_service_key_encrypted FROM project WHERE id = ?').get('default');

        const connections = {
            supabase: {
                connected: !!(project?.supabase_url && project?.supabase_anon_key),
                url: project?.supabase_url || '',
                hasServiceKey: !!project?.supabase_service_key_encrypted
            }
        };

        console.log('🔍 Connection status debug:', {
            project_url: !!project?.supabase_url,
            project_anon: !!project?.supabase_anon_key,
            project_service_key: !!project?.supabase_service_key_encrypted,
            connected: connections.supabase.connected
        });

        res.json({
            success: true,
            data: connections
        });
    } catch (error) {
        console.error('Get connections error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get connections'
        });
    }
});

// Test Supabase connection
router.post('/test-supabase', authenticateToken, validateBody(TestConnectionRequestSchema), async (req, res) => {
    try {
        const { url, anonKey } = req.body;

        // Test the connection by making a simple request
        const testResponse = await fetch(`${url}/rest/v1/`, {
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${anonKey}`
            }
        });

        if (testResponse.ok) {
            res.json({
                success: true,
                message: 'Connection successful'
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Connection failed - invalid credentials'
            });
        }
    } catch (error) {
        console.error('Test connection error:', error);
        res.status(400).json({
            success: false,
            error: 'Connection failed - unable to reach server'
        });
    }
});

// Save Supabase connection (PROJECT level)
router.post('/connect-supabase', authenticateToken, validateBody(ConnectSupabaseRequestSchema), async (req, res) => {
    try {
        const { url, anonKey, serviceKey } = req.body;

        console.log('🔧 Saving Supabase connection at PROJECT level...');

        // Save connection details at PROJECT level
        let updateData = { supabase_url: url, supabase_anon_key: anonKey };

        // Encrypt and save service key if provided
        if (serviceKey) {
            console.log('🔐 Storing service key...');
            const encryptedServiceKey = encrypt(serviceKey);
            updateData.supabase_service_key_encrypted = JSON.stringify(encryptedServiceKey);
        }

        db.updateProject(updateData);

        // Verify the save
        const savedProject = db.getProject();
        console.log('✅ Supabase connection saved:', {
            url_saved: !!savedProject.supabase_url,
            anon_key_saved: !!savedProject.supabase_anon_key,
            service_key_saved: !!savedProject.supabase_service_key_encrypted
        });

        res.json({
            success: true,
            message: 'Connection saved successfully'
        });
    } catch (error) {
        console.error('Save connection error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save connection'
        });
    }
});

// Disconnect Supabase (PROJECT level)
router.delete('/disconnect-supabase', authenticateToken, async (req, res) => {
    try {
        console.log('🔧 Disconnecting Supabase...');

        db.updateProject({
            supabase_url: null,
            supabase_anon_key: null,
            supabase_service_key_encrypted: null
        });

        res.json({
            success: true,
            message: 'Disconnected successfully'
        });
    } catch (error) {
        console.error('Disconnect error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to disconnect'
        });
    }
});

module.exports = router;
