import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { apiService } from '@/services/api';

export interface ComponentData {
  id: string;
  type: string;
  props: Record<string, any>;
  styles?: Record<string, any>;
  children?: ComponentData[];
}

export interface Page {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  title?: string;
  description?: string;
  keywords?: string;
  isPublic: boolean;
  isHomepage: boolean;
  layout_data: ComponentData[];
  created_at: string;
  updated_at: string;
}

export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  user_id: number;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AppVariable {
  id: string;
  project_id: string;
  name: string;
  type: 'static' | 'calculated';
  value?: string;
  created_at: string;
  updated_at: string;
}

interface BuilderState {
  // Project and Pages
  project: ProjectConfig | null;
  projects: ProjectConfig[];
  pages: Page[];
  currentPageId: string | null;
  
  // Builder state
  selectedComponentId: string | null;
  isPreviewMode: boolean;
  draggedComponentId: string | null;
  
  // App variables
  appVariables: AppVariable[];
  
  // Legacy compatibility
  isSupabaseConnected: boolean;
  
  // Loading states
  isLoading: boolean;
  
  // Actions
  loadProjects: () => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;
  createProject: (project: Omit<ProjectConfig, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateProject: (projectId: string, updates: Partial<ProjectConfig>) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  setProject: (project: ProjectConfig) => void;
  
  createPage: (page: Omit<Page, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updatePage: (pageId: string, updates: Partial<Page>) => Promise<void>;
  deletePage: (pageId: string) => Promise<void>;
  setCurrentPageId: (pageId: string) => void;
  setCurrentPage: (pageId: string) => void;
  
  setSelectedComponentId: (componentId: string | null) => void;
  setPreviewMode: (isPreview: boolean) => void;
  setDraggedComponentId: (componentId: string | null) => void;
  
  loadAppVariables: (projectId: string) => Promise<void>;
  addAppVariable: (variable: Omit<AppVariable, 'id' | 'project_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateAppVariable: (variableId: string, updates: Partial<AppVariable>) => void;
  deleteAppVariable: (projectId: string, variableId: string) => Promise<void>;
  
  moveComponent: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  updatePageLayout: (pageId: string, layoutData: ComponentData[]) => Promise<void>;
}

export const useBuilderStore = create<BuilderState>()((set, get) => ({
  // Initial state
  project: null,
  projects: [],
  pages: [],
  currentPageId: null,
  selectedComponentId: null,
  isPreviewMode: false,
  draggedComponentId: null,
  appVariables: [],
  isSupabaseConnected: false,
  isLoading: false,

  // Actions
  loadProjects: async () => {
    set({ isLoading: true });
    try {
      const projects = await apiService.getProjects();
      set({ projects, isLoading: false });
    } catch (error) {
      console.error('Failed to load projects:', error);
      set({ isLoading: false });
    }
  },

  loadProject: async (projectId: string) => {
    set({ isLoading: true });
    try {
      const [project, pages] = await Promise.all([
        apiService.getProject(projectId),
        apiService.getProjectPages(projectId)
      ]);
      
      const homepage = pages.find(p => p.isHomepage) || pages[0];
      
      set({ 
        project, 
        pages, 
        currentPageId: homepage?.id || null, 
        isLoading: false 
      });

      // Load app variables
      if (projectId) {
        get().loadAppVariables(projectId);
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      set({ isLoading: false });
    }
  },

  createProject: async (projectData) => {
    set({ isLoading: true });
    try {
      const project = await apiService.createProject(projectData);
      const state = get();
      set({ 
        project,
        projects: [...state.projects, project],
        isLoading: false 
      });
      
      // Load the project to get the default page
      await get().loadProject(project.id);
    } catch (error) {
      console.error('Failed to create project:', error);
      set({ isLoading: false });
    }
  },

  updateProject: async (projectId, updates) => {
    try {
      await apiService.updateProject(projectId, updates);
      const state = get();
      set({
        project: state.project?.id === projectId ? { ...state.project, ...updates } : state.project,
        projects: state.projects.map(p => p.id === projectId ? { ...p, ...updates } : p)
      });
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  },

  deleteProject: async (projectId) => {
    try {
      await apiService.deleteProject(projectId);
      const state = get();
      set({
        projects: state.projects.filter(p => p.id !== projectId),
        project: state.project?.id === projectId ? null : state.project,
        pages: state.project?.id === projectId ? [] : state.pages,
        currentPageId: state.project?.id === projectId ? null : state.currentPageId
      });
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  },
  
  setProject: (project) => set({ project }),
  
  createPage: async (pageData) => {
    try {
      const page = await apiService.createPage(pageData);
      const state = get();
      set({ pages: [...state.pages, page] });
    } catch (error) {
      console.error('Failed to create page:', error);
    }
  },
  
  updatePage: async (pageId, updates) => {
    try {
      await apiService.updatePage(pageId, updates);
      const state = get();
      set({
        pages: state.pages.map((page) =>
          page.id === pageId ? { ...page, ...updates } : page
        )
      });
    } catch (error) {
      console.error('Failed to update page:', error);
    }
  },
  
  deletePage: async (pageId) => {
    try {
      await apiService.deletePage(pageId);
      const state = get();
      set({
        pages: state.pages.filter((page) => page.id !== pageId),
        currentPageId: state.currentPageId === pageId ? state.pages.find(p => p.id !== pageId)?.id || null : state.currentPageId
      });
    } catch (error) {
      console.error('Failed to delete page:', error);
    }
  },
  
  setCurrentPageId: (pageId) => set({ currentPageId: pageId }),
  
  setCurrentPage: (pageId) => set({ currentPageId: pageId }),
  
  setSelectedComponentId: (componentId) => set({ selectedComponentId: componentId }),
  
  setPreviewMode: (isPreview) => set({ isPreviewMode: isPreview }),

  setDraggedComponentId: (componentId) => set({ draggedComponentId: componentId }),

  loadAppVariables: async (projectId) => {
    try {
      const variables = await apiService.getProjectVariables(projectId);
      set({ appVariables: variables });
    } catch (error) {
      console.error('Failed to load app variables:', error);
    }
  },
  
  addAppVariable: async (variable) => {
    try {
      const state = get();
      if (!state.project) return;
      
      const newVariable = await apiService.createVariable(state.project.id, variable);
      set({ appVariables: [...state.appVariables, newVariable] });
    } catch (error) {
      console.error('Failed to add app variable:', error);
    }
  },

  updateAppVariable: (variableId, updates) => {
    const state = get();
    set({
      appVariables: state.appVariables.map((variable) =>
        variable.id === variableId ? { ...variable, ...updates } : variable
      )
    });
  },
  
  deleteAppVariable: async (projectId, variableId) => {
    try {
      await apiService.deleteVariable(projectId, variableId);
      const state = get();
      set({
        appVariables: state.appVariables.filter((variable) => variable.id !== variableId)
      });
    } catch (error) {
      console.error('Failed to delete app variable:', error);
    }
  },

  updatePageLayout: async (pageId, layoutData) => {
    try {
      await apiService.updatePage(pageId, { layout_data: layoutData });
      const state = get();
      set({
        pages: state.pages.map((page) =>
          page.id === pageId ? { ...page, layout_data: layoutData } : page
        )
      });
    } catch (error) {
      console.error('Failed to update page layout:', error);
    }
  },

  moveComponent: (draggedId, targetId, position) => {
    const state = get();
    const currentPage = state.pages.find(p => p.id === state.currentPageId);
    if (!currentPage) return;

    const moveComponentInTree = (
      components: ComponentData[],
      draggedId: string,
      targetId: string,
      position: 'before' | 'after' | 'inside'
    ): ComponentData[] => {
      // Find and remove the dragged component
      let draggedComponent: ComponentData | null = null;
      
      const removeDraggedComponent = (items: ComponentData[]): ComponentData[] => {
        return items.reduce((acc: ComponentData[], item) => {
          if (item.id === draggedId) {
            draggedComponent = item;
            return acc;
          }
          return [...acc, {
            ...item,
            children: item.children ? removeDraggedComponent(item.children) : []
          }];
        }, []);
      };

      let newComponents = removeDraggedComponent(components);

      if (!draggedComponent) return components;

      // Insert the dragged component at the new position
      const insertComponent = (items: ComponentData[]): ComponentData[] => {
        return items.reduce((acc: ComponentData[], item, index) => {
          if (item.id === targetId) {
            if (position === 'before') {
              return [...acc, draggedComponent, item];
            } else if (position === 'after') {
              return [...acc, item, draggedComponent];
            } else if (position === 'inside') {
              return [...acc, {
                ...item,
                children: [...(item.children || []), draggedComponent]
              }];
            }
          }
          
          return [...acc, {
            ...item,
            children: item.children ? insertComponent(item.children) : []
          }];
        }, []);
      };

      return insertComponent(newComponents);
    };

    const newLayoutData = moveComponentInTree(currentPage.layout_data, draggedId, targetId, position);
    
    // Update local state immediately for responsive UI
    set((state) => ({
      pages: state.pages.map((page) =>
        page.id === state.currentPageId ? { ...page, layout_data: newLayoutData } : page
      )
    }));

    // Save to backend
    get().updatePageLayout(currentPage.id, newLayoutData);
  }
}));