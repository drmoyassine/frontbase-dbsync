import React from 'react';
import { UserContactConfigPanel } from './UserContactConfigPanel';
import { UserStatsCards } from './UserStatsCards';
import { UserManagementTable } from './UserManagementTable';
import { RLSPoliciesPanel } from './RLSPoliciesPanel';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { AddBuilderDialog } from './AddBuilderDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthFormsList } from './AuthFormsList';

export function UsersPanel() {
  const { isConfigured } = useUserContactConfig();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">
            Manage your application users and sync their contact data with Supabase auth.
          </p>
        </div>
        <AddBuilderDialog />
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
    </div>
  );
}
