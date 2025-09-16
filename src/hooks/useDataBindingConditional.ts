import { useEffect, useCallback } from 'react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useDashboardStore } from '@/stores/dashboard';

/**
 * Conditional hook that initializes data-binding only when bindable components are present
 * This hook should be called by components that need data-binding functionality
 */
export const useDataBindingConditional = () => {
  const { connections } = useDashboardStore();
  const { connected: bindingConnected, initialize } = useDataBindingStore();
  
  const dashboardConnected = connections.supabase.connected;
  
  const initializeDataBinding = useCallback(() => {
    // Only initialize if dashboard is connected but data-binding isn't
    if (dashboardConnected && !bindingConnected) {
      initialize();
    }
  }, [dashboardConnected, bindingConnected, initialize]);

  useEffect(() => {
    initializeDataBinding();
  }, [initializeDataBinding]);

  return {
    connected: bindingConnected,
    dashboardConnected,
  };
};