import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ProjectSlice, createProjectSlice } from './slices/createProjectSlice';
import { PageSlice, createPageSlice } from './slices/createPageSlice';
import { UISlice, createUISlice } from './slices/createUISlice';
import { VariablesSlice, createVariablesSlice } from './slices/createVariablesSlice';
import { BuilderSlice, createBuilderSlice } from './slices/createBuilderSlice';

// Re-export types for backward compatibility
export * from '@/types/builder';

export type BuilderState = ProjectSlice & PageSlice & UISlice & VariablesSlice & BuilderSlice;

export const useBuilderStore = create<BuilderState>()(
  persist(
    (...a) => ({
      ...createProjectSlice(...a),
      ...createPageSlice(...a),
      ...createUISlice(...a),
      ...createVariablesSlice(...a),
      ...createBuilderSlice(...a),
    }),
    {
      name: 'frontbase-builder-storage',
      partialize: (state) => ({
        project: state.project,
        // Don't persist pages or variables in local storage as we load from DB
      }),
    }
  )
);
