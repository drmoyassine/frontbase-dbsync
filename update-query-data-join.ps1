$filePath = "c:\Users\PC\OneDrive - studygram.me\VsCode\Frontbase-now\src\stores\data-binding-simple.ts"
$content = [System.IO.File]::ReadAllText($filePath)

# Add select parameter construction before sorting logic
$pattern = '(?s)(params\.append\(''offset'', \(binding\.pagination\.page \* binding\.pagination\.pageSize\)\.toString\(\)\);)(\s+)(if \(binding\.sorting\.enabled)'
$replacement = '$1$2' + @"
// Construct select parameter with joins
          const selectParts = ['*'];
          const relatedTables = new Set<string>();

          // Check column overrides for related columns (e.g., "institutions.name")
          if (binding.columnOverrides) {
            Object.keys(binding.columnOverrides).forEach(key => {
              if (key.includes('.')) {
                const [table, column] = key.split('.');
                if (table && column) {
                  relatedTables.add(table);
                }
              }
            });
          }

          // Add related tables to select (e.g., "institutions(*)")
          relatedTables.forEach(table => {
            selectParts.push(```${table}(*)```);
          });

          params.append('select', selectParts.join(','));

          $2$3
"@

$updated = $content -replace $pattern, $replacement
[System.IO.File]::WriteAllText($filePath, $updated)

Write-Host "Query data updated successfully"
