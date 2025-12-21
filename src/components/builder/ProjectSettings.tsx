import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Settings, Database, Globe, Variable } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';

export const ProjectSettings: React.FC = () => {
  const { 
    project, 
    updateProject, 
    appVariables, 
    addAppVariable, 
    updateAppVariable, 
    deleteAppVariable 
  } = useBuilderStore();
  
  const [isOpen, setIsOpen] = useState(false);
  const [newVariable, setNewVariable] = useState({ name: '', type: 'variable' as const, value: '', description: '' });

  const handleAddVariable = () => {
    if (newVariable.name) {
      addAppVariable(newVariable);
      setNewVariable({ name: '', type: 'variable', value: '', description: '' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] h-[600px]">
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="general" className="flex-1">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="database">Database</TabsTrigger>
            <TabsTrigger value="variables">Variables</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general" className="space-y-4">
            <div>
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={project?.name || ''}
                onChange={(e) => updateProject({ name: e.target.value })}
                placeholder="My Frontbase Project"
              />
            </div>
            <div>
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                value={project?.description || ''}
                onChange={(e) => updateProject({ description: e.target.value })}
                placeholder="Project description..."
                rows={3}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="database" className="space-y-4">
            <div className="text-sm text-muted-foreground mb-4">
              Configure your Supabase connection for data binding.
            </div>
            <div>
              <Label htmlFor="supabase-url">Supabase URL</Label>
              <Input
                id="supabase-url"
                value={project?.supabaseUrl || ''}
                onChange={(e) => updateProject({ supabaseUrl: e.target.value })}
                placeholder="https://your-project.supabase.co"
              />
            </div>
            <div>
              <Label htmlFor="supabase-key">Supabase Anon Key</Label>
              <Input
                id="supabase-key"
                type="password"
                value={project?.supabaseAnonKey || ''}
                onChange={(e) => updateProject({ supabaseAnonKey: e.target.value })}
                placeholder="Your anon public key"
              />
            </div>
            <Button className="w-full">
              <Database className="h-4 w-4 mr-2" />
              Test Connection
            </Button>
          </TabsContent>
          
          <TabsContent value="variables" className="space-y-4">
            <div className="text-sm text-muted-foreground mb-4">
              Create app-level variables that can be used in templates.
            </div>
            
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium">Add New Variable</h4>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Variable name"
                  value={newVariable.name}
                  onChange={(e) => setNewVariable(prev => ({ ...prev, name: e.target.value }))}
                />
                <Input
                  placeholder="Value"
                  value={newVariable.value}
                  onChange={(e) => setNewVariable(prev => ({ ...prev, value: e.target.value }))}
                />
              </div>
              <Input
                placeholder="Description (optional)"
                value={newVariable.description}
                onChange={(e) => setNewVariable(prev => ({ ...prev, description: e.target.value }))}
              />
              <Button onClick={handleAddVariable} size="sm">
                Add Variable
              </Button>
            </div>
            
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {appVariables.map((variable) => (
                <div key={variable.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <div className="font-medium">{`{{ app.${variable.name} }}`}</div>
                    <div className="text-sm text-muted-foreground">{variable.value}</div>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => deleteAppVariable(variable.id)}>
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="seo" className="space-y-4">
            <div className="text-sm text-muted-foreground mb-4">
              Configure global SEO settings for your project.
            </div>
            <div>
              <Label>Default Site Title</Label>
              <Input placeholder="My Website" />
            </div>
            <div>
              <Label>Default Meta Description</Label>
              <Textarea placeholder="Default description for pages..." rows={2} />
            </div>
            <div>
              <Label>Default Keywords</Label>
              <Input placeholder="keyword1, keyword2, keyword3" />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};