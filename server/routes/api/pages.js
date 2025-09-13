const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

module.exports = (db) => {
  // GET /api/pages - Get all pages
  router.get('/', (req, res) => {
    try {
      const pages = db.getAllPages();
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
      const pageData = {
        id: uuidv4(),
        ...req.body,
        layoutData: req.body.layoutData || { content: [], root: {} }
      };
      
      // Validate required fields
      if (!pageData.name || !pageData.slug) {
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
      
      const page = db.updatePage(id, updates);
      
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

  // DELETE /api/pages/:id - Delete page
  router.delete('/:id', (req, res) => {
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
        message: 'Page deleted successfully'
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

  return router;
};