import React, { useState, useEffect } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Plus, Trash2 } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { pageAPI } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface PageVariable {
  name: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue: any;
}

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

  const [localVars, setLocalVars] = useState<PageVariable[]>([]);
  const [sessionVars, setSessionVars] = useState<PageVariable[]>([]);

  // Hydrate form and variables on open
  useEffect(() => {
    if (isOpen && currentPage) {
      setFormData({
        name: currentPage.name,
        slug: currentPage.slug,
        title: currentPage.title || '',
        description: currentPage.description || '',
        keywords: currentPage.keywords || '',
        isPublic: currentPage.isPublic,
        isHomepage: currentPage.isHomepage
      });

      const root = currentPage.layoutData?.root || {};
      
      const rawLocal = root.localVariables || {};
      setLocalVars(
        Object.entries(rawLocal).map(([name, val]: [string, any]) => {
          if (val && typeof val === 'object' && 'type' in val) {
            return { name, type: val.type, defaultValue: val.defaultValue };
          }
          let type: 'string' | 'number' | 'boolean' = 'string';
          if (typeof val === 'boolean') type = 'boolean';
          else if (typeof val === 'number') type = 'number';
          return { name, type, defaultValue: val };
        })
      );

      const rawSession = root.sessionVariables || {};
      setSessionVars(
        Object.entries(rawSession).map(([name, val]: [string, any]) => {
          if (val && typeof val === 'object' && 'type' in val) {
            return { name, type: val.type, defaultValue: val.defaultValue };
          }
          let type: 'string' | 'number' | 'boolean' = 'string';
          if (typeof val === 'boolean') type = 'boolean';
          else if (typeof val === 'number') type = 'number';
          return { name, type, defaultValue: val };
        })
      );
    }
  }, [isOpen, currentPage]);

  const handleSave = async () => {
    if (!currentPageId || !currentPage) return;

    // Validate variable names
    const nameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    for (const v of localVars) {
      if (!v.name.trim()) {
        toast({ title: "Validation Error", description: "Variable name cannot be empty", variant: "destructive" });
        return;
      }
      if (!nameRegex.test(v.name.trim())) {
        toast({ title: "Validation Error", description: `Invalid local variable name "${v.name}". Must be alphanumeric and start with a letter/underscore.`, variant: "destructive" });
        return;
      }
    }
    for (const v of sessionVars) {
      if (!v.name.trim()) {
        toast({ title: "Validation Error", description: "Variable name cannot be empty", variant: "destructive" });
        return;
      }
      if (!nameRegex.test(v.name.trim())) {
        toast({ title: "Validation Error", description: `Invalid session variable name "${v.name}". Must be alphanumeric and start with a letter/underscore.`, variant: "destructive" });
        return;
      }
    }
    
    setIsSaving(true);
    try {
      // Convert arrays back to objects
      const localVariablesObj: Record<string, any> = {};
      localVars.forEach(v => {
        localVariablesObj[v.name.trim()] = { type: v.type, defaultValue: v.defaultValue };
      });

      const sessionVariablesObj: Record<string, any> = {};
      sessionVars.forEach(v => {
        sessionVariablesObj[v.name.trim()] = { type: v.type, defaultValue: v.defaultValue };
      });

      const updatedLayoutData = {
        ...currentPage.layoutData,
        root: {
          ...(currentPage.layoutData?.root || {}),
          localVariables: localVariablesObj,
          sessionVariables: sessionVariablesObj
        }
      };

      const finalPageData = {
        ...currentPage,
        ...formData,
        layoutData: updatedLayoutData
      };

      // First update the local store
      updatePage(currentPageId, {
        ...formData,
        layoutData: updatedLayoutData
      });
      
      // Then sync to database
      const result = await pageAPI.updatePage(currentPageId, finalPageData);
      
      if (!result.success) {
        if (result.error?.includes('404')) {
          const createResult = await pageAPI.createPage(finalPageData);
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
        description: "Page settings and variables have been saved successfully"
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

  const renderVariablesSection = (
    title: string,
    variables: PageVariable[],
    setVariables: React.Dispatch<React.SetStateAction<PageVariable[]>>
  ) => {
    const addVar = () => {
      setVariables(prev => [...prev, { name: '', type: 'string', defaultValue: '' }]);
    };

    const updateVar = (index: number, key: keyof PageVariable, val: any) => {
      setVariables(prev => prev.map((v, i) => i === index ? { ...v, [key]: val } : v));
    };

    const deleteVar = (index: number) => {
      setVariables(prev => prev.filter((_, i) => i !== index));
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</Label>
          <Button variant="outline" size="sm" onClick={addVar} className="h-7 gap-1 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>

        {variables.length === 0 ? (
          <p className="text-xs text-muted-foreground italic bg-muted/30 border border-dashed rounded-md p-3 text-center">
            No variables defined.
          </p>
        ) : (
          <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
            {variables.map((v, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  placeholder="name"
                  value={v.name}
                  onChange={(e) => updateVar(idx, 'name', e.target.value)}
                  className="flex-1 h-8 text-xs font-mono"
                />
                <select
                  value={v.type}
                  onChange={(e) => {
                    const newType = e.target.value as 'string' | 'number' | 'boolean';
                    let defVal: any = '';
                    if (newType === 'number') defVal = 0;
                    if (newType === 'boolean') defVal = false;
                    updateVar(idx, 'type', newType);
                    updateVar(idx, 'defaultValue', defVal);
                  }}
                  className="w-24 h-8 px-2 border rounded-md bg-background text-xs"
                >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                </select>
                
                {v.type === 'boolean' ? (
                  <div className="w-28 flex items-center justify-center h-8">
                    <Switch
                      checked={!!v.defaultValue}
                      onCheckedChange={(checked) => updateVar(idx, 'defaultValue', checked)}
                    />
                  </div>
                ) : (
                  <Input
                    type={v.type === 'number' ? 'number' : 'text'}
                    placeholder="Default value"
                    value={v.defaultValue}
                    onChange={(e) => {
                      const rawVal = e.target.value;
                      const val = v.type === 'number' ? (rawVal === '' ? '' : Number(rawVal)) : rawVal;
                      updateVar(idx, 'defaultValue', val);
                    }}
                    className="w-28 h-8 text-xs"
                  />
                )}
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteVar(idx)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Page Settings</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid grid-cols-3 w-full mb-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
            <TabsTrigger value="variables">Variables</TabsTrigger>
          </TabsList>
          
          {/* General Tab */}
          <TabsContent value="general" className="space-y-4 mt-0">
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

            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Page Options</h4>
              
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
          </TabsContent>

          {/* SEO Tab */}
          <TabsContent value="seo" className="space-y-4 mt-0">
            <div className="space-y-2">
              <Label htmlFor="page-title">Meta Title</Label>
              <Input
                id="page-title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Page title for search engines"
                maxLength={60}
              />
              <p className="text-[10px] text-muted-foreground text-right">
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
              <p className="text-[10px] text-muted-foreground text-right">
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
          </TabsContent>

          {/* Variables Tab */}
          <TabsContent value="variables" className="space-y-6 mt-0">
            <div className="bg-muted/30 border rounded-lg p-3 text-xs text-muted-foreground leading-relaxed">
              Define local page variables or session storage variables. You can read these variables in visibility conditions (e.g. <code className="bg-muted px-1 py-0.5 rounded font-mono">local.modalOpen == true</code>) or template texts (e.g. <code className="bg-muted px-1 py-0.5 rounded font-mono">{"{{ local.userName }}"}</code>).
            </div>
            
            {renderVariablesSection("Local Variables (Page scope)", localVars, setLocalVars)}
            <hr className="border-border" />
            {renderVariablesSection("Session Variables (Tab scope)", sessionVars, setSessionVars)}
          </TabsContent>
        </Tabs>
        
        {/* Actions */}
        <div className="flex justify-end gap-3 border-t pt-4 mt-2">
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
      </DialogContent>
    </Dialog>
  );
};