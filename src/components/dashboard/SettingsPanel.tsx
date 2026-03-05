/**
 * SettingsPanel
 * 
 * Dashboard settings page with tabs for General, Team & Emails, and Privacy.
 * Edge Infrastructure tabs have been moved to /edge (EdgeInfrastructurePanel).
 * 
 * Supports deep linking via URL search params:
 *   /settings?tab=general
 *   /settings?tab=team
 *   /settings?tab=privacy
 */

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Users } from 'lucide-react';
import { PrivacySettingsForm } from './settings/shared/PrivacySettingsForm';
import { ProjectDetailsForm } from './settings/shared/ProjectDetailsForm';
import { EmailProviderSettingsForm } from './settings/shared/EmailProviderSettingsForm';
import { AdminInviteForm } from './settings/shared/AdminInviteForm';

const VALID_TABS = ['general', 'team', 'privacy'] as const;
type SettingsTab = typeof VALID_TABS[number];

export const SettingsPanel: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: SettingsTab = VALID_TABS.includes(rawTab as SettingsTab)
    ? (rawTab as SettingsTab)
    : 'general';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your project settings and integrations
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-[500px]">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="team">Team & Emails</TabsTrigger>
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

        {/* Privacy & Tracking Tab */}
        <TabsContent value="privacy" className="space-y-6 mt-6">
          <PrivacySettingsForm withCard />
        </TabsContent>
      </Tabs>
    </div>
  );
};
