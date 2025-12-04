$filePath = "src\components\dashboard\PagesPanel.tsx"
$content = Get-Content $filePath -Raw

# Update filteredPages logic
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
    const matchesSearch = page.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         page.slug.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by trash status
    const isDeleted = !!page.deletedAt;
    if (showTrash && !isDeleted) return false;
    if (!showTrash && isDeleted) return false;

    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'published' && page.isPublic) ||
                         (filterStatus === 'draft' && !page.isPublic);
    return matchesSearch && matchesFilter;
  });
"@

$content = $content.Replace($oldFilter, $newFilter)

# Update Header Button
$oldButton = @"
        <Button onClick={handleCreatePage} disabled={isCreating}>
          <Plus className="mr-2 h-4 w-4" />
          New Page
        </Button>
"@

$newButton = @"
        <div className="flex items-center gap-2">
          <Button
            variant={showTrash ? "secondary" : "ghost"}
            onClick={() => setShowTrash(!showTrash)}
            className="gap-2"
          >
            <Trash className="h-4 w-4" />
            {showTrash ? 'View Pages' : 'Trash'}
          </Button>
          {!showTrash && (
            <Button onClick={handleCreatePage} disabled={isCreating}>
              <Plus className="mr-2 h-4 w-4" />
              New Page
            </Button>
          )}
        </div>
"@

$content = $content.Replace($oldButton, $newButton)

# Update Dropdown Menu
# This is tricky due to size, so we'll replace the DropdownMenuContent content
$oldMenuContent = @"
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEditPage(page.id)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.open(`/preview/${page.id}`, '_blank')}>
                      <Eye className="mr-2 h-4 w-4" />
                      Preview
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicatePage(page)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </DropdownMenuItem>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem 
                          onSelect={(e) => e.preventDefault()}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Page?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will move the page to trash. You can restore it later or permanently delete it.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeletePage(page.id)}>
                            Move to Trash
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
"@

$newMenuContent = @"
                  <DropdownMenuContent align="end">
                    {showTrash ? (
                      <>
                        <DropdownMenuItem onClick={() => restorePage(page.id)}>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Restore
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem 
                              onSelect={(e) => e.preventDefault()}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Forever
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Permanently Delete Page?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the page and all its data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => permanentDeletePage(page.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete Forever
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => handleEditPage(page.id)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(`/preview/${page.id}`, '_blank')}>
                          <Eye className="mr-2 h-4 w-4" />
                          Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicatePage(page)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem 
                              onSelect={(e) => e.preventDefault()}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Page?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will move the page to trash. You can restore it later or permanently delete it.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeletePage(page.id)}>
                                Move to Trash
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </DropdownMenuContent>
"@

$content = $content.Replace($oldMenuContent, $newMenuContent)

Set-Content $filePath -Value $content
Write-Host "Updated PagesPanel UI"
