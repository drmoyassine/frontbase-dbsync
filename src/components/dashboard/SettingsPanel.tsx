/**
 * SettingsPanel
 * 
 * Dashboard settings page with tabs for General, Cache, and Privacy settings.
 * Uses shared form components for consistency with Module settings.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RefreshCw } from 'lucide-react';
import { RedisSettingsForm } from './settings/shared/RedisSettingsForm';
import { PrivacySettingsForm } from './settings/shared/PrivacySettingsForm';
import { ProjectDetailsForm } from './settings/shared/ProjectDetailsForm';

export const SettingsPanel: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your project settings and integrations
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="cache">Cache & Performance</TabsTrigger>
          <TabsTrigger value="privacy">Privacy & Tracking</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6 mt-6">
          <ProjectDetailsForm withCard />

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
        </TabsContent>

        {/* Cache & Performance Tab */}
        <TabsContent value="cache" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Redis Cache Configuration
              </CardTitle>
              <CardDescription>
                Configure Redis caching to improve data loading performance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RedisSettingsForm />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Privacy & Tracking Tab */}
        <TabsContent value="privacy" className="space-y-6 mt-6">
          <PrivacySettingsForm withCard />
        </TabsContent>
      </Tabs>
    </div>
  );
};
