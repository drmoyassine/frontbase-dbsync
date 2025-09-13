import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export interface Page {
  id: string;
  name: string;
  slug: string;
  title?: string;
  description?: string;
  keywords?: string;
  isPublic: boolean;
  isHomepage: boolean;
  layoutData: any; // Puck layout data
  createdAt: string;
  updatedAt: string;
}

export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppVariable {
  id: string;
  name: string;
  type: 'variable' | 'calculated';
  value?: string;
  formula?: string;
  description?: string;
  createdAt: string;
}

interface BuilderState {
  // Project config
  project: ProjectConfig | null;
  
  // Pages
  pages: Page[];
  currentPageId: string | null;
  
  // Builder state
  selectedComponentId: string | null;
  isPreviewMode: boolean;
  
  // Variables
  appVariables: AppVariable[];
  
  // Supabase connection
  isSupabaseConnected: boolean;
  supabaseTables: any[];
  
  // Actions
  setProject: (project: ProjectConfig) => void;
  updateProject: (updates: Partial<ProjectConfig>) => void;
  
  createPage: (page: Omit<Page, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updatePage: (id: string, updates: Partial<Page>) => void;
  deletePage: (id: string) => void;
  setCurrentPage: (id: string) => void;
  
  setSelectedComponent: (id: string | null) => void;
  setPreviewMode: (isPreview: boolean) => void;
  
  addAppVariable: (variable: Omit<AppVariable, 'id' | 'createdAt'>) => void;
  updateAppVariable: (id: string, updates: Partial<AppVariable>) => void;
  deleteAppVariable: (id: string) => void;
  
  setSupabaseConnection: (connected: boolean, tables?: any[]) => void;
}

export const useBuilderStore = create<BuilderState>()(
  persist(
    (set, get) => ({
      // Initial state
      project: null,
      pages: [],
      currentPageId: null,
      selectedComponentId: null,
      isPreviewMode: false,
      appVariables: [],
      isSupabaseConnected: false,
      supabaseTables: [],
      
      // Actions
      setProject: (project) => set({ project }),
      
      updateProject: (updates) => set((state) => ({
        project: state.project ? { ...state.project, ...updates, updatedAt: new Date().toISOString() } : null
      })),
      
      createPage: (pageData) => {
        const newPage: Page = {
          ...pageData,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        set((state) => ({
          pages: [...state.pages, newPage],
          currentPageId: newPage.id
        }));
      },
      
      updatePage: (id, updates) => set((state) => ({
        pages: state.pages.map(page => 
          page.id === id 
            ? { ...page, ...updates, updatedAt: new Date().toISOString() }
            : page
        )
      })),
      
      deletePage: (id) => set((state) => ({
        pages: state.pages.filter(page => page.id !== id),
        currentPageId: state.currentPageId === id ? null : state.currentPageId
      })),
      
      setCurrentPage: (id) => set({ currentPageId: id }),
      
      setSelectedComponent: (id) => set({ selectedComponentId: id }),
      
      setPreviewMode: (isPreview) => set({ isPreviewMode: isPreview }),
      
      addAppVariable: (variableData) => {
        const newVariable: AppVariable = {
          ...variableData,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
        };
        
        set((state) => ({
          appVariables: [...state.appVariables, newVariable]
        }));
      },
      
      updateAppVariable: (id, updates) => set((state) => ({
        appVariables: state.appVariables.map(variable =>
          variable.id === id ? { ...variable, ...updates } : variable
        )
      })),
      
      deleteAppVariable: (id) => set((state) => ({
        appVariables: state.appVariables.filter(variable => variable.id !== id)
      })),
      
      setSupabaseConnection: (connected, tables = []) => set({
        isSupabaseConnected: connected,
        supabaseTables: tables
      }),
    }),
    {
      name: 'frontbase-builder-storage',
    }
  )
);