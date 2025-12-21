const express = require('express');
const router = express.Router();

module.exports = (db) => {
  // GET /api/project - Get current project
  router.get('/', (req, res) => {
    try {
      const project = db.getProject();
      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      console.error('Error getting project:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // PUT /api/project - Update project
  router.put('/', (req, res) => {
    try {
      const updates = req.body;

      // Handle camelCase to snake_case mapping for specific fields
      if ('usersConfig' in updates) {
        updates.users_config = typeof updates.usersConfig === 'object'
          ? JSON.stringify(updates.usersConfig)
          : updates.usersConfig;
        delete updates.usersConfig;
      }

      const project = db.updateProject(updates);

      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      console.error('Error updating project:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};