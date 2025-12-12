import React, { useMemo, useState, useEffect } from 'react';
import { UniversalDataTable } from '@/components/data-binding/UniversalDataTable';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Settings2 } from 'lucide-react';
import { CompactColumnConfigurator } from '@/components/builder/data-table/CompactColumnConfigurator';
import { FilterConfigurator } from '@/components/builder/data-table/FilterConfigurator';
import { databaseApi } from '@/services/database-api';

export const UserManagementTable = () => {
  const { config, isConfigured, saveConfig } = useUserContactConfig();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState<Record<string, string[]>>({});

  // Auth Columns Definition (Virtual)
  const authColumns = [
    { name: 'auth_email', type: 'text' },
    { name: 'auth_created_at', type: 'date' },
    { name: 'last_sign_in_at', type: 'date' }
  ];

  // Fetch filter options contextually
  useEffect(() => {
    if (!config?.frontendFilters || !isConfigured) return;

    const fetchOptions = async () => {
      const newOptions: Record<string, string[]> = {};

      for (const filter of config.frontendFilters || []) {
        if ((filter.filterType === 'dropdown' || filter.filterType === 'multiselect') && filter.column) {
          try {
            const result = await databaseApi.advancedQuery('frontbase_get_users_filter_options', {
              table_name: config.contactsTable,
              auth_id_col: config.columnMapping.authUserIdColumn,
              column_name: filter.column
            });

            if (result.success && result.rows) {
              // Extract values from rows (format: [{ "colName": "value" }])
              // The RPC returns json_agg of row objects, but depending on how we wrote it...
              // Wait, the RPC returns `json_agg(t)` where t is `SELECT DISTINCT c.col ...`
              // So rows will be `[{ "colname": "value" }, ...]`

              // We need to robustly extract the first value of each object
              const values = result.rows.map(row => Object.values(row)[0] as string).filter(Boolean);
              newOptions[filter.id] = values;
            }
          } catch (e) {
            console.error('Failed to fetch options for', filter.column, e);
          }
        }
      }
      setFilterOptions(newOptions);
    };

    fetchOptions();
  }, [config?.frontendFilters, config?.contactsTable, isConfigured]);

  const binding = useMemo(() => {
    if (!isConfigured || !config) return null;

    const createdAtCol = config.columnMapping.createdAtColumn || 'created_at';

    // Base Overrides
    const baseOverrides = {
      // Auth Columns from RPC
      'auth_email': {
        displayName: 'Auth Email',
        width: 250,
        sortable: true,
        hidden: false
      },
      'auth_created_at': {
        displayName: 'Joined (Auth)',
        width: 180,
        sortable: true,
        hidden: false,
        displayType: 'date',
        dateFormat: 'relative'
      },
      'last_sign_in_at': {
        displayName: 'Last Login',
        width: 180,
        sortable: true,
        hidden: false,
        displayType: 'date',
        dateFormat: 'relative'
      },

      // Mapped Columns from Contacts Table
      [config.columnMapping.authUserIdColumn]: {
        hidden: true,
        displayName: 'Auth Link ID',
        width: 200
      },
      [config.columnMapping.contactIdColumn]: {
        hidden: true,
        displayName: 'Contact ID',
        isPrimaryKey: true
      },
      [createdAtCol]: {
        displayName: 'Contact Created',
        hidden: true, // Prefer Auth created_at
        width: 150,
        sortable: true
      }
    };

    // User Saved Overrides (merge deeply/safely)
    const savedOverrides = config.columnOverrides || {};
    const mergedOverrides = { ...baseOverrides, ...savedOverrides };

    // Inject options into filters
    const enrichedFilters = (config.frontendFilters || []).map((f: any) => ({
      ...f,
      options: filterOptions[f.id] || undefined
    }));

    return {
      componentId: 'user-management-table',
      tableName: config.contactsTable,
      dataSourceId: 'backend',
      rpcName: 'frontbase_get_users_list',
      params: {
        table_name: config.contactsTable,
        auth_id_col: config.columnMapping.authUserIdColumn
      },
      query: {
        table: config.contactsTable,
        select: '*',
        filters: [],
        orderBy: [{ column: 'created_at', ascending: false }]
      },
      columnOverrides: mergedOverrides,
      columnOrder: config.columnOrder, // Use saved order if exists
      frontendFilters: enrichedFilters, // Use filters with options
      pagination: {
        pageSize: 10,
        enabled: true,
        page: 1
      },
      sorting: { enabled: true, defaultSort: [{ column: createdAtCol, direction: 'desc' }] },
      filtering: { searchEnabled: true, filters: {} },
      refreshInterval: 30000,
    };
  }, [config, isConfigured, filterOptions]);

  const handleUpdateColumnOverrides = (overrides: any) => {
    if (!config) return;
    saveConfig({ ...config, columnOverrides: overrides });
  };

  const handleUpdateColumnOrder = (order: string[]) => {
    if (!config) return;
    saveConfig({ ...config, columnOrder: order });
  };

  const handleUpdateFilters = (filters: any[]) => {
    if (!config) return;
    saveConfig({ ...config, frontendFilters: filters });
  };


  if (!isConfigured || !binding) {
    return <div className="p-4 text-center text-muted-foreground">User Management not configured</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Data Table</h2>

        {/* Configuration Dialog */}
        <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Settings2 className="w-4 h-4" />
              Configure Table
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Configure User Table</DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="columns" className="flex-1 overflow-hidden flex flex-col">
              <TabsList>
                <TabsTrigger value="columns">Columns</TabsTrigger>
                <TabsTrigger value="filters">Filters</TabsTrigger>
              </TabsList>

              <TabsContent value="columns" className="flex-1 overflow-y-auto p-1">
                <CompactColumnConfigurator
                  tableName={config.contactsTable}
                  columnOverrides={config.columnOverrides || {}}
                  columnOrder={config.columnOrder}
                  onColumnOverridesChange={handleUpdateColumnOverrides}
                  onColumnOrderChange={handleUpdateColumnOrder}
                  additionalColumns={authColumns}
                />
              </TabsContent>

              <TabsContent value="filters" className="flex-1 overflow-y-auto p-1">
                <FilterConfigurator
                  tableName={config.contactsTable}
                  filters={config.frontendFilters || []}
                  onFiltersChange={handleUpdateFilters}
                  columnOrder={config.columnOrder}
                />
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md">
        <UniversalDataTable componentId="user-management-table" binding={binding} />
      </div>
    </div>
  );
};
