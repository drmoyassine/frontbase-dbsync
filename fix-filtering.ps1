$filePath = "src\components\dashboard\PagesPanel.tsx"
$content = Get-Content $filePath -Raw

# Find and replace the filteredPages logic
$oldFilter = @"
  const filteredPages = pages.filter(page => {
    const matchesSearch = page.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' ||
      (filterStatus === 'published' && page.isPublic) ||
      (filterStatus === 'draft' && !page.isPublic);
    return matchesSearch && matchesFilter;
  });
"@

$newFilter = @"
  const filteredPages = pages.filter(page => {
    // Filter by trash state
    const isDeleted = !!page.deletedAt;
    const matchesTrashView = showTrash ? isDeleted : !isDeleted;
    
    const matchesSearch = page.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' ||
      (filterStatus === 'published' && page.isPublic) ||
      (filterStatus === 'draft' && !page.isPublic);
    return matchesTrashView && matchesSearch && matchesFilter;
  });
"@

$content = $content.Replace($oldFilter, $newFilter)

Set-Content $filePath -Value $content -NoNewline
Write-Host "Fixed page filtering logic"
