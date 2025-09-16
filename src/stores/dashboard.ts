import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  
  // Supabase tables
  supabaseTables: SupabaseTable[];
  tablesLoading: boolean;
  tablesError: string | null;
  selectedTable: string | null;
  
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
  setSelectedTable: (table: string | null) => void;
  fetchConnections: () => Promise<void>;
  fetchSupabaseTables: () => Promise<void>;
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
  supabaseTables: [],
  tablesLoading: false,
  tablesError: null,
  selectedTable: null,
  supabaseModalOpen: false,
  tableSchemaModalOpen: false,
  tableDataModalOpen: false,

  setActiveSection: (section) => set({ activeSection: section }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  setConnections: (connections) => set({ connections }),
  setSupabaseModalOpen: (open) => set({ supabaseModalOpen: open }),
  setTableSchemaModalOpen: (open) => set({ tableSchemaModalOpen: open }),
  setTableDataModalOpen: (open) => set({ tableDataModalOpen: open }),
  setSelectedTable: (table) => set({ selectedTable: table }),
  
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

  fetchSupabaseTables: async () => {
    set({ tablesLoading: true, tablesError: null });
    try {
      const response = await fetch('/api/database/supabase-tables', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.success) {
          set({ supabaseTables: result.data.tables, tablesLoading: false });
        } else {
          set({ tablesError: result.message, tablesLoading: false });
        }
      } else {
        set({ tablesError: 'Failed to fetch tables', tablesLoading: false });
      }
    } catch (error) {
      console.error('Failed to fetch Supabase tables:', error);
      set({ tablesError: 'Failed to fetch tables', tablesLoading: false });
    }
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