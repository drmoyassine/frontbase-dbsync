import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/init.js';

const router = express.Router();

// Get all pages for a project
router.get('/project/:projectId', (req, res) => {
  try {
    const db = getDatabase();
    
    // First check if user owns the project
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.projectId, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get pages
    const pages = db.prepare('SELECT * FROM pages WHERE project_id = ? ORDER BY created_at').all(req.params.projectId);

    // Parse layout_data JSON
    const parsedPages = pages.map(page => ({
      ...page,
      layout_data: page.layout_data ? JSON.parse(page.layout_data) : [],
      isPublic: Boolean(page.is_public),
      isHomepage: Boolean(page.is_homepage)
    }));

    res.json(parsedPages);
  } catch (error) {
    console.error('Error fetching pages:', error);
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

// Get single page
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Check if user owns the project containing this page
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(page.project_id, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Parse layout_data JSON
    page.layout_data = page.layout_data ? JSON.parse(page.layout_data) : [];
    page.isPublic = Boolean(page.is_public);
    page.isHomepage = Boolean(page.is_homepage);

    res.json(page);
  } catch (error) {
    console.error('Error fetching page:', error);
    res.status(500).json({ error: 'Failed to fetch page' });
  }
});

// Create page
router.post('/', (req, res) => {
  try {
    const { 
      project_id, 
      name, 
      slug, 
      title, 
      description, 
      keywords, 
      is_public = true, 
      is_homepage = false, 
      layout_data = [] 
    } = req.body;

    if (!project_id || !name) {
      return res.status(400).json({ error: 'Project ID and name are required' });
    }

    const db = getDatabase();

    // Check if user owns the project
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(project_id, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const pageId = uuidv4();
    const pageSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Use transaction for homepage logic
    const insertPage = db.prepare(`
      INSERT INTO pages (id, project_id, name, slug, title, description, keywords, is_public, is_homepage, layout_data) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateHomepage = db.prepare('UPDATE pages SET is_homepage = 0 WHERE project_id = ? AND id != ?');

    const transaction = db.transaction(() => {
      // If this is the new homepage, unset other pages
      if (is_homepage) {
        updateHomepage.run(project_id, pageId);
      }

      insertPage.run(
        pageId,
        project_id,
        name,
        pageSlug,
        title,
        description,
        keywords,
        is_public ? 1 : 0,
        is_homepage ? 1 : 0,
        JSON.stringify(layout_data)
      );
    });

    transaction();

    // Get the created page
    const createdPage = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);
    createdPage.layout_data = JSON.parse(createdPage.layout_data);
    createdPage.isPublic = Boolean(createdPage.is_public);
    createdPage.isHomepage = Boolean(createdPage.is_homepage);

    res.status(201).json(createdPage);
  } catch (error) {
    console.error('Error creating page:', error);
    res.status(500).json({ error: 'Failed to create page' });
  }
});

// Update page
router.put('/:id', (req, res) => {
  try {
    const { 
      name, 
      slug, 
      title, 
      description, 
      keywords, 
      is_public, 
      is_homepage, 
      layout_data 
    } = req.body;

    const db = getDatabase();

    // Get current page and verify ownership
    const currentPage = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);

    if (!currentPage) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Check if user owns the project
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(currentPage.project_id, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (slug !== undefined) {
      updates.push('slug = ?');
      values.push(slug);
    }
    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (keywords !== undefined) {
      updates.push('keywords = ?');
      values.push(keywords);
    }
    if (is_public !== undefined) {
      updates.push('is_public = ?');
      values.push(is_public ? 1 : 0);
    }
    if (is_homepage !== undefined) {
      updates.push('is_homepage = ?');
      values.push(is_homepage ? 1 : 0);
    }
    if (layout_data !== undefined) {
      updates.push('layout_data = ?');
      values.push(JSON.stringify(layout_data));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    const updateQuery = `UPDATE pages SET ${updates.join(', ')} WHERE id = ?`;

    // Use transaction for homepage logic
    const updatePage = db.prepare(updateQuery);
    const updateHomepage = db.prepare('UPDATE pages SET is_homepage = 0 WHERE project_id = ? AND id != ?');

    const transaction = db.transaction(() => {
      // If setting as homepage, unset other pages
      if (is_homepage === true) {
        updateHomepage.run(currentPage.project_id, req.params.id);
      }

      updatePage.run(...values);
    });

    transaction();

    // Get updated page
    const updatedPage = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    updatedPage.layout_data = JSON.parse(updatedPage.layout_data);
    updatedPage.isPublic = Boolean(updatedPage.is_public);
    updatedPage.isHomepage = Boolean(updatedPage.is_homepage);

    res.json(updatedPage);
  } catch (error) {
    console.error('Error updating page:', error);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

// Delete page
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();

    // Get current page and verify ownership
    const currentPage = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);

    if (!currentPage) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Check if user owns the project
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(currentPage.project_id, req.user.id);

    if (!project) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Check if this is the only page in the project
    const pageCount = db.prepare('SELECT COUNT(*) as count FROM pages WHERE project_id = ?').get(currentPage.project_id);

    if (pageCount.count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last page in a project' });
    }

    // Delete the page
    const result = db.prepare('DELETE FROM pages WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    res.json({ message: 'Page deleted successfully' });
  } catch (error) {
    console.error('Error deleting page:', error);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

export default router;