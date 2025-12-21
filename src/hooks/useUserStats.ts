import { useState, useEffect } from 'react';
import { useUserContactConfig } from './useUserContactConfig';
import { databaseApi } from '@/services/database-api';

export function useUserStats() {
  const { isConfigured } = useUserContactConfig();
  const [stats, setStats] = useState({
    totalUsers: 0,
    recentUsers: 0,
    loading: true,
    error: null as string | null
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        setStats(prev => ({ ...prev, loading: true }));

        const result: any = await databaseApi.advancedQuery('frontbase_get_auth_stats', {});

        if (result.success) {
          // The API returns the RPC result properties at the root level
          setStats({
            totalUsers: Number(result.total_users || 0),
            recentUsers: Number(result.new_users || 0),
            loading: false,
            error: null
          });
        } else {
          // Fallback if success is false
          const errorMsg = result.message || result.error || 'Unknown error';
          console.warn('Failed to fetch stats:', errorMsg);
          setStats(prev => ({ ...prev, loading: false, error: errorMsg }));
        }
      } catch (err) {
        console.error('Failed to fetch auth stats via RPC:', err);
        setStats(prev => ({
          ...prev,
          loading: false,
          error: 'Could not load stats from Supabase Auth'
        }));
      }
    }

    fetchStats();
  }, []); // Run once on mount

  return {
    ...stats,
    isConfigured // Pass through for UI logic if needed, though stats are now independent
  };
}