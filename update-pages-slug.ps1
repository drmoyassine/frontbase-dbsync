$filePath = "server\routes\api\pages.js"
$content = Get-Content $filePath -Raw

# Update DELETE handler
$oldDelete = @"
  // DELETE /api/pages/:id - Delete page (soft delete)
  router.delete('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const page = db.updatePage(id, { deletedAt: new Date().toISOString() });

      if (!page) {
        return res.status(404).json({
          success: false,
          error: 'Page not found'
        });
      }

      res.json({
        success: true,
        message: 'Page moved to trash successfully'
      });
    } catch (error) {
"@

$newDelete = @"
  // DELETE /api/pages/:id - Delete page (soft delete)
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
"@

# Update RESTORE handler
$oldRestore = @"
  // POST /api/pages/:id/restore - Restore deleted page
  router.post('/:id/restore', (req, res) => {
    try {
      const { id } = req.params;
      const page = db.updatePage(id, { deletedAt: null });

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
"@

$newRestore = @"
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
        data: updatedPage
      });
    } catch (error) {
"@

# Perform replacements
# Note: Using regex escape for safety or simple string replacement if exact match
# Since we have large blocks, let's try to be careful with whitespace.
# We'll use a slightly more robust regex approach if simple replace fails, 
# but for now let's try exact string match with normalized line endings if needed.

# Normalize line endings to LF for consistency in matching if needed, but Windows uses CRLF.
# Get-Content -Raw preserves newlines.

if ($content.Contains($oldDelete.Trim())) {
    $content = $content.Replace($oldDelete.Trim(), $newDelete.Trim())
    Write-Host "Updated DELETE handler"
}
else {
    Write-Warning "Could not find DELETE handler block"
    # Try a smaller chunk match if full block fails
}

if ($content.Contains($oldRestore.Trim())) {
    $content = $content.Replace($oldRestore.Trim(), $newRestore.Trim())
    Write-Host "Updated RESTORE handler"
}
else {
    Write-Warning "Could not find RESTORE handler block"
}

Set-Content $filePath -Value $content
