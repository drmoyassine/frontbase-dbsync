$filePath = "src\components\dashboard\PagesPanel.tsx"
$content = Get-Content $filePath -Raw

# Add import for CreatePageDialog after toast import
$oldImports = "import { toast } from 'sonner';"
$newImports = @"
import { toast } from 'sonner';
import { CreatePageDialog } from './CreatePageDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
"@

$content = $content.Replace($oldImports, $newImports)

# Add showCreateDialog state
$oldState = "const [showTrash, setShowTrash] = useState(false);"
$newState = @"
const [showTrash, setShowTrash] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
"@

$content = $content.Replace($oldState, $newState)

# Replace handleCreatePage with handlePageCreated
$pattern = "const handleCreatePage = async \(\) => \{[^}]+\{[^}]+\}[^}]+\}[^}]+\}[^}]+\}[^}]+\}[^}]+\};"
$replacement = @"
const handlePageCreated = (pageId: string) => {
    setCurrentPageId(pageId);
    navigate(``/builder/`${pageId}``);
    toast.success('Page created successfully!');
  };
"@

$content = $content -replace $pattern, $replacement

# Update button to open dialog instead of calling handleCreatePage
$oldButton = "onClick={handleCreatePage} disabled={isCreating}"
$newButton = "onClick={() => setShowCreateDialog(true)}"

$content = $content.Replace($oldButton, $newButton)

# Add CreatePageDialog component before closing tag
# Find the last closing tag of PagesPanel
$closingTag = "</div>
    </div>
  );
};"

$newClosingWithDialog = @"
</div>
    </div>

    <CreatePageDialog
      open={showCreateDialog}
      onOpenChange={setShowCreateDialog}
      onPageCreated={handlePageCreated}
    />
  );
};
"@

$content = $content.Replace($closingTag, $newClosingWithDialog)

Set-Content $filePath -Value $content
Write-Host "Updated PagesPanel"
