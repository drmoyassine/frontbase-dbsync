# Update UniversalDataTable for FK nested data support
$file = "c:\Users\PC\OneDrive - studygram.me\VsCode\Frontbase-now\src\components\data-binding\UniversalDataTable.tsx"

Write-Host "Reading file..."
$lines = Get-Content $file

Write-Host "Applying updates..."
$newLines = @()
$i = 0
$updated = 0

while ($i -lt $lines.Count) {
    $line = $lines[$i]
    
    # 1. Update formatValue signature
    if ($line -match 'const formatValue = \(value: any, columnName: string\): React\.ReactNode') {
        $newLines += '  const formatValue = (value: any, columnName: string, row?: any): React.ReactNode => {'
        $i++
        $updated++
        
        # Add nested data handling after the opening brace
        $newLines += '    // Handle related columns (e.g., "institutions.name")'
        $newLines += '    let actualValue = value;'
        $newLines += '    if (row && columnName.includes(''.'')) {'
        $newLines += '      const [tableName, colName] = columnName.split(''.'');'
        $newLines += '      actualValue = row[tableName]?.[colName];'
        $newLines += '    }'
        $newLines += ''
        continue
    }
    
    # 2. Replace 'value' with 'actualValue' in formatValue (between lines 121-166)
    if ($i -ge 121 -and $i -le 166) {
        if ($line -match '\bvalue\b' -and $line -notmatch '(actualValue|formatValue|value:)') {
            $line = $line -replace '\bvalue\b', 'actualValue'
        }
    }
    
    # 3. Update formatValue calls to pass row
    if ($line -match '\{formatValue\(row\[column\.name\], column\.name\)\}') {
        $line = $line -replace '\{formatValue\(row\[column\.name\], column\.name\)\}', '{formatValue(row[column.name], column.name, row)}'
        $updated++
    }
    
    $newLines += $line
    $i++
}

Write-Host "Writing updated file..."
$newLines | Set-Content $file

Write-Host ""
Write-Host "Done! Updates applied: $updated"
Write-Host "Note: You may need to manually update getVisibleColumns function"
Write-Host "to include related columns from columnOverrides"
