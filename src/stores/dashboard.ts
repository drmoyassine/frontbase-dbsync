import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debug } from '@/lib/debug';
import { requestDeduplicator, generateRequestKey } from '@/lib/request-deduplicator';

interface DatabaseConnection {
  connected: boolean;
  url?: string;
  hasServiceKey?: boolean;
}

interface SupabaseTable {
  name: string;
  schema: string;
  path?: string;
}

interface DashboardState {
  activeSection: 'pages' | 'database' | 'users' | 'storage' | 'settings';
  searchQuery: string;
  filterStatus: 'all' | 'published' | 'draft';
  
  // Database connections
  connections: {
    supabase: DatabaseConnection;
  };
  
  // Modal states
  supabaseModalOpen: boolean;
  tableSchemaModalOpen: boolean;
  tableDataModalOpen: boolean;
  
  // Actions
  setActiveSection: (section: 'pages' | 'database' | 'users' | 'storage' | 'settings') => void;
  setSearchQuery: (query: string) => void;
  setFilterStatus: (status: 'all' | 'published' | 'draft') => void;
  setConnections: (connections: { supabase: DatabaseConnection }) => void;
  setSupabaseModalOpen: (open: boolean) => void;
  setTableSchemaModalOpen: (open: boolean) => void;
  setTableDataModalOpen: (open: boolean) => void;
  fetchConnections: () => Promise<void>;
  notifyConnectionChange: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
  activeSection: 'pages',
  searchQuery: '',
  filterStatus: 'all',
  connections: {
    supabase: { connected: false }
  },
  supabaseModalOpen: false,
  tableSchemaModalOpen: false,
  tableDataModalOpen: false,

  setActiveSection: (section) => set({ activeSection: section }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  setConnections: (connections) => {
    set({ connections });
    // Notify data-binding store of connection changes
    get().notifyConnectionChange();
  },
  setSupabaseModalOpen: (open) => set({ supabaseModalOpen: open }),
  setTableSchemaModalOpen: (open) => set({ tableSchemaModalOpen: open }),
  setTableDataModalOpen: (open) => set({ tableDataModalOpen: open }),
  
  fetchConnections: async () => {
    const requestKey = generateRequestKey('/api/database/connections');
    
    return requestDeduplicator.dedupe(requestKey, async () => {
      try {
        const response = await fetch('/api/database/connections', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const connections = await response.json();
          set({ connections });
          get().notifyConnectionChange();
          debug.critical('DASHBOARD', 'Connections updated:', Object.keys(connections));
        } else {
          debug.error('DASHBOARD', 'Failed to fetch connections:', response.status);
        }
      } catch (error) {
        debug.error('DASHBOARD', 'Connection fetch error:', error);
      }
    });
  },

  notifyConnectionChange: () => {
    // This will be used by data-binding store to react to connection changes
    debug.critical('DASHBOARD', 'Connection change notification sent');
  },
    }),
    {
      name: 'dashboard-storage',
      partialize: (state) => ({
        connections: state.connections,
        // Only persist connections, exclude UI state like loading, modals, etc.
      }),
    }
  )
);