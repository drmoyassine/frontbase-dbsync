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
import { RefreshCw, Users } from 'lucide-react';
import { RedisSettingsForm } from './settings/shared/RedisSettingsForm';
import { PrivacySettingsForm } from './settings/shared/PrivacySettingsForm';
import { ProjectDetailsForm } from './settings/shared/ProjectDetailsForm';
import { EmailProviderSettingsForm } from './settings/shared/EmailProviderSettingsForm';
import { AdminInviteForm } from './settings/shared/AdminInviteForm';

export const SettingsPanel: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your project settings and integrations
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[800px]">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="team">Team & Emails</TabsTrigger>
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

        {/* Team & Emails Tab */}
        <TabsContent value="team" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Management
              </CardTitle>
              <CardDescription>
                Invite colleagues to collaborate on this project.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <AdminInviteForm />

              <Separator className="my-6" />

              <EmailProviderSettingsForm />
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
