import { create } from 'zustand';

interface DatabaseConnection {
  connected: boolean;
  url?: string;
  hasServiceKey?: boolean;
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
  
  // Actions
  setActiveSection: (section: 'pages' | 'database' | 'users' | 'storage' | 'settings') => void;
  setSearchQuery: (query: string) => void;
  setFilterStatus: (status: 'all' | 'published' | 'draft') => void;
  setConnections: (connections: { supabase: DatabaseConnection }) => void;
  setSupabaseModalOpen: (open: boolean) => void;
  fetchConnections: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  activeSection: 'pages',
  searchQuery: '',
  filterStatus: 'all',
  connections: {
    supabase: { connected: false }
  },
  supabaseModalOpen: false,

  setActiveSection: (section) => set({ activeSection: section }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  setConnections: (connections) => set({ connections }),
  setSupabaseModalOpen: (open) => set({ supabaseModalOpen: open }),
  
  fetchConnections: async () => {
    try {
      const response = await fetch('/api/database/connections', {
        credentials: 'include'
      });
      if (response.ok) {
        const connections = await response.json();
        set({ connections });
      }
    } catch (error) {
      console.error('Failed to fetch connections:', error);
    }
  },
}));