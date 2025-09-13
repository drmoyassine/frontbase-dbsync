import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/init.js';

const router = express.Router();

// Get all projects for user
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    
    const projects = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);

    // Parse settings JSON
    const parsedProjects = projects.map(project => ({
      ...project,
      settings: project.settings ? JSON.parse(project.settings) : {}
    }));

    res.json(parsedProjects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Parse settings JSON
    project.settings = project.settings ? JSON.parse(project.settings) : {};

    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Create project
router.post('/', (req, res) => {
  try {
    const { name, description, settings = {} } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const db = getDatabase();
    const projectId = uuidv4();

    // Use transaction for atomic operation
    const insertProject = db.prepare('INSERT INTO projects (id, name, description, user_id, settings) VALUES (?, ?, ?, ?, ?)');
    const insertPage = db.prepare('INSERT INTO pages (id, project_id, name, slug, title, is_homepage, layout_data) VALUES (?, ?, ?, ?, ?, ?, ?)');

    const transaction = db.transaction(() => {
      insertProject.run(projectId, name, description, req.user.id, JSON.stringify(settings));
      
      // Create default homepage
      const pageId = uuidv4();
      insertPage.run(pageId, projectId, 'Home', 'home', 'Home Page', 1, JSON.stringify([]));
    });

    transaction();

    res.status(201).json({
      id: projectId,
      name,
      description,
      user_id: req.user.id,
      settings,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
router.put('/:id', (req, res) => {
  try {
    const { name, description, settings } = req.body;
    const db = getDatabase();

    // Check if project exists and user owns it
    const existingProject = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (settings !== undefined) {
      updates.push('settings = ?');
      values.push(JSON.stringify(settings));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id, req.user.id);

    const updateQuery = `UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;
    const result = db.prepare(updateQuery).run(...values);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get updated project
    const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    updatedProject.settings = updatedProject.settings ? JSON.parse(updatedProject.settings) : {};

    res.json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();

    // Check if project exists and user owns it
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete project (pages will be deleted by CASCADE)
    const result = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Get application variables for a project
router.get('/:id/variables', (req, res) => {
  try {
    const db = getDatabase();

    // Check if user owns the project
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get variables
    const variables = db.prepare('SELECT * FROM app_variables WHERE project_id = ? ORDER BY name').all(req.params.id);

    res.json(variables);
  } catch (error) {
    console.error('Error fetching variables:', error);
    res.status(500).json({ error: 'Failed to fetch variables' });
  }
});

// Add or update application variable
router.post('/:id/variables', (req, res) => {
  try {
    const { name, value, type = 'static' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Variable name is required' });
    }

    const db = getDatabase();

    // Check if user owns the project
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const variableId = uuidv4();

    // Use INSERT OR REPLACE to handle updates
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO app_variables (id, project_id, name, value, type, updated_at) 
      VALUES (
        COALESCE((SELECT id FROM app_variables WHERE project_id = ? AND name = ?), ?),
        ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
    `);

    stmt.run(req.params.id, name, variableId, req.params.id, name, value, type);

    // Get the created/updated variable
    const variable = db.prepare('SELECT * FROM app_variables WHERE project_id = ? AND name = ?').get(req.params.id, name);

    res.status(201).json(variable);
  } catch (error) {
    console.error('Error creating/updating variable:', error);
    res.status(500).json({ error: 'Failed to create/update variable' });
  }
});

// Delete application variable
router.delete('/:projectId/variables/:variableId', (req, res) => {
  try {
    const db = getDatabase();

    // Check if user owns the project
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.projectId, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete the variable
    const result = db.prepare('DELETE FROM app_variables WHERE id = ? AND project_id = ?').run(req.params.variableId, req.params.projectId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Variable not found' });
    }

    res.json({ message: 'Variable deleted successfully' });
  } catch (error) {
    console.error('Error deleting variable:', error);
    res.status(500).json({ error: 'Failed to delete variable' });
  }
});

export default router;