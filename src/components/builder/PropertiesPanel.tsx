import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { 
  Settings, 
  Palette, 
  Database, 
  Code, 
  Eye 
} from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';

export const PropertiesPanel: React.FC = () => {
  const { selectedComponentId } = useBuilderStore();

  if (!selectedComponentId) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Properties</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Select a component to edit its properties</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold text-foreground">Properties</h2>
        <p className="text-sm text-muted-foreground mt-1">Button Component</p>
      </div>

      {/* Property Tabs */}
      <Tabs defaultValue="content" className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-4 gap-1 p-2 h-auto">
          <TabsTrigger value="content" className="flex flex-col gap-1 h-auto py-2">
            <Settings className="h-4 w-4" />
            <span className="text-xs">Content</span>
          </TabsTrigger>
          <TabsTrigger value="style" className="flex flex-col gap-1 h-auto py-2">
            <Palette className="h-4 w-4" />
            <span className="text-xs">Style</span>
          </TabsTrigger>
          <TabsTrigger value="data" className="flex flex-col gap-1 h-auto py-2">
            <Database className="h-4 w-4" />
            <span className="text-xs">Data</span>
          </TabsTrigger>
          <TabsTrigger value="code" className="flex flex-col gap-1 h-auto py-2">
            <Code className="h-4 w-4" />
            <span className="text-xs">Code</span>
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="content" className="p-4 space-y-4">
            <div>
              <Label htmlFor="button-text">Button Text</Label>
              <Input id="button-text" defaultValue="Click me" />
            </div>
            
            <div>
              <Label htmlFor="button-variant">Variant</Label>
              <select className="w-full p-2 border border-input rounded-md bg-background">
                <option value="default">Default</option>
                <option value="secondary">Secondary</option>
                <option value="outline">Outline</option>
                <option value="ghost">Ghost</option>
                <option value="destructive">Destructive</option>
              </select>
            </div>
            
            <div>
              <Label htmlFor="button-size">Size</Label>
              <select className="w-full p-2 border border-input rounded-md bg-background">
                <option value="default">Default</option>
                <option value="sm">Small</option>
                <option value="lg">Large</option>
                <option value="icon">Icon</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <Switch id="disabled" />
              <Label htmlFor="disabled">Disabled</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch id="full-width" />
              <Label htmlFor="full-width">Full Width</Label>
            </div>
          </TabsContent>

          <TabsContent value="style" className="p-4 space-y-4">
            <div>
              <Label>Background Color</Label>
              <div className="flex gap-2 mt-2">
                <div className="w-8 h-8 bg-primary rounded border cursor-pointer"></div>
                <div className="w-8 h-8 bg-secondary rounded border cursor-pointer"></div>
                <div className="w-8 h-8 bg-accent rounded border cursor-pointer"></div>
                <div className="w-8 h-8 bg-destructive rounded border cursor-pointer"></div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="margin">Margin</Label>
                <Input id="margin" placeholder="0px" />
              </div>
              <div>
                <Label htmlFor="padding">Padding</Label>
                <Input id="padding" placeholder="8px 16px" />
              </div>
            </div>

            <div>
              <Label htmlFor="border-radius">Border Radius</Label>
              <Input id="border-radius" placeholder="4px" />
            </div>

            <div>
              <Label htmlFor="custom-css">Custom CSS</Label>
              <Textarea 
                id="custom-css" 
                placeholder="Add custom CSS classes or styles..."
                rows={4}
              />
            </div>
          </TabsContent>

          <TabsContent value="data" className="p-4 space-y-4">
            <div>
              <Label htmlFor="data-source">Data Source</Label>
              <select className="w-full p-2 border border-input rounded-md bg-background">
                <option value="">Select a table...</option>
                <option value="users">users</option>
                <option value="posts">posts</option>
                <option value="orders">orders</option>
              </select>
            </div>

            <div>
              <Label htmlFor="click-action">Click Action</Label>
              <select className="w-full p-2 border border-input rounded-md bg-background">
                <option value="none">None</option>
                <option value="navigate">Navigate to page</option>
                <option value="submit">Submit form</option>
                <option value="delete">Delete record</option>
                <option value="custom">Custom action</option>
              </select>
            </div>

            <div>
              <Label htmlFor="conditional-visibility">Conditional Visibility</Label>
              <Textarea 
                id="conditional-visibility"
                placeholder="{{ record.status === 'active' }}"
                rows={2}
              />
            </div>
          </TabsContent>

          <TabsContent value="code" className="p-4 space-y-4">
            <div>
              <Label htmlFor="template-content">Template Content</Label>
              <Textarea 
                id="template-content"
                placeholder="{{ record.name }} - {{ record.status }}"
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            <div>
              <Label>Available Variables</Label>
              <div className="text-xs text-muted-foreground space-y-1 mt-2">
                <div>• record.field - Current record data</div>
                <div>• url.param - URL parameters</div>
                <div>• localstate.var - Component state</div>
                <div>• cookie.var - Cookie variables</div>
                <div>• app.variable - App variables</div>
              </div>
            </div>

            <Button className="w-full" variant="outline">
              Open Template Editor
            </Button>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};