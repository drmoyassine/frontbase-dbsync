# Add related columns support to getVisibleColumns
$file = "c:\Users\PC\OneDrive - studygram.me\VsCode\Frontbase-now\src\components\data-binding\UniversalDataTable.tsx"

Write-Host "Reading file..."
$content = [System.IO.File]::ReadAllText($file)

Write-Host "Finding getVisibleColumns function..."

# Find and replace the entire getVisibleColumns function
$pattern = '(?s)(const getVisibleColumns = \(\) =>) \{.*?return schema\.columns\.filter\(\(col: any\) => \{.*?return override\?\.visible !== false;.*?\}\);.*?\};'

$replacement = ' {
    if (!schema) return [];

    const columns: any[] = [];

    // Get base table columns from schema
    schema.columns.forEach((col: any) => {
      const override = binding?.columnOverrides?.[col.name];
      if (override?.visible !== false) {
        columns.push(col);
      }
    });

    // Add visible related columns (e.g., "institutions.name")
    if (binding?.columnOverrides) {
      Object.keys(binding.columnOverrides).forEach(key => {
        if (key.includes(''.'') && binding.columnOverrides[key].visible !== false) {
          const [tableName, columnName] = key.split(''.'');
          columns.push({ 
            name: key, 
            type: ''text'',
            relatedTable: tableName, 
            relatedColumn: columnName 
          });
        }
      });
    }

    return columns;
  };'

if ($content -match $pattern) {
    $content = $content -replace $pattern, ('$1' + $replacement)
    [System.IO.File]::WriteAllText($file, $content)
    Write-Host "✅ Successfully updated getVisibleColumns!"
}
else {
    Write-Host "❌ Could not find getVisibleColumns function pattern"
    Write-Host "You may need to manually add related columns support"
}
