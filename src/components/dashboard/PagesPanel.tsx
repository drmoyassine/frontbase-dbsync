import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuilderStore } from '@/stores/builder';
import { useDashboardStore } from '@/stores/dashboard';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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
import { Plus, Search, MoreHorizontal, Eye, Edit, Copy, Trash2, FileText, RotateCcw, Trash } from 'lucide-react';
import { toast } from 'sonner';
import { CreatePageDialog } from './CreatePageDialog';

export const PagesPanel: React.FC = () => {
  const navigate = useNavigate();
  const { pages, createPage, deletePage, restorePage, permanentDeletePage, setCurrentPageId, loadPagesFromDatabase } = useBuilderStore();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { searchQuery, setSearchQuery, filterStatus } = useDashboardStore();
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(true);
  const [showTrash, setShowTrash] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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

  const filteredPages = pages.filter(page => {
    // Filter by trash state
    const isDeleted = !!page.deletedAt;
    const matchesTrashView = showTrash ? isDeleted : !isDeleted;

    const matchesSearch = page.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' ||
      (filterStatus === 'published' && page.isPublic) ||
      (filterStatus === 'draft' && !page.isPublic);
    return matchesTrashView && matchesSearch && matchesFilter;
  });

  const handlePageCreated = (pageId: string) => {
    setCurrentPageId(pageId);
    navigate(`/builder/${pageId}`);
    toast.success('Page created successfully!');
  };

  const handleEditPage = (pageId: string) => {
    setCurrentPageId(pageId);
    navigate(`/builder/${pageId}`);
  };

  const handleDeletePage = async (pageId: string) => {
    if (pages.length <= 1) {
      toast.error('Cannot delete the last page');
      return;
    }

    try {
      await deletePage(pageId);
      toast.success('Page deleted successfully!');
    } catch (error) {
      toast.error('Failed to delete page');
    }
  };

  const handleDuplicatePage = async (page: any) => {
    try {
      createPage({
        ...page,
        name: `${page.name} (Copy)`,
        slug: `${page.slug}-copy`,
        isHomepage: false
      });

      toast.success('Page duplicated successfully!');
    } catch (error) {
      toast.error('Failed to duplicate page');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{showTrash ? 'Trashed Pages' : 'Pages'}</h1>
          <p className="text-muted-foreground">
            {showTrash ? 'Pages will be permanently deleted after 14 days' : 'Manage your website pages and content'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showTrash ? "secondary" : "ghost"}
            onClick={() => setShowTrash(!showTrash)}
            className="gap-2"
          >
            <Trash className="h-4 w-4" />
            {showTrash ? 'View Pages' : 'Trash'}
          </Button>
          {!showTrash && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Page
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 w-[300px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPages.map((page) => (
          <Card key={page.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{page.name}</CardTitle>
                  <CardDescription>/{page.slug}</CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {showTrash ? (
                      <>
                        <DropdownMenuItem onClick={() => restorePage(page.id)}>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Restore
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Forever
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Permanently Delete Page?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the page and all its data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => permanentDeletePage(page.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete Forever
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => handleEditPage(page.id)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicatePage(page)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Page?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will move the page to trash. You can restore it later or permanently delete it.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeletePage(page.id)}>
                                Move to Trash
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {showTrash ? (
                    <Badge variant="destructive">Trashed</Badge>
                  ) : (
                    <>
                      <Badge variant={page.isPublic ? "default" : "secondary"}>
                        {page.isPublic ? 'Published' : 'Draft'}
                      </Badge>
                      {page.isHomepage && (
                        <Badge variant="outline">Homepage</Badge>
                      )}
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleEditPage(page.id)}
                    className="flex-1"
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  {page.isPublic && (
                    <Button size="sm" variant="outline">
                      <Eye className="mr-2 h-4 w-4" />
                      Preview
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoadingPages ? (
        <div className="text-center py-12">
          <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
            <FileText className="h-12 w-12 text-muted-foreground animate-pulse" />
          </div>
          <h3 className="text-lg font-semibold">Loading pages...</h3>
          <p className="text-muted-foreground">
            Fetching your pages from the database
          </p>
        </div>
      ) : filteredPages.length === 0 ? (
        <div className="text-center py-12">
          <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
            <FileText className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No pages found</h3>
          <p className="text-muted-foreground">
            {searchQuery ? 'Try adjusting your search criteria' : 'Get started by creating your first page'}
          </p>
        </div>
      ) : null}

      <CreatePageDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onPageCreated={handlePageCreated}
      />
    </div>
  );
};
