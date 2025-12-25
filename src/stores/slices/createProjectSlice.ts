import { StateCreator } from 'zustand';
import { ProjectConfig } from '@/types/builder';
import { BuilderState } from '../builder';
import { getProject as getProjectApi, updateProject as updateProjectApi } from '../../services/project-api';

export interface ProjectSlice {
    project: ProjectConfig | null;
    isLoading: boolean;
    error: string | null;
    setProject: (project: ProjectConfig) => void;
    updateProject: (updates: Partial<ProjectConfig>) => void;
    loadProjectFromDatabase: () => Promise<void>;
    updateProjectInDatabase: (projectData: Partial<ProjectConfig>) => Promise<void>;
}

export const createProjectSlice: StateCreator<BuilderState, [], [], ProjectSlice> = (set, get) => ({
    project: null,
    isLoading: false,
    error: null,
    setProject: (project) => set({ project }),
    updateProject: (updates) => set((state) => ({
        project: state.project ? { ...state.project, ...updates, updatedAt: new Date().toISOString() } : null
    })),
    loadProjectFromDatabase: async () => {
        set({ isLoading: true, error: null });
        try {
            const project = await getProjectApi();
            set({ project: { ...project, createdAt: project.created_at, updatedAt: project.updated_at }, isLoading: false });
        } catch (error: any) {
            set({
                error: error.response?.data?.message || 'Failed to fetch project',
                isLoading: false,
            });
        }
    },
    updateProjectInDatabase: async (projectData: Partial<ProjectConfig>) => {
        set({ isLoading: true, error: null });
        try {
            const updatedProject = await updateProjectApi(projectData);
            set({ project: { ...updatedProject, createdAt: updatedProject.created_at, updatedAt: updatedProject.updated_at }, isLoading: false });
        } catch (error: any) {
            set({
                error: error.response?.data?.message || 'Failed to update project',
                isLoading: false,
            });
            throw error;
        }
    },
});
