import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Settings, Database, Globe, Palette } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';

export const SettingsPanel: React.FC = () => {
  const { project } = useBuilderStore();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your project settings and integrations
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Project Details
            </CardTitle>
            <CardDescription>
              Basic information about your project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                defaultValue={project?.name || ''}
                placeholder="My Awesome Website"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                defaultValue={project?.description || ''}
                placeholder="Describe your project..."
                rows={3}
              />
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Supabase Integration
            </CardTitle>
            <CardDescription>
              Connect your Supabase project for backend functionality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supabase-url">Supabase URL</Label>
              <Input
                id="supabase-url"
                placeholder="https://your-project.supabase.co"
                defaultValue={project?.supabaseUrl || ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supabase-key">Supabase Anon Key</Label>
              <Input
                id="supabase-key"
                type="password"
                placeholder="Your Supabase anonymous key"
                defaultValue={project?.supabaseAnonKey || ''}
              />
            </div>
            <Button>Update Integration</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              SEO & Meta
            </CardTitle>
            <CardDescription>
              Default SEO settings for your website
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="default-title">Default Page Title</Label>
              <Input
                id="default-title"
                placeholder="My Website"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-description">Default Meta Description</Label>
              <Textarea
                id="default-description"
                placeholder="A description of your website..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-keywords">Default Keywords</Label>
              <Input
                id="default-keywords"
                placeholder="keyword1, keyword2, keyword3"
              />
            </div>
            <Button>Save SEO Settings</Button>
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive">
              Delete Project
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};