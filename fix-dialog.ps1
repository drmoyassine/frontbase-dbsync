$filePath = "src\components\dashboard\PagesPanel.tsx"
$content = Get-Content $filePath -Raw

# Remove old handleCreatePage function (lines 71-107)
$oldFunction = [regex]::Escape(@"
  const handleCreatePage = async () => {
    setIsCreating(true);
    try {
      const pageData = {
        name: ``New Page `${pages.length + 1}``,
        slug: ``new-page-`${pages.length + 1}``,
        title: ``New Page `${pages.length + 1}``,
        description: 'A new page created with Frontbase',
        keywords: 'new, page',
        isPublic: false,
        isHomepage: false,
        layoutData: {
          content: [
            {
              id: 'heading-1',
              type: 'Heading',
              props: {
                text: 'New Page',
                level: '1'
              },
              children: []
            }
          ],
          root: {}
        }
      };

      // Create page in database first, then update local state
      const { createPageInDatabase } = useBuilderStore.getState();
      const newPageId = await createPageInDatabase(pageData);

      if (newPageId) {
        setCurrentPageId(newPageId);
        navigate(``/builder/`${newPageId}``);
        toast.success('Page created successfully!');
      } else {
        throw new Error('Failed to create page in database');
      }
    } catch (error) {
      console.error('Page creation failed:', error);
      toast.error('Failed to create page');
    } finally {
      setIsCreating(false);
    }
  };
"@)

$newFunction = @"
  const handlePageCreated = (pageId: string) => {
    setCurrentPageId(pageId);
    navigate(``/builder/`${pageId}``);
    toast.success('Page created successfully!');
  };
"@

$content = $content -replace $oldFunction, $newFunction

# Add CreatePageDialog before the closing div and brace
$oldEnding = @"
      ) : null}
    </div>
  );
};
"@

$newEnding = @"
      ) : null}

      <CreatePageDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onPageCreated={handlePageCreated}
      />
    </div>
  );
};
"@

$content = $content.Replace($oldEnding, $newEnding)

Set-Content $filePath -Value $content -NoNewline
Write-Host "Fixed PagesPanel dialog integration"
