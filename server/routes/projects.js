const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database/init');

const router = express.Router();

// Get all projects for user
router.get('/', (req, res) => {
  const db = getDatabase();
  
  db.all(
    'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
    [req.user.id],
    (err, projects) => {
      if (err) {
        console.error('Error fetching projects:', err);
        return res.status(500).json({ error: 'Failed to fetch projects' });
      }

      // Parse settings JSON
      const parsedProjects = projects.map(project => ({
        ...project,
        settings: project.settings ? JSON.parse(project.settings) : {}
      }));

      res.json(parsedProjects);
    }
  );
});

// Get single project
router.get('/:id', (req, res) => {
  const db = getDatabase();
  
  db.get(
    'SELECT * FROM projects WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, project) => {
      if (err) {
        console.error('Error fetching project:', err);
        return res.status(500).json({ error: 'Failed to fetch project' });
      }

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Parse settings JSON
      project.settings = project.settings ? JSON.parse(project.settings) : {};

      res.json(project);
    }
  );
});

// Create project
router.post('/', (req, res) => {
  const { name, description, settings = {} } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  const db = getDatabase();
  const projectId = uuidv4();

  db.run(
    'INSERT INTO projects (id, name, description, user_id, settings) VALUES (?, ?, ?, ?, ?)',
    [projectId, name, description, req.user.id, JSON.stringify(settings)],
    function(err) {
      if (err) {
        console.error('Error creating project:', err);
        return res.status(500).json({ error: 'Failed to create project' });
      }

      // Create default homepage
      const pageId = uuidv4();
      db.run(
        'INSERT INTO pages (id, project_id, name, slug, title, is_homepage, layout_data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [pageId, projectId, 'Home', 'home', 'Home Page', 1, JSON.stringify([])],
        (err) => {
          if (err) {
            console.error('Error creating default page:', err);
            return res.status(500).json({ error: 'Failed to create default page' });
          }

          res.status(201).json({
            id: projectId,
            name,
            description,
            user_id: req.user.id,
            settings,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      );
    }
  );
});

// Update project
router.put('/:id', (req, res) => {
  const { name, description, settings } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  const db = getDatabase();

  db.run(
    'UPDATE projects SET name = ?, description = ?, settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [name, description, JSON.stringify(settings || {}), req.params.id, req.user.id],
    function(err) {
      if (err) {
        console.error('Error updating project:', err);
        return res.status(500).json({ error: 'Failed to update project' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      res.json({ message: 'Project updated successfully' });
    }
  );
});

// Delete project
router.delete('/:id', (req, res) => {
  const db = getDatabase();

  db.run(
    'DELETE FROM projects WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    function(err) {
      if (err) {
        console.error('Error deleting project:', err);
        return res.status(500).json({ error: 'Failed to delete project' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      res.json({ message: 'Project deleted successfully' });
    }
  );
});

// Get project app variables
router.get('/:id/variables', (req, res) => {
  const db = getDatabase();
  
  // First check if user owns the project
  db.get(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, project) => {
      if (err) {
        console.error('Error checking project ownership:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Get variables
      db.all(
        'SELECT * FROM app_variables WHERE project_id = ? ORDER BY name',
        [req.params.id],
        (err, variables) => {
          if (err) {
            console.error('Error fetching variables:', err);
            return res.status(500).json({ error: 'Failed to fetch variables' });
          }

          res.json(variables);
        }
      );
    }
  );
});

// Add/Update app variable
router.post('/:id/variables', (req, res) => {
  const { name, value, type = 'static' } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Variable name is required' });
  }

  const db = getDatabase();
  
  // First check if user owns the project
  db.get(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, project) => {
      if (err) {
        console.error('Error checking project ownership:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const variableId = uuidv4();
      
      // Insert or replace variable
      db.run(
        `INSERT OR REPLACE INTO app_variables (id, project_id, name, value, type, updated_at) 
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [variableId, req.params.id, name, value, type],
        function(err) {
          if (err) {
            console.error('Error saving variable:', err);
            return res.status(500).json({ error: 'Failed to save variable' });
          }

          res.json({
            id: variableId,
            project_id: req.params.id,
            name,
            value,
            type,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      );
    }
  );
});

// Delete app variable
router.delete('/:projectId/variables/:variableId', (req, res) => {
  const db = getDatabase();
  
  // First check if user owns the project
  db.get(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?',
    [req.params.projectId, req.user.id],
    (err, project) => {
      if (err) {
        console.error('Error checking project ownership:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Delete variable
      db.run(
        'DELETE FROM app_variables WHERE id = ? AND project_id = ?',
        [req.params.variableId, req.params.projectId],
        function(err) {
          if (err) {
            console.error('Error deleting variable:', err);
            return res.status(500).json({ error: 'Failed to delete variable' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: 'Variable not found' });
          }

          res.json({ message: 'Variable deleted successfully' });
        }
      );
    }
  );
});

module.exports = router;