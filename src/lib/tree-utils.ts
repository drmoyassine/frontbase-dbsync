import { ComponentData } from '@/stores/builder';

/**
 * Recursively finds a component by ID in a list of components.
 */
export const findComponent = (components: ComponentData[], id: string): ComponentData | null => {
    for (const component of components) {
        if (component.id === id) return component;
        if (component.children) {
            const found = findComponent(component.children, id);
            if (found) return found;
        }
    }
    return null;
};

/**
 * Recursively removes a component by ID from a list of components.
 */
export const removeComponentFromTree = (items: ComponentData[], id: string): ComponentData[] => {
    return items.filter(item => {
        if (item.id === id) return false;
        if (item.children) {
            item.children = removeComponentFromTree(item.children, id);
        }
        return true;
    });
};

/**
 * Recursively inserts a component into the tree at a specific index.
 */
export const insertComponentIntoTree = (
    items: ComponentData[],
    targetId: string | undefined,
    comp: ComponentData,
    index: number
): ComponentData[] => {
    if (!targetId) {
        // Insert at root level
        const newItems = [...items];
        newItems.splice(index, 0, comp);
        return newItems;
    }

    return items.map(item => {
        if (item.id === targetId) {
            const newChildren = item.children ? [...item.children] : [];
            newChildren.splice(index, 0, comp);
            return { ...item, children: newChildren };
        }
        if (item.children) {
            return { ...item, children: insertComponentIntoTree(item.children, targetId, comp, index) };
        }
        return item;
    });
};

/**
 * Recursively updates a component's properties in the tree.
 */
export const updateComponentInTree = (
    content: ComponentData[],
    componentId: string,
    updateFn: (comp: ComponentData) => ComponentData
): ComponentData[] => {
    return content.map(comp => {
        if (comp.id === componentId) {
            return updateFn(comp);
        }
        if (comp.children) {
            return { ...comp, children: updateComponentInTree(comp.children, componentId, updateFn) };
        }
        return comp;
    });
};
