import { StateCreator } from 'zustand';
import { ProjectConfig } from '@/types/builder';
import { BuilderState } from '../builder';

export interface ProjectSlice {
    project: ProjectConfig | null;
    setProject: (project: ProjectConfig) => void;
    updateProject: (updates: Partial<ProjectConfig>) => void;
}

export const createProjectSlice: StateCreator<BuilderState, [], [], ProjectSlice> = (set) => ({
    project: null,
    setProject: (project) => set({ project }),
    updateProject: (updates) => set((state) => ({
        project: state.project ? { ...state.project, ...updates, updatedAt: new Date().toISOString() } : null
    })),
});
