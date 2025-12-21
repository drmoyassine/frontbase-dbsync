const express = require('express');
const { authenticateToken } = require('../auth');
const DatabaseManager = require('../../../utils/db');
const { encrypt } = require('../../../utils/encryption');

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

module.exports = router;
