import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ChevronDown, Plus, FileText, Home } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';

export const PageSelector: React.FC = () => {
  const { pages, currentPageId, setCurrentPage, createPage, project } = useBuilderStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newPageData, setNewPageData] = useState({
    name: '',
    slug: '',
    title: '',
    description: '',
    keywords: '',
    isPublic: false,
    isHomepage: false,
  });

  const currentPage = pages.find(page => page.id === currentPageId);

  const handleCreatePage = () => {
    if (newPageData.name && newPageData.slug && project) {
      createPage({
        ...newPageData,
        project_id: project.id,
        layout_data: []
      });
      setIsCreating(false);
      setNewPageData({
        name: '',
        slug: '',
        title: '',
        description: '',
        keywords: '',
        isPublic: false,
        isHomepage: false,
      });
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={currentPageId || ''} onValueChange={setCurrentPage}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Select a page">
            {currentPage && (
              <div className="flex items-center gap-2">
                {currentPage.isHomepage ? (
                  <Home className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {currentPage.name}
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {pages.map((page) => (
            <SelectItem key={page.id} value={page.id}>
              <div className="flex items-center gap-2">
                {page.isHomepage ? (
                  <Home className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {page.name}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Page</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="page-name">Page Name *</Label>
                <Input
                  id="page-name"
                  value={newPageData.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setNewPageData(prev => ({
                      ...prev,
                      name,
                      slug: generateSlug(name)
                    }));
                  }}
                  placeholder="About Us"
                />
              </div>
              <div>
                <Label htmlFor="page-slug">URL Slug *</Label>
                <Input
                  id="page-slug"
                  value={newPageData.slug}
                  onChange={(e) => setNewPageData(prev => ({ ...prev, slug: e.target.value }))}
                  placeholder="about-us"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="page-title">SEO Title</Label>
              <Input
                id="page-title"
                value={newPageData.title}
                onChange={(e) => setNewPageData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="About Us - Company Name"
              />
            </div>

            <div>
              <Label htmlFor="page-description">SEO Description</Label>
              <Textarea
                id="page-description"
                value={newPageData.description}
                onChange={(e) => setNewPageData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Learn about our company mission and values..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="page-keywords">Keywords (comma-separated)</Label>
              <Input
                id="page-keywords"
                value={newPageData.keywords}
                onChange={(e) => setNewPageData(prev => ({ ...prev, keywords: e.target.value }))}
                placeholder="about us, company, mission, values"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Switch
                  id="is-public"
                  checked={newPageData.isPublic}
                  onCheckedChange={(checked) => setNewPageData(prev => ({ ...prev, isPublic: checked }))}
                />
                <Label htmlFor="is-public">Public Page</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is-homepage"
                  checked={newPageData.isHomepage}
                  onCheckedChange={(checked) => setNewPageData(prev => ({ ...prev, isHomepage: checked }))}
                />
                <Label htmlFor="is-homepage">Homepage</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreatePage}>
                Create Page
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};