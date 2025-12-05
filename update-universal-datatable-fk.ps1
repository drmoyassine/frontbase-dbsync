# PowerShell script to update UniversalDataTable for FK nested data support

$file = "c:\Users\PC\OneDrive - studygram.me\VsCode\Frontbase-now\src\components\data-binding\UniversalDataTable.tsx"
$content = [System.IO.File]::ReadAllText($file)

Write-Host "Updating UniversalDataTable for FK nested data support..."

# 1. Update formatValue function signature to accept row parameter
$pattern1 = 'const formatValue = \(value: any, columnName: string\): React\.ReactNode =>'
$replacement1 = 'const formatValue = (value: any, columnName: string, row?: any): React.ReactNode =>'
$content = $content -replace $pattern1, $replacement1
Write-Host "✓ Updated formatValue signature"

# 2. Add nested data handling at the start of formatValue
$pattern2 = '(?s)(const formatValue = \(value: any, columnName: string, row\?: any\): React\.ReactNode => \{)(\s+)(if \(value === null)'
$replacement2 = @"
`$1`$2// Handle related columns (e.g., "institutions.name")`$2    let actualValue = value;`$2    if (row && columnName.includes('.')) {`$2      const [tableName, colName] = columnName.split('.');`$2      actualValue = row[tableName]?.[colName];`$2    }`$2`$2    `$3
"@
$content = $content -replace $pattern2, $replacement2
Write-Host "✓ Added nested data handling"

# 3. Replace 'value' with 'actualValue' in formatValue function
$pattern3 = '(?s)(const formatValue.*?return String\(value\);[\s\r\n]+\}[\s\r\n]+\};)'
$valueToActual = $pattern3
# This is complex, so let's do a simpler approach - replace within the function bounds
$lines = $content -split "`r?`n"
$inFormatValue = $false
$formatValueStart = -1
$braceCount = 0
$newLines = @()

for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    
    if ($line -match 'const formatValue = \(value: any, columnName: string, row\?: any\)') {
        $inFormatValue = $true
        $formatValueStart = $i
        $braceCount = 0
    }
    
    if ($inFormatValue) {
        # Count braces
        $braceCount += ($line.ToCharArray() | Where-Object { $_ -eq '{' }).Count
        $braceCount -= ($line.ToCharArray() | Where-Object { $_ -eq '}' }).Count
        
        # Replace value with actualValue (but not in variable names or comments)
        if ($line -notmatch '(actualValue|formatValue)') {
            $line = $line -replace '\bvalue\b', 'actualValue'
        }
        
        # Check if we're done with the function
        if ($braceCount -eq 0 -and $i -gt $formatValueStart) {
            $inFormatValue = $false
        }
    }
    
    $newLines += $line
}

$content = $newLines -join "`r`n"
Write-Host "✓ Replaced value with actualValue in formatValue"

# 4. Update getVisibleColumns to include related columns
$pattern4 = '(?s)(const getVisibleColumns = \(\) => \{.*?return schema\.columns\.filter\(\(col: any\) => \{.*?\}\);[\s\r\n]+\};)'
$replacement4 = @"
const getVisibleColumns = () => {
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
        if (key.includes('.') && binding.columnOverrides[key].visible !== false) {
          const [tableName, columnName] = key.split('.');
          columns.push({ 
            name: key, 
            type: 'text',
            relatedTable: tableName, 
            relatedColumn: columnName 
          });
        }
      });
    }

    return columns;
  };
"@
$content = $content -replace $pattern4, $replacement4
Write-Host "✓ Updated getVisibleColumns"

# 5. Update formatValue calls to pass row parameter
$pattern5 = '\{formatValue\(row\[column\.name\], column\.name\)\}'
$replacement5 = '{formatValue(row[column.name], column.name, row)}'
$content = $content -replace $pattern5, $replacement5
Write-Host "✓ Updated formatValue calls to pass row"

# Write the updated content
[System.IO.File]::WriteAllText($file, $content)

Write-Host "`n✅ UniversalDataTable updated successfully!"
Write-Host "Changes made:"
Write-Host "  - formatValue now accepts row parameter"
Write-Host "  - Nested data access for FK columns (e.g., row.institutions.name)"
Write-Host "  - getVisibleColumns includes related columns"
Write-Host "  - All formatValue calls updated to pass row data"
