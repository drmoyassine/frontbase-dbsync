import React, { useMemo } from 'react';
import { UniversalDataTable } from '@/components/data-binding/UniversalDataTable';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

export function UserManagementTable() {
  const { config, isConfigured } = useUserContactConfig();

  const binding = useMemo(() => {
    if (!isConfigured || !config) return null;

    return {
      componentId: 'user-management-table',
      tableName: config.contactsTable,
      dataSourceId: 'backend',
      query: {
        table: config.contactsTable,
        select: '*',
        filters: [],
        orderBy: [{ column: 'created_at', ascending: false }]
      },
      refreshInterval: 30000,
      pagination: { enabled: true, pageSize: 25, page: 1 },
      sorting: { enabled: true, defaultSort: [{ column: 'created_at', direction: 'desc' }] },
      filtering: { searchEnabled: true, filters: {} },
      columnOverrides: {
        // Hide sensitive columns by default
        [config.columnMapping.authUserIdColumn]: {
          hidden: false,
          displayName: 'User ID',
          width: 200
        },
        ...(config.columnMapping.nameColumn && {
          [config.columnMapping.nameColumn]: {
            displayName: 'Name',
            width: 200,
            sortable: true
          }
        }),
        ...(config.columnMapping.emailColumn && {
          [config.columnMapping.emailColumn]: {
            displayName: 'Email',
            width: 250,
            sortable: true
          }
        }),
        ...(config.columnMapping.phoneColumn && {
          [config.columnMapping.phoneColumn]: {
            displayName: 'Phone',
            width: 150
          }
        }),
        [config.columnMapping.contactIdColumn]: {
          displayName: 'Contact ID',
          hidden: true,
          width: 100
        },
        [config.columnMapping.contactTypeColumn]: {
          displayName: 'Type',
          width: 150,
          sortable: true
        },
        [config.columnMapping.permissionLevelColumn]: {
          displayName: 'Permission',
          width: 150,
          sortable: true
        },
        created_at: {
          displayName: 'Registered',
          width: 150,
          sortable: true
        },
        updated_at: {
          displayName: 'Last Updated',
          width: 150,
          sortable: true
        }
      }
    };
  }, [config, isConfigured]);

  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Management
          </CardTitle>
          <CardDescription>
            Configure user contact data sync to manage users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Please configure the user contact data settings above to view and manage users.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!binding) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-500">
            Invalid user contact configuration
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          User Management
        </CardTitle>
        <CardDescription>
          Manage users from your {config.contactsTable} table
        </CardDescription>
      </CardHeader>
      <CardContent>
        <UniversalDataTable
          componentId={binding.componentId}
          binding={binding}
        />
      </CardContent>
    </Card>
  );
}