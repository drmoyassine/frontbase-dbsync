$filePath = "src\lib\api.ts"
$content = Get-Content $filePath -Raw

# Find and replace getAllPages
$oldPattern = @"
  // Get all pages
  getAllPages: async \(\): Promise<APIResponse> => \{
    try \{
      const response = await fetch\('/api/pages', \{
        credentials: 'include' // Include session cookies
      \}\);
"@

$newCode = @"
  // Get all pages
  getAllPages: async (includeDeleted = false): Promise<APIResponse> => {
    try {
      const url = includeDeleted ? '/api/pages?includeDeleted=true' : '/api/pages';
      const response = await fetch(url, {
        credentials: 'include' // Include session cookies
      });
"@

$content = $content -replace $oldPattern, $newCode
Set-Content $filePath -Value $content
Write-Host "Updated api.ts getAllPages"
