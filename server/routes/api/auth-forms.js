const express = require('express');
const router = express.Router();

module.exports = (db) => {
    // GET /api/auth-forms
    router.get('/', (req, res) => {
        try {
            const forms = db.getAllAuthForms();
            res.json({ success: true, data: forms });
        } catch (error) {
            console.error('Error fetching auth forms:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/auth-forms/:id
    router.get('/:id', (req, res) => {
        try {
            const form = db.getAuthForm(req.params.id);
            if (!form) {
                return res.status(404).json({ success: false, error: 'Form not found' });
            }
            res.json({ success: true, data: form });
        } catch (error) {
            console.error('Error fetching auth form:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/auth-forms
    router.post('/', (req, res) => {
        try {
            const form = db.createAuthForm(req.body);
            res.status(201).json({ success: true, data: form });
        } catch (error) {
            console.error('Error creating auth form:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // PUT /api/auth-forms/:id
    router.put('/:id', (req, res) => {
        try {
            const form = db.updateAuthForm(req.params.id, req.body);
            if (!form) {
                return res.status(404).json({ success: false, error: 'Form not found' });
            }
            res.json({ success: true, data: form });
        } catch (error) {
            console.error('Error updating auth form:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // DELETE /api/auth-forms/:id
    router.delete('/:id', (req, res) => {
        try {
            const success = db.deleteAuthForm(req.params.id);
            if (!success) {
                return res.status(404).json({ success: false, error: 'Form not found' });
            }
            res.json({ success: true, message: 'Form deleted' });
        } catch (error) {
            console.error('Error deleting auth form:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
};
