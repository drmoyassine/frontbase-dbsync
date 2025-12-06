const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

module.exports = (db) => {
  // GET /api/pages - Get all pages
  router.get('/', (req, res) => {
    try {
      const includeDeleted = req.query.includeDeleted === 'true';
      const pages = db.getAllPages(includeDeleted);
      res.json({
        success: true,
        data: pages
      });
    } catch (error) {
      console.error('Error getting pages:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // GET /api/pages/:id - Get specific page
  router.get('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const page = db.getPage(id);

      if (!page) {
        return res.status(404).json({
          success: false,
          error: 'Page not found'
        });
      }

      res.json({
        success: true,
        data: page
      });
    } catch (error) {
      console.error('Error getting page:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // POST /api/pages - Create new page
  router.post('/', (req, res) => {
    try {
      console.log('📝 Create page request body:', JSON.stringify(req.body, null, 2));

      const pageData = {
        id: uuidv4(),
        ...req.body,
        layoutData: req.body.layoutData || { content: [], root: {} }
      };

      console.log('📝 Processed pageData:', JSON.stringify(pageData, null, 2));

      // Validate required fields
      if (!pageData.name || !pageData.slug) {
        console.error('❌ Validation failed - name:', pageData.name, 'slug:', pageData.slug);
        return res.status(400).json({
          success: false,
          error: 'Name and slug are required'
        });
      }

      const page = db.createPage(pageData);

      res.status(201).json({
        success: true,
        data: page
      });
    } catch (error) {
      console.error('Error creating page:', error);

      // Handle unique constraint violation for slug
      if (error.message.includes('UNIQUE constraint failed: pages.slug')) {
        return res.status(400).json({
          success: false,
          error: 'A page with this slug already exists'
        });
      }

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // PUT /api/pages/:id - Update page
  router.put('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      console.log('📝 Update page request:', {
        id,
        hasLayoutData: !!updates.layoutData,
        layoutDataSize: updates.layoutData ? JSON.stringify(updates.layoutData).length : 0,
        updateKeys: Object.keys(updates)
      });

      const page = db.updatePage(id, updates);

      if (!page) {
        return res.status(404).json({
          success: false,
          error: 'Page not found'
        });
      }

      console.log('📝 Page updated successfully:', {
        id,
        hasLayoutData: !!page.layoutData
      });

      res.json({
        success: true,
        data: page
      });
    } catch (error) {
      console.error('Error updating page:', error);

      // Handle unique constraint violation for slug
      if (error.message.includes('UNIQUE constraint failed: pages.slug')) {
        return res.status(400).json({
          success: false,
          error: 'A page with this slug already exists'
        });
      }

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // DELETE /api/pages/:id - Soft delete page
  router.delete('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const page = db.getPage(id);
      if (!page) {
        return res.status(404).json({
          success: false,
          error: 'Page not found'
        });
      }

      // Append timestamp to slug to allow reuse of the original slug
      const newSlug = `${page.slug}-deleted-${Date.now()}`;

      db.updatePage(id, {
        deletedAt: new Date().toISOString(),
        slug: newSlug
      });

      res.json({
        success: true,
        message: 'Page moved to trash successfully'
      });
    } catch (error) {
      console.error('Error deleting page:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // PUT /api/pages/:id/layout - Update page layout data
  router.put('/:id/layout', (req, res) => {
    try {
      const { id } = req.params;
      const { layoutData } = req.body;

      if (!layoutData) {
        return res.status(400).json({
          success: false,
          error: 'layoutData is required'
        });
      }

      const page = db.updatePage(id, { layoutData });

      if (!page) {
        return res.status(404).json({
          success: false,
          error: 'Page not found'
        });
      }

      res.json({
        success: true,
        data: page
      });
    } catch (error) {
      console.error('Error updating page layout:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // POST /api/pages/:id/restore - Restore deleted page
  router.post('/:id/restore', (req, res) => {
    try {
      const { id } = req.params;
      const page = db.getPage(id);
      if (!page) {
        return res.status(404).json({
          success: false,
          error: 'Page not found'
        });
      }

      // Try to restore original slug
      let newSlug = page.slug;
      if (newSlug.includes('-deleted-')) {
        newSlug = newSlug.split('-deleted-')[0];
      }

      try {
        db.updatePage(id, { deletedAt: null, slug: newSlug });
      } catch (error) {
        // If slug is taken, append -restored suffix
        if (error.message.includes('UNIQUE constraint')) {
          newSlug = `${newSlug}-restored-${Date.now()}`;
          db.updatePage(id, { deletedAt: null, slug: newSlug });
        } else {
          throw error;
        }
      }

      const updatedPage = db.getPage(id);

      res.json({
        success: true,
        data: updatedPage,
        message: 'Page restored successfully'
      });
    } catch (error) {
      console.error('Error restoring page:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // DELETE /api/pages/:id/permanent - Permanently delete page
  router.delete('/:id/permanent', (req, res) => {
    try {
      const { id } = req.params;
      const success = db.deletePage(id);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Page not found'
        });
      }

      res.json({
        success: true,
        message: 'Page permanently deleted'
      });
    } catch (error) {
      console.error('Error permanently deleting page:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};
