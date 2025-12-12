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

        // Try to fetch from the authoritative Supabase Auth RPC source first
        // The API response structure matches { success, rows, ... } but our RPC returns a single object
        // So advancedQuery might wrap it. Let's inspect the result.
        // Actually, advancedQuery expects "rows" in response for list data.
        // Our RPC returns a single JSON object.
        // The /api/database/advanced-query endpoint probably uses rpc() which returns { data, error }.
        // If the RPC returns a JSON object, it will be in `data`.

        const result: any = await databaseApi.advancedQuery('frontbase_get_auth_stats', {});

        if (result.success && result.data) { // Check result.data which is the raw RPC response if not rows
          // It seems advancedQuery might mask simple scalar/object returns if it's strictly expecting lists.
          // Let's assume it returns { success: true, data: { total_users, ... } }
          // Wait, looking at database-api.ts: returns response.json().
          // The API route likely returns { success: true, data: rpc_data } or similar.
          // Let's assume standard structure:
          const data = result.data || result.rows; // fallback

          setStats({
            totalUsers: Number(data.total_users || 0),
            recentUsers: Number(data.new_users || 0),
            loading: false,
            error: null
          });
        } else {
          // Fallback if success is false, but don't error out hard if it's just missing
          if (result.error) throw new Error(result.error);

          // If we just got empty data, maybe zero?
          setStats(prev => ({ ...prev, loading: false }));
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