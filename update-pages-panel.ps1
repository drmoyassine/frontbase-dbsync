$filePath = "src\components\dashboard\PagesPanel.tsx"
$content = Get-Content $filePath -Raw

# Update useBuilderStore destructuring
$oldStore = "const { pages, createPage, deletePage, setCurrentPageId, loadPagesFromDatabase } = useBuilderStore();"
$newStore = "const { pages, createPage, deletePage, restorePage, permanentDeletePage, setCurrentPageId, loadPagesFromDatabase } = useBuilderStore();"
$content = $content.Replace($oldStore, $newStore)

# Add showTrash state
$oldState = "const [isLoadingPages, setIsLoadingPages] = useState(true);"
$newState = "const [isLoadingPages, setIsLoadingPages] = useState(true);`n  const [showTrash, setShowTrash] = useState(false);"
$content = $content.Replace($oldState, $newState)

# Update useEffect
$oldEffect = @"
  // Load pages from database when component mounts
  useEffect(() => {
    const loadPages = async () => {
      if (!isLoading && isAuthenticated) {
        try {
          setIsLoadingPages(true);
          await loadPagesFromDatabase();
        } catch (error) {
          console.error('Failed to load pages:', error);
          toast.error('Failed to load pages from database');
        } finally {
          setIsLoadingPages(false);
        }
      } else if (!isLoading && !isAuthenticated) {
        setIsLoadingPages(false);
      }
    };

    loadPages();
  }, [loadPagesFromDatabase, isAuthenticated, isLoading]);
"@

$newEffect = @"
  // Load pages from database when component mounts or trash mode changes
  useEffect(() => {
    const loadPages = async () => {
      if (!isLoading && isAuthenticated) {
        try {
          setIsLoadingPages(true);
          await loadPagesFromDatabase(showTrash);
        } catch (error) {
          console.error('Failed to load pages:', error);
          toast.error('Failed to load pages from database');
        } finally {
          setIsLoadingPages(false);
        }
      } else if (!isLoading && !isAuthenticated) {
        setIsLoadingPages(false);
      }
    };

    loadPages();
  }, [loadPagesFromDatabase, isAuthenticated, isLoading, showTrash]);
"@

$content = $content.Replace($oldEffect, $newEffect)

Set-Content $filePath -Value $content
Write-Host "Updated PagesPanel state and effect"
