const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

module.exports = (db) => {
  // GET /api/variables - Get all app variables
  router.get('/', (req, res) => {
    try {
      const variables = db.getAllVariables();
      res.json({
        success: true,
        data: variables
      });
    } catch (error) {
      console.error('Error getting variables:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // GET /api/variables/:id - Get specific variable
  router.get('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const variable = db.getVariable(id);
      
      if (!variable) {
        return res.status(404).json({
          success: false,
          error: 'Variable not found'
        });
      }
      
      res.json({
        success: true,
        data: variable
      });
    } catch (error) {
      console.error('Error getting variable:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // POST /api/variables - Create new variable
  router.post('/', (req, res) => {
    try {
      const variableData = {
        id: uuidv4(),
        ...req.body
      };
      
      // Validate required fields
      if (!variableData.name || !variableData.type) {
        return res.status(400).json({
          success: false,
          error: 'Name and type are required'
        });
      }
      
      // Validate type
      if (!['variable', 'calculated'].includes(variableData.type)) {
        return res.status(400).json({
          success: false,
          error: 'Type must be either "variable" or "calculated"'
        });
      }
      
      const variable = db.createVariable(variableData);
      
      res.status(201).json({
        success: true,
        data: variable
      });
    } catch (error) {
      console.error('Error creating variable:', error);
      
      // Handle unique constraint violation for name
      if (error.message.includes('UNIQUE constraint failed: app_variables.name')) {
        return res.status(400).json({
          success: false,
          error: 'A variable with this name already exists'
        });
      }
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // PUT /api/variables/:id - Update variable
  router.put('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Validate type if provided
      if (updates.type && !['variable', 'calculated'].includes(updates.type)) {
        return res.status(400).json({
          success: false,
          error: 'Type must be either "variable" or "calculated"'
        });
      }
      
      const variable = db.updateVariable(id, updates);
      
      if (!variable) {
        return res.status(404).json({
          success: false,
          error: 'Variable not found'
        });
      }
      
      res.json({
        success: true,
        data: variable
      });
    } catch (error) {
      console.error('Error updating variable:', error);
      
      // Handle unique constraint violation for name
      if (error.message.includes('UNIQUE constraint failed: app_variables.name')) {
        return res.status(400).json({
          success: false,
          error: 'A variable with this name already exists'
        });
      }
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // DELETE /api/variables/:id - Delete variable
  router.delete('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const success = db.deleteVariable(id);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Variable not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Variable deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting variable:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};