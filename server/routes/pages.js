import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/init.js';

const router = express.Router();

// Get all pages for a project
router.get('/project/:projectId', (req, res) => {
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

      // Get pages
      db.all(
        'SELECT * FROM pages WHERE project_id = ? ORDER BY created_at',
        [req.params.projectId],
        (err, pages) => {
          if (err) {
            console.error('Error fetching pages:', err);
            return res.status(500).json({ error: 'Failed to fetch pages' });
          }

          // Parse layout_data JSON
          const parsedPages = pages.map(page => ({
            ...page,
            layout_data: page.layout_data ? JSON.parse(page.layout_data) : [],
            isPublic: Boolean(page.is_public),
            isHomepage: Boolean(page.is_homepage)
          }));

          res.json(parsedPages);
        }
      );
    }
  );
});

// Get single page
router.get('/:id', (req, res) => {
  const db = getDatabase();
  
  db.get(
    `SELECT p.*, pr.user_id FROM pages p 
     JOIN projects pr ON p.project_id = pr.id 
     WHERE p.id = ? AND pr.user_id = ?`,
    [req.params.id, req.user.id],
    (err, page) => {
      if (err) {
        console.error('Error fetching page:', err);
        return res.status(500).json({ error: 'Failed to fetch page' });
      }

      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }

      // Parse layout_data JSON
      page.layout_data = page.layout_data ? JSON.parse(page.layout_data) : [];
      page.isPublic = Boolean(page.is_public);
      page.isHomepage = Boolean(page.is_homepage);

      res.json(page);
    }
  );
});

// Create page
router.post('/', (req, res) => {
  const { project_id, name, slug, title, description, keywords, isPublic = true, isHomepage = false, layout_data = [] } = req.body;

  if (!project_id || !name) {
    return res.status(400).json({ error: 'Project ID and page name are required' });
  }

  const db = getDatabase();
  
  // First check if user owns the project
  db.get(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?',
    [project_id, req.user.id],
    (err, project) => {
      if (err) {
        console.error('Error checking project ownership:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const pageId = uuidv4();
      const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      // If this is set as homepage, remove homepage flag from other pages
      if (isHomepage) {
        db.run(
          'UPDATE pages SET is_homepage = 0 WHERE project_id = ?',
          [project_id],
          (err) => {
            if (err) {
              console.error('Error updating homepage flags:', err);
            }
          }
        );
      }

      db.run(
        `INSERT INTO pages (id, project_id, name, slug, title, description, keywords, is_public, is_homepage, layout_data) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [pageId, project_id, name, finalSlug, title, description, keywords, isPublic ? 1 : 0, isHomepage ? 1 : 0, JSON.stringify(layout_data)],
        function(err) {
          if (err) {
            console.error('Error creating page:', err);
            return res.status(500).json({ error: 'Failed to create page' });
          }

          res.status(201).json({
            id: pageId,
            project_id,
            name,
            slug: finalSlug,
            title,
            description,
            keywords,
            isPublic,
            isHomepage,
            layout_data,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      );
    }
  );
});

// Update page
router.put('/:id', (req, res) => {
  const { name, slug, title, description, keywords, isPublic, isHomepage, layout_data } = req.body;

  const db = getDatabase();

  // First check if user owns the project that contains this page
  db.get(
    `SELECT p.*, pr.user_id FROM pages p 
     JOIN projects pr ON p.project_id = pr.id 
     WHERE p.id = ? AND pr.user_id = ?`,
    [req.params.id, req.user.id],
    (err, page) => {
      if (err) {
        console.error('Error checking page ownership:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }

      // If this is set as homepage, remove homepage flag from other pages
      if (isHomepage) {
        db.run(
          'UPDATE pages SET is_homepage = 0 WHERE project_id = ? AND id != ?',
          [page.project_id, req.params.id],
          (err) => {
            if (err) {
              console.error('Error updating homepage flags:', err);
            }
          }
        );
      }

      const updateFields = [];
      const updateValues = [];

      if (name !== undefined) {
        updateFields.push('name = ?');
        updateValues.push(name);
      }
      if (slug !== undefined) {
        updateFields.push('slug = ?');
        updateValues.push(slug);
      }
      if (title !== undefined) {
        updateFields.push('title = ?');
        updateValues.push(title);
      }
      if (description !== undefined) {
        updateFields.push('description = ?');
        updateValues.push(description);
      }
      if (keywords !== undefined) {
        updateFields.push('keywords = ?');
        updateValues.push(keywords);
      }
      if (isPublic !== undefined) {
        updateFields.push('is_public = ?');
        updateValues.push(isPublic ? 1 : 0);
      }
      if (isHomepage !== undefined) {
        updateFields.push('is_homepage = ?');
        updateValues.push(isHomepage ? 1 : 0);
      }
      if (layout_data !== undefined) {
        updateFields.push('layout_data = ?');
        updateValues.push(JSON.stringify(layout_data));
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(req.params.id);

      db.run(
        `UPDATE pages SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues,
        function(err) {
          if (err) {
            console.error('Error updating page:', err);
            return res.status(500).json({ error: 'Failed to update page' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: 'Page not found' });
          }

          res.json({ message: 'Page updated successfully' });
        }
      );
    }
  );
});

// Delete page
router.delete('/:id', (req, res) => {
  const db = getDatabase();

  // First check if user owns the project that contains this page
  db.get(
    `SELECT p.*, pr.user_id FROM pages p 
     JOIN projects pr ON p.project_id = pr.id 
     WHERE p.id = ? AND pr.user_id = ?`,
    [req.params.id, req.user.id],
    (err, page) => {
      if (err) {
        console.error('Error checking page ownership:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }

      // Don't allow deleting the last page in a project
      db.get(
        'SELECT COUNT(*) as count FROM pages WHERE project_id = ?',
        [page.project_id],
        (err, result) => {
          if (err) {
            console.error('Error counting pages:', err);
            return res.status(500).json({ error: 'Database error' });
          }

          if (result.count <= 1) {
            return res.status(400).json({ error: 'Cannot delete the last page in a project' });
          }

          // Delete the page
          db.run(
            'DELETE FROM pages WHERE id = ?',
            [req.params.id],
            function(err) {
              if (err) {
                console.error('Error deleting page:', err);
                return res.status(500).json({ error: 'Failed to delete page' });
              }

              res.json({ message: 'Page deleted successfully' });
            }
          );
        }
      );
    }
  );
});

export default router;