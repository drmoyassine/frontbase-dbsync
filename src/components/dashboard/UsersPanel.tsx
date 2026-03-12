import React from 'react';
import { UserContactConfigPanel } from './UserContactConfigPanel';
import { UserStatsCards } from './UserStatsCards';
import { UserManagementTable } from './UserManagementTable';
import { RLSPoliciesPanel } from './RLSPoliciesPanel';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthFormsList } from './AuthFormsList';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AUTH_CAPABLE_PROVIDERS } from '@/components/dashboard/settings/shared/edgeConstants';
import { ConnectProviderDialog } from '@/components/dashboard/settings/shared/ConnectProviderDialog';
import { useQueryClient } from '@tanstack/react-query';

export function UsersPanel() {
  const { isConfigured } = useUserContactConfig();
  const queryClient = useQueryClient();
  const [connectOpen, setConnectOpen] = React.useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">
            Manage your application users and sync their contact data with auth providers.
          </p>
        </div>
        <Button onClick={() => setConnectOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Auth
        </Button>
      </div>

      <Tabs defaultValue="users-config" className="w-full space-y-6">
        <TabsList>
          <TabsTrigger value="users-config">Users Configuration</TabsTrigger>
          <TabsTrigger value="authentication">Authentication</TabsTrigger>
          <TabsTrigger value="access-rule">Access Rule</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="users-config" className="space-y-6">
          <UserContactConfigPanel />
        </TabsContent>

        <TabsContent value="authentication">
          <AuthFormsList />
        </TabsContent>

        <TabsContent value="access-rule">
          <RLSPoliciesPanel />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <UserStatsCards />
          {isConfigured && <UserManagementTable />}
        </TabsContent>
      </Tabs>

      {/* Connect Auth Provider Dialog */}
      <ConnectProviderDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        allowedProviders={AUTH_CAPABLE_PROVIDERS}
        onConnected={() => {
          queryClient.invalidateQueries({ queryKey: ['edge-providers'] });
        }}
      />
    </div>
  );
}
