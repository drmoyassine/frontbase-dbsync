$filePath = "src\stores\builder.ts"
$content = Get-Content $filePath -Raw

# Find and replace the deletePage implementation
$oldPattern = @"
      deletePage: \(id\) => set\(\(state\) => \(\{
        pages: state\.pages\.filter\(page => page\.id !== id\),
        currentPageId: state\.currentPageId === id \? null : state\.currentPageId
      \}\)\),
"@

$newCode = @"
      deletePage: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
          const { pageAPI } = await import('@/lib/api');
          const result = await pageAPI.deletePage(id);
          
          if (!result.success) {
            throw new Error(result.error || 'Failed to delete page');
          }
          
          // Remove from local state
          set((state) => ({
            pages: state.pages.filter(page => page.id !== id),
            currentPageId: state.currentPageId === id ? null : state.currentPageId
          }));
          
          toast({
            title: "Page moved to trash",
            description: "Page has been moved to trash successfully"
          });
        } catch (error) {
          toast({
            title: "Error deleting page",
            description: error instanceof Error ? error.message : "Failed to delete page",
            variant: "destructive"
          });
        } finally {
          setSaving(false);
        }
      },
"@

$content = $content -replace $oldPattern, $newCode
Set-Content $filePath -Value $content
Write-Host "Updated builder store deletePage implementation"
