import { StateCreator } from 'zustand';
import { ComponentData } from '@/types/builder';
import { BuilderState } from '../builder';
import { toast } from '@/hooks/use-toast';
import {
    removeComponentFromTree,
    insertComponentIntoTree,
    updateComponentInTree
} from '@/lib/tree-utils';

export interface BuilderSlice {
    selectedComponentId: string | null;
    draggedComponentId: string | null;
    editingComponentId: string | null;

    setSelectedComponentId: (id: string | null) => void;
    setDraggedComponentId: (componentId: string | null) => void;
    setEditingComponentId: (id: string | null) => void;

    moveComponent: (pageId: string, componentId: string | null, component: ComponentData, targetIndex: number, parentId?: string, sourceParentId?: string) => void;
    updateComponentText: (componentId: string, textProperty: string, text: string) => void;
    updateComponent: (componentId: string, propsUpdates: Record<string, any>) => void;
    removeComponent: (componentId: string) => void;
    deleteSelectedComponent: () => void;
}

export const createBuilderSlice: StateCreator<BuilderState, [], [], BuilderSlice> = (set, get) => ({
    selectedComponentId: null,
    draggedComponentId: null,
    editingComponentId: null,

    setSelectedComponentId: (id) => set({ selectedComponentId: id }),
    setDraggedComponentId: (id) => set({ draggedComponentId: id }),
    setEditingComponentId: (id) => set({ editingComponentId: id }),

    moveComponent: (pageId, componentId, component, targetIndex, parentId, sourceParentId) => {
        set((state) => {
            const pageIndex = state.pages.findIndex(p => p.id === pageId);
            if (pageIndex === -1) return state;

            const newPages = [...state.pages];
            const page = { ...newPages[pageIndex] };

            let content = page.layoutData?.content || [];

            if (componentId) {
                content = removeComponentFromTree(content, componentId);
            }

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
});
