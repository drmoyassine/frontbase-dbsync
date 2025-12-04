$filePath = "src\components\dashboard\PagesPanel.tsx"
$content = Get-Content $filePath -Raw

# Update badges to show "Trashed" in trash view
$oldBadges = @"
                <div className="flex items-center gap-2">
                  <Badge variant={page.isPublic ? "default" : "secondary"}>
                    {page.isPublic ? 'Published' : 'Draft'}
                  </Badge>
                  {page.isHomepage && (
                    <Badge variant="outline">Homepage</Badge>
                  )}
                </div>
"@

$newBadges = @"
                <div className="flex items-center gap-2">
                  {showTrash ? (
                    <Badge variant="destructive">Trashed</Badge>
                  ) : (
                    <>
                      <Badge variant={page.isPublic ? "default" : "secondary"}>
                        {page.isPublic ? 'Published' : 'Draft'}
                      </Badge>
                      {page.isHomepage && (
                        <Badge variant="outline">Homepage</Badge>
                      )}
                    </>
                  )}
                </div>
"@

$content = $content.Replace($oldBadges, $newBadges)

Set-Content $filePath -Value $content -NoNewline
Write-Host "Updated badges for trash view"
