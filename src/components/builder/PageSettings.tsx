import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Settings } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { pageAPI } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

export const PageSettings: React.FC = () => {
  const { 
    pages, 
    currentPageId, 
    updatePage,
    setUnsavedChanges 
  } = useBuilderStore();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const currentPage = pages.find(page => page.id === currentPageId);
  
  if (!currentPage) return null;

  const [formData, setFormData] = useState({
    name: currentPage.name,
    slug: currentPage.slug,
    title: currentPage.title || '',
    description: currentPage.description || '',
    keywords: currentPage.keywords || '',
    isPublic: currentPage.isPublic,
    isHomepage: currentPage.isHomepage
  });

  const handleSave = async () => {
    if (!currentPageId || !currentPage) return;
    
    setIsSaving(true);
    try {
      // First update the local store
      updatePage(currentPageId, formData);
      
      // Then sync to database
      const result = await pageAPI.updatePage(currentPageId, {
        ...currentPage,
        ...formData
      });
      
      if (!result.success) {
        // If update fails with 404, try creating the page
        if (result.error?.includes('404')) {
          const createResult = await pageAPI.createPage({
            ...currentPage,
            ...formData
          });
          
          if (!createResult.success) {
            throw new Error(createResult.error || 'Failed to create page in database');
          }
        } else {
          throw new Error(result.error || 'Failed to update page settings');
        }
      }
      
      setUnsavedChanges(false);
      toast({
        title: "Settings saved",
        description: "Page settings have been saved successfully"
      });
      setIsOpen(false);
    } catch (error) {
      toast({
        title: "Error saving settings",
        description: error instanceof Error ? error.message : "Failed to save page settings",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Page Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Basic Information</h3>
            
            <div className="space-y-2">
              <Label htmlFor="page-name">Page Name</Label>
              <Input
                id="page-name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter page name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="page-slug">URL Slug</Label>
              <Input
                id="page-slug"
                value={formData.slug}
                onChange={(e) => handleInputChange('slug', e.target.value)}
                placeholder="page-url-slug"
              />
            </div>
          </div>

          {/* SEO Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">SEO Settings</h3>
            
            <div className="space-y-2">
              <Label htmlFor="page-title">Meta Title</Label>
              <Input
                id="page-title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Page title for search engines"
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">
                {formData.title.length}/60 characters
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="page-description">Meta Description</Label>
              <Textarea
                id="page-description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Brief description for search engines"
                maxLength={160}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {formData.description.length}/160 characters
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="page-keywords">Keywords</Label>
              <Input
                id="page-keywords"
                value={formData.keywords}
                onChange={(e) => handleInputChange('keywords', e.target.value)}
                placeholder="keyword1, keyword2, keyword3"
              />
            </div>
          </div>

          {/* Page Options */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Page Options</h3>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Public Page</Label>
                <p className="text-xs text-muted-foreground">
                  Make this page publicly accessible
                </p>
              </div>
              <Switch
                checked={formData.isPublic}
                onCheckedChange={(checked) => handleInputChange('isPublic', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Homepage</Label>
                <p className="text-xs text-muted-foreground">
                  Set as the main homepage
                </p>
              </div>
              <Switch
                checked={formData.isHomepage}
                onCheckedChange={(checked) => handleInputChange('isHomepage', checked)}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};