import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { ComponentWithStyles } from '@/types/styles';
import { pageAPI } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

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
  draggedComponentId: string | null;
  isSaving: boolean;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  editingComponentId: string | null;
  
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
  setDraggedComponentId: (componentId: string | null) => void;
  setEditingComponentId: (id: string | null) => void;
  updateComponentText: (componentId: string, textProperty: string, text: string) => void;
  
  // New actions for database integration
  savePageToDatabase: (pageId: string) => Promise<void>;
  publishPage: (pageId: string) => Promise<void>;
  togglePageVisibility: (pageId: string) => Promise<void>;
  deleteSelectedComponent: () => void;
  loadPagesFromDatabase: () => Promise<void>;
  setSaving: (saving: boolean) => void;
  setLoading: (loading: boolean) => void;
  setUnsavedChanges: (hasChanges: boolean) => void;
  createPageInDatabase: (pageData: Omit<Page, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string | null>;
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
      draggedComponentId: null,
      isSaving: false,
      isLoading: false,
      hasUnsavedChanges: false,
      editingComponentId: null,
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
        ),
        hasUnsavedChanges: true
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
          
          // If moving existing component, remove it first and adjust target index
          if (componentId) {
            const removed = removeComponent(content, componentId, sourceParentId);
            if (removed) {
              componentToMove = removed;
              
              // Adjust target index if moving within same parent and target is after source
              if (!parentId && !sourceParentId) {
                // Both at root level - find original index
                const originalIndex = content.findIndex(c => c.id === componentId);
                if (originalIndex !== -1 && originalIndex < targetIndex) {
                  // Component was removed from before target position, adjust index down
                  targetIndex = Math.max(0, targetIndex - 1);
                }
              }
            }
          }
          
          // Prevent dropping component on itself at same position
          if (componentId && componentId === componentToMove.id) {
            const currentIndex = content.findIndex(c => c.id === componentId);
            if (currentIndex === targetIndex) {
              return state;
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
          
          return { ...state, pages, hasUnsavedChanges: true };
        });
      },

      setDraggedComponentId: (componentId) => set({ draggedComponentId: componentId }),
      
      setEditingComponentId: (id) => set({ editingComponentId: id }),

      updateComponentText: (componentId: string, textProperty: string, text: string) => {
        set((state) => {
          const { pages, currentPageId } = state;
          if (!currentPageId) return state;

          const pageIndex = pages.findIndex(p => p.id === currentPageId);
          if (pageIndex === -1) return state;

          const page = { ...pages[pageIndex] };
          
          // Helper function to update component text in nested structure
          const updateComponentInContent = (content: ComponentData[]): ComponentData[] => {
            return content.map(component => {
              if (component.id === componentId) {
                return {
                  ...component,
                  props: {
                    ...component.props,
                    [textProperty]: text
                  }
                };
              }
              if (component.children) {
                return {
                  ...component,
                  children: updateComponentInContent(component.children)
                };
              }
              return component;
            });
          };

          if (page.layoutData?.content) {
            page.layoutData.content = updateComponentInContent(page.layoutData.content);
          }

          const updatedPages = [...state.pages];
          updatedPages[pageIndex] = page;
          
          return { 
            ...state, 
            pages: updatedPages, 
            hasUnsavedChanges: true 
          };
        });
      },

      // New database integration actions
      setSaving: (saving) => set({ isSaving: saving }),
      setLoading: (loading) => set({ isLoading: loading }),

      savePageToDatabase: async (pageId: string) => {
        const { pages, setSaving, setUnsavedChanges } = get();
        const page = pages.find(p => p.id === pageId);
        if (!page) return;

        setSaving(true);
        try {
          const { pageAPI } = await import('@/lib/api');
          const result = await pageAPI.updatePage(pageId, page);
          
          if (!result.success) {
            throw new Error(result.error || 'Failed to save page');
          }
          
          // Reset unsaved changes flag on successful save
          setUnsavedChanges(false);
          
          toast({
            title: "Page saved",
            description: "Page has been saved successfully"
          });
        } catch (error) {
          toast({
            title: "Error saving page",
            description: error instanceof Error ? error.message : "Failed to save page",
            variant: "destructive"
          });
        } finally {
          setSaving(false);
        }
      },

      publishPage: async (pageId: string) => {
        const { pages, updatePage, setSaving, setUnsavedChanges } = get();
        const page = pages.find(p => p.id === pageId);
        if (!page) return;

        setSaving(true);
        try {
          updatePage(pageId, { isPublic: true });
          
          const { pageAPI } = await import('@/lib/api');
          const result = await pageAPI.updatePage(pageId, { ...page, isPublic: true });
          
          if (!result.success) {
            throw new Error(result.error || 'Failed to publish page');
          }
          
          setUnsavedChanges(false);
          
          toast({
            title: "Page published",
            description: "Page has been published successfully"
          });
        } catch (error) {
          toast({
            title: "Error publishing page",
            description: error instanceof Error ? error.message : "Failed to publish page",
            variant: "destructive"
          });
        } finally {
          setSaving(false);
        }
      },

      togglePageVisibility: async (pageId: string) => {
        const { pages, updatePage, setSaving } = get();
        const page = pages.find(p => p.id === pageId);
        if (!page) return;

        setSaving(true);
        try {
          const newVisibility = !page.isPublic;
          updatePage(pageId, { isPublic: newVisibility });
          
          const { pageAPI } = await import('@/lib/api');
          const result = await pageAPI.updatePage(pageId, { ...page, isPublic: newVisibility });
          
          if (!result.success) {
            throw new Error(result.error || 'Failed to update page visibility');
          }
          
          toast({
            title: "Page updated",
            description: `Page ${newVisibility ? 'published' : 'made private'}`
          });
        } catch (error) {
          toast({
            title: "Error updating page",
            description: error instanceof Error ? error.message : "Failed to update page visibility",
            variant: "destructive"
          });
        } finally {
          setSaving(false);
        }
      },

      deleteSelectedComponent: () => {
        const { selectedComponentId, currentPageId, pages } = get();
        if (!selectedComponentId || !currentPageId) return;

        const pageIndex = pages.findIndex(p => p.id === currentPageId);
        if (pageIndex === -1) return;

        const deleteFromContent = (items: ComponentData[]): ComponentData[] => {
          return items.filter(item => {
            if (item.id === selectedComponentId) return false;
            if (item.children) {
              item.children = deleteFromContent(item.children);
            }
            return true;
          });
        };

        set((state) => {
          const newPages = [...state.pages];
          const page = { ...newPages[pageIndex] };
          const content = page.layoutData?.content || [];
          
          page.layoutData = {
            ...page.layoutData,
            content: deleteFromContent([...content])
          };
          
          newPages[pageIndex] = page;
          
          return {
            ...state,
            pages: newPages,
            selectedComponentId: null,
            hasUnsavedChanges: true
          };
        });

        toast({
          title: "Component deleted",
          description: "Component has been removed successfully"
        });
      },

      loadPagesFromDatabase: async () => {
        const { setLoading } = get();
        setLoading(true);
        
        try {
          const result = await pageAPI.getAllPages();
          
          if (result.success && result.data) {
            set({ pages: result.data.data || result.data, hasUnsavedChanges: false });
          }
        } catch (error) {
          console.error('Failed to load pages from database:', error);
          toast({
            title: "Error loading pages",
            description: error instanceof Error ? error.message : "Failed to load pages from database",
            variant: "destructive"
          });
        } finally {
          setLoading(false);
        }
      },

      setUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),

      createPageInDatabase: async (pageData) => {
        const { setSaving } = get();
        setSaving(true);
        
        try {
          const result = await pageAPI.createPage(pageData);
          
          if (result.success && result.data) {
            const newPage = result.data.data || result.data;
            set((state) => ({
              pages: [...state.pages, newPage],
              hasUnsavedChanges: false
            }));
            
            toast({
              title: "Page created",
              description: "Page has been created successfully"
            });
            
            return newPage.id;
          } else {
            throw new Error(result.error || 'Failed to create page');
          }
        } catch (error) {
          toast({
            title: "Error creating page",
            description: error instanceof Error ? error.message : "Failed to create page",
            variant: "destructive"
          });
          return null;
        } finally {
          setSaving(false);
        }
      },
    }),
    {
      name: 'frontbase-builder-storage',
    }
  )
);