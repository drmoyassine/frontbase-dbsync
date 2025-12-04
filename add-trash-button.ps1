$filePath = "src\components\dashboard\PagesPanel.tsx"
$content = Get-Content $filePath -Raw

# Replace the single New Page button with Trash + New Page buttons
$oldButton = @"
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {isCreating ? 'Creating...' : 'New Page'}
        </Button>
"@

$newButtons = @"
        </div>
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
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {isCreating ? 'Creating...' : 'New Page'}
            </Button>
          )}
        </div>
"@

$content = $content.Replace($oldButton, $newButtons)

Set-Content $filePath -Value $content -NoNewline
Write-Host "Added Trash button to PagesPanel"
