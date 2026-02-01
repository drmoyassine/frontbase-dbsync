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
    copiedComponent: ComponentData | null;
    focusedField: { componentId: string; fieldName: string } | null;

    setSelectedComponentId: (id: string | null) => void;
    setDraggedComponentId: (componentId: string | null) => void;
    setEditingComponentId: (id: string | null) => void;
    setFocusedField: (field: { componentId: string; fieldName: string } | null) => void;

    moveComponent: (pageId: string, componentId: string | null, component: ComponentData, targetIndex: number, parentId?: string, sourceParentId?: string) => void;
    updateComponentText: (componentId: string, textProperty: string, text: string) => void;
    updateComponent: (componentId: string, propsUpdates: Record<string, any>) => void;
    removeComponent: (componentId: string) => void;
    deleteSelectedComponent: () => void;
    copyComponent: (componentId: string) => void;
    pasteComponent: () => void;
    duplicateComponent: (componentId: string) => void;
}

export const createBuilderSlice: StateCreator<BuilderState, [], [], BuilderSlice> = (set, get) => ({
    selectedComponentId: null,
    draggedComponentId: null,
    editingComponentId: null,
    copiedComponent: null,
    focusedField: null,

    setSelectedComponentId: (id) => set({ selectedComponentId: id }),
    setDraggedComponentId: (id) => set({ draggedComponentId: id }),
    setEditingComponentId: (id) => set({ editingComponentId: id }),
    setFocusedField: (field) => set({ focusedField: field }),

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

    copyComponent: (componentId: string) => {
        const { currentPageId, pages } = get();
        if (!currentPageId) return;

        const page = pages.find(p => p.id === currentPageId);
        if (!page?.layoutData?.content) return;

        // Find component recursively
        const findComponent = (components: ComponentData[], id: string): ComponentData | null => {
            for (const comp of components) {
                if (comp.id === id) return comp;
                if (comp.children) {
                    const found = findComponent(comp.children, id);
                    if (found) return found;
                }
            }
            return null;
        };

        const component = findComponent(page.layoutData.content, componentId);
        if (component) {
            set({ copiedComponent: JSON.parse(JSON.stringify(component)) });
            toast({
                title: "Component copied",
                description: "Press Ctrl/Cmd+V to paste"
            });
        }
    },

    pasteComponent: () => {
        const { copiedComponent, currentPageId, pages, selectedComponentId } = get();
        if (!copiedComponent || !currentPageId) return;

        const pageIndex = pages.findIndex(p => p.id === currentPageId);
        if (pageIndex === -1) return;

        const page = pages[pageIndex];
        const content = page.layoutData?.content || [];

        // Generate new ID for pasted component
        const generateNewId = () => `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const cloneWithNewIds = (comp: ComponentData): ComponentData => {
            const newComp = { ...comp, id: generateNewId() };
            if (newComp.children) {
                newComp.children = newComp.children.map(cloneWithNewIds);
            }
            return newComp;
        };

        const newComponent = cloneWithNewIds(copiedComponent);

        // Find the selected component and its parent to paste into the same container
        const findComponentWithParent = (
            components: ComponentData[],
            id: string,
            parent: ComponentData | null = null
        ): { component: ComponentData; parent: ComponentData | null; index: number } | null => {
            for (let i = 0; i < components.length; i++) {
                const comp = components[i];
                if (comp.id === id) return { component: comp, parent, index: i };
                if (comp.children) {
                    const found = findComponentWithParent(comp.children, id, comp);
                    if (found) return found;
                }
            }
            return null;
        };

        set((state) => {
            const newPages = [...state.pages];
            const newPage = { ...newPages[pageIndex] };
            const newContent = JSON.parse(JSON.stringify(newPage.layoutData?.content || []));

            // If there's a selected component, try to paste into its parent container
            if (selectedComponentId) {
                const result = findComponentWithParent(newContent, selectedComponentId);
                if (result && result.parent) {
                    // Find parent in new structure and add after selected component
                    const findAndInsert = (components: ComponentData[]): boolean => {
                        for (const comp of components) {
                            if (comp.id === result.parent!.id && comp.children) {
                                comp.children.splice(result.index + 1, 0, newComponent);
                                return true;
                            }
                            if (comp.children && findAndInsert(comp.children)) {
                                return true;
                            }
                        }
                        return false;
                    };
                    findAndInsert(newContent);
                } else if (result) {
                    // Selected component is at root level, insert after it
                    newContent.splice(result.index + 1, 0, newComponent);
                } else {
                    // No selection found, add to end
                    newContent.push(newComponent);
                }
            } else {
                // No selection, add at root level
                newContent.push(newComponent);
            }

            newPage.layoutData = { ...newPage.layoutData, content: newContent };
            newPages[pageIndex] = newPage;

            return {
                ...state,
                pages: newPages,
                selectedComponentId: newComponent.id,
                hasUnsavedChanges: true
            };
        });

        toast({
            title: "Component pasted",
            description: "Component pasted successfully"
        });
    },

    duplicateComponent: (componentId: string) => {
        const { currentPageId, pages } = get();
        if (!currentPageId) return;

        const pageIndex = pages.findIndex(p => p.id === currentPageId);
        if (pageIndex === -1) return;

        const page = pages[pageIndex];
        const content = page.layoutData?.content || [];

        // Find component and its parent
        const findComponentWithParent = (components: ComponentData[], id: string, parent: ComponentData | null = null): { component: ComponentData; parent: ComponentData | null; index: number } | null => {
            for (let i = 0; i < components.length; i++) {
                const comp = components[i];
                if (comp.id === id) return { component: comp, parent, index: i };
                if (comp.children) {
                    const found = findComponentWithParent(comp.children, id, comp);
                    if (found) return found;
                }
            }
            return null;
        };

        const result = findComponentWithParent(content, componentId);
        if (!result) return;

        // Generate new ID
        const generateNewId = () => `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const cloneWithNewIds = (comp: ComponentData): ComponentData => {
            const newComp = { ...comp, id: generateNewId() };
            if (newComp.children) {
                newComp.children = newComp.children.map(cloneWithNewIds);
            }
            return newComp;
        };

        const duplicate = cloneWithNewIds(result.component);

        set((state) => {
            const newPages = [...state.pages];
            const newPage = { ...newPages[pageIndex] };
            const newContent = [...(newPage.layoutData?.content || [])];

            // Insert duplicate after original
            if (result.parent) {
                // Find parent in new structure and add to its children
                const findAndInsert = (components: ComponentData[]): boolean => {
                    for (const comp of components) {
                        if (comp.id === result.parent!.id && comp.children) {
                            comp.children.splice(result.index + 1, 0, duplicate);
                            return true;
                        }
                        if (comp.children && findAndInsert(comp.children)) {
                            return true;
                        }
                    }
                    return false;
                };
                findAndInsert(newContent);
            } else {
                newContent.splice(result.index + 1, 0, duplicate);
            }

            newPage.layoutData = { ...newPage.layoutData, content: newContent };
            newPages[pageIndex] = newPage;

            return {
                ...state,
                pages: newPages,
                selectedComponentId: duplicate.id,
                hasUnsavedChanges: true
            };
        });

        toast({
            title: "Component duplicated",
            description: "Component duplicated successfully"
        });
    },
});
