import { create } from 'zustand';

interface DashboardState {
  activeSection: 'pages' | 'database' | 'users' | 'storage' | 'settings';
  searchQuery: string;
  filterStatus: 'all' | 'published' | 'draft';
  
  // Supabase connection state
  supabaseConnected: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  
  // Actions
  setActiveSection: (section: 'pages' | 'database' | 'users' | 'storage' | 'settings') => void;
  setSearchQuery: (query: string) => void;
  setFilterStatus: (status: 'all' | 'published' | 'draft') => void;
  setSupabaseConnection: (connected: boolean, url?: string, key?: string) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  activeSection: 'pages',
  searchQuery: '',
  filterStatus: 'all',
  supabaseConnected: false,
  supabaseUrl: '',
  supabaseAnonKey: '',

  setActiveSection: (section) => set({ activeSection: section }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  setSupabaseConnection: (connected, url = '', key = '') => 
    set({ 
      supabaseConnected: connected, 
      supabaseUrl: url, 
      supabaseAnonKey: key 
    }),
}));