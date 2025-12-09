import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { ComponentWithStyles } from '@/types/styles';
import { pageAPI } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import {
  removeComponentFromTree,
  insertComponentIntoTree,
  updateComponentInTree
} from '@/lib/tree-utils';

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
  deletedAt?: string | null;
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

  // Responsive state
  currentViewport: 'mobile' | 'tablet' | 'desktop';
  zoomLevel: number;
  showDeviceFrame: boolean;

  // Variables
  appVariables: AppVariable[];

  // Supabase connection
  isSupabaseConnected: boolean;
  supabaseTables: any[];
  isInitialized: boolean;

  // Actions
  setProject: (project: ProjectConfig) => void;
  updateProject: (updates: Partial<ProjectConfig>) => void;

  createPage: (page: Omit<Page, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updatePage: (id: string, updates: Partial<Page>) => void;
  deletePage: (id: string) => Promise<void>;
  restorePage: (id: string) => Promise<void>;
  permanentDeletePage: (id: string) => Promise<void>;
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
  updateComponent: (componentId: string, propsUpdates: Record<string, any>) => void;
  removeComponent: (componentId: string) => void;

  // Responsive actions
  setCurrentViewport: (viewport: 'mobile' | 'tablet' | 'desktop') => void;
  setZoomLevel: (zoom: number) => void;
  setShowDeviceFrame: (show: boolean) => void;

  // New actions for database integration
  savePageToDatabase: (pageId: string) => Promise<void>;
  publishPage: (pageId: string) => Promise<void>;
  togglePageVisibility: (pageId: string) => Promise<void>;
  deleteSelectedComponent: () => void;
  loadPagesFromDatabase: (includeDeleted?: boolean) => Promise<void>;
  loadVariablesFromDatabase: () => Promise<void>;
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

      // Responsive state
      currentViewport: 'desktop',
      zoomLevel: 100,
      showDeviceFrame: true,

      appVariables: [],
      isSupabaseConnected: false,
      supabaseTables: [],
      isInitialized: false, // Track if initial data load is complete

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

      deletePage: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
          const { pageAPI } = await import('@/lib/api');
          const result = await pageAPI.deletePage(id);

          if (!result.success) {
            throw new Error(result.error || 'Failed to delete page');
          }

          // Remove from local state
          set((state) => ({
            pages: state.pages.filter(page => page.id !== id),
            currentPageId: state.currentPageId === id ? null : state.currentPageId
          }));

          toast({
            title: "Page moved to trash",
            description: "Page has been moved to trash successfully"
          });
        } catch (error) {
          toast({
            title: "Error deleting page",
            description: error instanceof Error ? error.message : "Failed to delete page",
            variant: "destructive"
          });
        } finally {
          setSaving(false);
        }
      },

      restorePage: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
          const { pageAPI } = await import('@/lib/api');
          const result = await pageAPI.restorePage(id);

          if (!result.success) {
            throw new Error(result.error || 'Failed to restore page');
          }

          // Reload pages to get the restored page back in the list
          // or we could manually update the local state if we had the full page object
          await get().loadPagesFromDatabase(true);

          toast({
            title: "Page restored",
            description: "Page has been restored successfully"
          });
        } catch (error) {
          toast({
            title: "Error restoring page",
            description: error instanceof Error ? error.message : "Failed to restore page",
            variant: "destructive"
          });
        } finally {
          setSaving(false);
        }
      },

      permanentDeletePage: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
          const { pageAPI } = await import('@/lib/api');
          const result = await pageAPI.permanentDeletePage(id);

          if (!result.success) {
            throw new Error(result.error || 'Failed to permanently delete page');
          }

          // Remove from local state
          set((state) => ({
            pages: state.pages.filter(page => page.id !== id),
            currentPageId: state.currentPageId === id ? null : state.currentPageId
          }));

          toast({
            title: "Page permanently deleted",
            description: "Page has been permanently deleted"
          });
        } catch (error) {
          toast({
            title: "Error deleting page",
            description: error instanceof Error ? error.message : "Failed to permanently delete page",
            variant: "destructive"
          });
        } finally {
          setSaving(false);
        }
      },

      setCurrentPage: (id) => set({ currentPageId: id }),
      setCurrentPageId: (id) => set({ currentPageId: id }),
      setSelectedComponentId: (id) => set({ selectedComponentId: id }),
      setDraggedComponentId: (id) => set({ draggedComponentId: id }),
      setEditingComponentId: (id) => set({ editingComponentId: id }),
      setPreviewMode: (isPreview) => set({ isPreviewMode: isPreview }),

      setShowDeviceFrame: (show: boolean) => set({ showDeviceFrame: show }),
      setCurrentViewport: (viewport) => set({ currentViewport: viewport }),
      setZoomLevel: (zoom) => set({ zoomLevel: zoom }),

      setSupabaseConnection: (connected, tables) => set({ isSupabaseConnected: connected, supabaseTables: tables || [] }),

      moveComponent: (pageId, componentId, component, targetIndex, parentId, sourceParentId) => {
        set((state) => {
          const pageIndex = state.pages.findIndex(p => p.id === pageId);
          if (pageIndex === -1) return state;

          const newPages = [...state.pages];
          const page = { ...newPages[pageIndex] };

          let content = page.layoutData?.content || [];

          // If moving an existing component (componentId is provided), remove it first
          if (componentId) {
            content = removeComponentFromTree(content, componentId);
          }

          // Insert the component at the new location
          content = insertComponentIntoTree(content, parentId, component, targetIndex);

          page.layoutData = {
            ...page.layoutData,
            content
          };

          newPages[pageIndex] = page;

          return {
            ...state,
            pages: newPages,
            hasUnsavedChanges: true
          };
        });
      },

      updateComponentText: (componentId: string, textProperty: string, text: string) => {
        set((state) => {
          const { pages, currentPageId } = state;
          if (!currentPageId) return state;

          const pageIndex = pages.findIndex(p => p.id === currentPageId);
          if (pageIndex === -1) return state;

          const page = { ...pages[pageIndex] };

          if (page.layoutData?.content) {
            page.layoutData.content = updateComponentInTree(
              page.layoutData.content,
              componentId,
              (comp) => ({
                ...comp,
                props: {
                  ...comp.props,
                  [textProperty]: text
                }
              })
            );
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

      updateComponent: (componentId: string, propsUpdates: Record<string, any>) => {
        set((state) => {
          const { pages, currentPageId } = state;
          if (!currentPageId) return state;

          const pageIndex = pages.findIndex(p => p.id === currentPageId);
          if (pageIndex === -1) return state;

          const page = { ...pages[pageIndex] };

          if (page.layoutData?.content) {
            page.layoutData.content = updateComponentInTree(
              page.layoutData.content,
              componentId,
              (comp) => ({ ...comp, props: { ...comp.props, ...propsUpdates } })
            );
          }

          const newPages = [...state.pages];
          newPages[pageIndex] = page;

          return {
            ...state,
            pages: newPages,
            hasUnsavedChanges: true
          };
        });
      },

      removeComponent: (componentId: string) => {
        set((state) => {
          const { pages, currentPageId } = state;
          if (!currentPageId) return state;

          const pageIndex = pages.findIndex(p => p.id === currentPageId);
          if (pageIndex === -1) return state;

          const page = { ...pages[pageIndex] };

          if (page.layoutData?.content) {
            page.layoutData.content = removeComponentFromTree(page.layoutData.content, componentId);
          }

          const newPages = [...state.pages];
          newPages[pageIndex] = page;

          return {
            ...state,
            pages: newPages,
            selectedComponentId: state.selectedComponentId === componentId ? null : state.selectedComponentId,
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

          // Create a sanitized copy of the page to send to the API
          // We strictly remove layout_data (snake_case) to prevent sending stale data
          // and ensure only the active layoutData (camelCase) is sent.
          const { layout_data, ...sanitizedPage } = page as any;

          // Explicitly ensure layoutData is the current state
          // (This handles the mixed mutable/immutable state patterns in the store)
          if (page.layoutData) {
            sanitizedPage.layoutData = page.layoutData;
          }

          console.log('💾 Saving page:', {
            id: pageId,
            componentCount: page.layoutData?.content?.length || 0,
            hasLayoutData: !!sanitizedPage.layoutData
          });

          const result = await pageAPI.updatePage(pageId, sanitizedPage);

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

        set((state) => {
          const newPages = [...state.pages];
          const page = { ...newPages[pageIndex] };
          const content = page.layoutData?.content || [];

          page.layoutData = {
            ...page.layoutData,
            content: removeComponentFromTree([...content], selectedComponentId)
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

      loadPagesFromDatabase: async (includeDeleted = false) => {
        const { setLoading } = get();
        setLoading(true);
        try {
          const { pageAPI } = await import('@/lib/api');
          const result = await pageAPI.getAllPages(includeDeleted);

          if (result.success && result.data) {
            set({
              pages: result.data.data || result.data,
              hasUnsavedChanges: false,
              isInitialized: true
            });
          }
        } catch (error) {
          console.error('Failed to load pages:', error);
          toast({
            title: "Error loading pages",
            description: "Failed to load pages from database",
            variant: "destructive"
          });
          // Even on error, we mark as initialized so we don't spam loading state
          set({ isInitialized: true });
        } finally {
          setLoading(false);
        }
      },

      loadVariablesFromDatabase: async () => {
        try {
          const { variableAPI } = await import('@/lib/api');
          const result = await variableAPI.getAllVariables();

          if (result.success && result.data) {
            set({ appVariables: result.data.data || result.data });
          }
        } catch (error) {
          console.error('Failed to load variables:', error);
        }
      },

      addAppVariable: async (variableData) => {
        const { setSaving } = get();
        setSaving(true);
        try {
          const { variableAPI } = await import('@/lib/api');
          const result = await variableAPI.createVariable(variableData);

          if (result.success && result.data) {
            set((state) => ({
              appVariables: [...state.appVariables, result.data.data || result.data]
            }));
            toast({
              title: "Variable created",
              description: "App variable has been created successfully"
            });
          } else {
            throw new Error(result.error || 'Failed to create variable');
          }
        } catch (error) {
          toast({
            title: "Error creating variable",
            description: error instanceof Error ? error.message : "Failed to create variable",
            variant: "destructive"
          });
        } finally {
          setSaving(false);
        }
      },

      updateAppVariable: async (id, updates) => {
        const { setSaving } = get();
        setSaving(true);
        try {
          const { variableAPI } = await import('@/lib/api');
          const result = await variableAPI.updateVariable(id, updates);

          if (result.success && result.data) {
            const updatedVar = result.data.data || result.data;
            set((state) => ({
              appVariables: state.appVariables.map(variable =>
                variable.id === id ? updatedVar : variable
              )
            }));
            toast({
              title: "Variable updated",
              description: "App variable has been updated successfully"
            });
          } else {
            throw new Error(result.error || 'Failed to update variable');
          }
        } catch (error) {
          toast({
            title: "Error updating variable",
            description: error instanceof Error ? error.message : "Failed to update variable",
            variant: "destructive"
          });
        } finally {
          setSaving(false);
        }
      },

      deleteAppVariable: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
          const { variableAPI } = await import('@/lib/api');
          const result = await variableAPI.deleteVariable(id);

          if (result.success) {
            set((state) => ({
              appVariables: state.appVariables.filter(variable => variable.id !== id)
            }));
            toast({
              title: "Variable deleted",
              description: "App variable has been deleted successfully"
            });
          } else {
            throw new Error(result.error || 'Failed to delete variable');
          }
        } catch (error) {
          toast({
            title: "Error deleting variable",
            description: error instanceof Error ? error.message : "Failed to delete variable",
            variant: "destructive"
          });
        } finally {
          setSaving(false);
        }
      },

      setUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),

      createPageInDatabase: async (pageData) => {
        const { setSaving } = get();
        setSaving(true);

        try {
          const { pageAPI } = await import('@/lib/api');
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
      partialize: (state) => ({
        project: state.project,
        // Don't persist pages or variables in local storage as we load from DB
        // pages: state.pages,
        // appVariables: state.appVariables
      }),
    }
  )
);
