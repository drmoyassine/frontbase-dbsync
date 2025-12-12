import React from 'react';
import { UserContactConfigPanel } from './UserContactConfigPanel';
import { UserStatsCards } from './UserStatsCards';
import { UserManagementTable } from './UserManagementTable';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { AddBuilderDialog } from './AddBuilderDialog';

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

      <UserContactConfigPanel />

      {isConfigured && (
        <>
          <UserStatsCards />
          <UserManagementTable />
        </>
      )}
    </div>
  );
}