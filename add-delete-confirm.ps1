$filePath = "src\components\dashboard\PagesPanel.tsx"
$content = Get-Content $filePath -Raw

# Find and replace the delete dropdown menu item with AlertDialog wrapped version
$oldDeleteItem = @"
                    <DropdownMenuItem
                      onClick={() => handleDeletePage(page.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
"@

$newDeleteItem = @"
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
"@

$content = $content.Replace($oldDeleteItem, $newDeleteItem)

Set-Content $filePath -Value $content -NoNewline
Write-Host "Added delete confirmation dialog"
