import { useMemo } from 'react';
import * as React from 'react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useUserContactConfig } from './useUserContactConfig';

export function useUserStats() {
  const { config, isConfigured } = useUserContactConfig();
  const { queryData } = useDataBindingStore();

  const totalUsersBinding = useMemo(() => {
    if (!isConfigured || !config) return null;

    return {
      componentId: 'user-stats-total',
      tableName: config.contactsTable,
      dataSourceId: 'backend',
      query: {
        table: config.contactsTable,
        select: 'count(*)',
        filters: []
      },
      refreshInterval: 30000, // Refresh every 30 seconds
      pagination: { enabled: false, pageSize: 1, page: 1 },
      sorting: { enabled: false, defaultSort: [] },
      filtering: { searchEnabled: false, filters: {} },
      columnOverrides: {}
    };
  }, [config, isConfigured]);

  const recentUsersBinding = useMemo(() => {
    if (!isConfigured || !config) return null;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return {
      componentId: 'user-stats-recent',
      tableName: config.contactsTable,
      dataSourceId: 'backend',
      query: {
        table: config.contactsTable,
        select: 'count(*)',
        filters: [
          {
            column: 'created_at',
            operator: 'gte' as const,
            value: sevenDaysAgo.toISOString()
          }
        ]
      },
      refreshInterval: 30000,
      pagination: { enabled: false, pageSize: 1, page: 1 },
      sorting: { enabled: false, defaultSort: [] },
      filtering: { searchEnabled: false, filters: {} },
      columnOverrides: {}
    };
  }, [config, isConfigured]);

  // Get data from store state
  const { dataCache, loadingStates, errors } = useDataBindingStore.getState();
  
  const totalData = totalUsersBinding ? dataCache.get(totalUsersBinding.componentId) : null;
  const recentData = recentUsersBinding ? dataCache.get(recentUsersBinding.componentId) : null;
  
  const totalLoading = totalUsersBinding ? (loadingStates.get(totalUsersBinding.componentId) || false) : false;
  const recentLoading = recentUsersBinding ? (loadingStates.get(recentUsersBinding.componentId) || false) : false;
  
  const totalError = totalUsersBinding ? errors.get(totalUsersBinding.componentId) : null;
  const recentError = recentUsersBinding ? errors.get(recentUsersBinding.componentId) : null;

  // Trigger data fetch if not cached
  React.useEffect(() => {
    if (totalUsersBinding && !totalData && !totalLoading) {
      queryData(totalUsersBinding.componentId, totalUsersBinding);
    }
    if (recentUsersBinding && !recentData && !recentLoading) {
      queryData(recentUsersBinding.componentId, recentUsersBinding);
    }
  }, [totalUsersBinding, recentUsersBinding, totalData, recentData, totalLoading, recentLoading, queryData]);

  return {
    totalUsers: totalData?.[0]?.count || 0,
    recentUsers: recentData?.[0]?.count || 0,
    loading: totalLoading || recentLoading,
    error: totalError || recentError,
    isConfigured
  };
}