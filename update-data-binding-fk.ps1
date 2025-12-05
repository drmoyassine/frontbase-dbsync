$filePath = "c:\Users\PC\OneDrive - studygram.me\VsCode\Frontbase-now\src\stores\data-binding-simple.ts"
$content = [System.IO.File]::ReadAllText($filePath)

# Replace the isPrimaryKey line to add foreignKey mapping
$pattern = '(?s)(isPrimaryKey: col\.is_primary \|\| col\.isPrimaryKey)(\s+\}\)\);)'
$replacement = '$1,' + [Environment]::NewLine + '              foreignKey: (col.is_foreign || col.isForeign) && (col.foreign_table || col.foreignTable) ? {' + [Environment]::NewLine + '                table: col.foreign_table || col.foreignTable,' + [Environment]::NewLine + '                column: col.foreign_column || col.foreignColumn' + [Environment]::NewLine + '              } : undefined' + '$2'

$updated = $content -replace $pattern, $replacement
[System.IO.File]::WriteAllText($filePath, $updated)

Write-Host "File updated successfully"
