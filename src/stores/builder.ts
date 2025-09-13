import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { ComponentWithStyles } from '@/types/styles';

export interface ComponentData {
  id: string;
  type: string;
  props: Record<string, any>;
  styles?: Record<string, any>;
  children?: ComponentData[];
}

export interface Page {
  id: string;
  name: string;
  slug: string;
  title?: string;
  description?: string;
  keywords?: string;
  isPublic: boolean;
  isHomepage: boolean;
  layoutData?: {
    content: ComponentData[];
    root: Record<string, any>;
  };
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
  
  setSelectedComponentId: (id: string | null) => void;
  setCurrentPageId: (id: string | null) => void;
  setPreviewMode: (isPreview: boolean) => void;
  
  addAppVariable: (variable: Omit<AppVariable, 'id' | 'createdAt'>) => void;
  updateAppVariable: (id: string, updates: Partial<AppVariable>) => void;
  deleteAppVariable: (id: string) => void;
  
  setSupabaseConnection: (connected: boolean, tables?: any[]) => void;
  moveComponent: (pageId: string, componentId: string | null, component: ComponentData, targetIndex: number, parentId?: string, sourceParentId?: string) => void;
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
      
      setSelectedComponentId: (id) => set({ selectedComponentId: id }),
      setCurrentPageId: (id) => set({ currentPageId: id }),
      
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

      moveComponent: (pageId, componentId, component, targetIndex, parentId, sourceParentId) => {
        set((state) => {
          const pages = [...state.pages];
          const pageIndex = pages.findIndex(p => p.id === pageId);
          
          if (pageIndex === -1) return state;
          
          const page = { ...pages[pageIndex] };
          const content = [...(page.layoutData?.content || [])];
          
          // Helper function to find and remove component from nested structure
          const removeComponent = (items: ComponentData[], id: string, parentId?: string): ComponentData | null => {
            if (parentId) {
              // Remove from parent's children
              const parent = findComponentById(items, parentId);
              if (parent?.children) {
                const childIndex = parent.children.findIndex(c => c.id === id);
                if (childIndex !== -1) {
                  const removed = parent.children[childIndex];
                  parent.children.splice(childIndex, 1);
                  return removed;
                }
              }
            } else {
              // Remove from root level
              const index = items.findIndex(c => c.id === id);
              if (index !== -1) {
                return items.splice(index, 1)[0];
              }
            }
            return null;
          };
          
          // Helper function to find component by ID in nested structure
          const findComponentById = (items: ComponentData[], id: string): ComponentData | null => {
            for (const item of items) {
              if (item.id === id) return item;
              if (item.children) {
                const found = findComponentById(item.children, id);
                if (found) return found;
              }
            }
            return null;
          };
          
          // Helper function to insert component at target position
          const insertComponent = (items: ComponentData[], comp: ComponentData, index: number, parentId?: string) => {
            if (parentId) {
              // Insert into parent's children
              const parent = findComponentById(items, parentId);
              if (parent) {
                if (!parent.children) parent.children = [];
                parent.children.splice(index, 0, { ...comp, children: comp.children || [] });
              }
            } else {
              // Insert at root level
              items.splice(index, 0, { ...comp, children: comp.children || [] });
            }
          };
          
          let componentToMove = component;
          
          // If moving existing component, remove it first
          if (componentId) {
            const removed = removeComponent(content, componentId, sourceParentId);
            if (removed) {
              componentToMove = removed;
            }
          }
          
          // Insert component at target position
          insertComponent(content, componentToMove, targetIndex, parentId);
          
          // Update the page
          page.layoutData = {
            ...page.layoutData,
            content,
            root: page.layoutData?.root || {}
          };
          pages[pageIndex] = page;
          
          return { ...state, pages };
        });
      },
    }),
    {
      name: 'frontbase-builder-storage',
    }
  )
);