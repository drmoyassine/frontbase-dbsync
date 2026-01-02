import React from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { StylesPanel } from '@/components/styles/StylesPanel';
import type { StylesData } from '@/lib/styles/types';

export const StylingPanel: React.FC = () => {
  const {
    selectedComponentId,
    currentPageId,
    pages,
    updatePage,
    setSelectedComponentId
  } = useBuilderStore();

  const currentPage = pages.find(page => page.id === currentPageId);

  // Recursive function to find component by ID
  const findComponentById = (components: any[], id: string): any => {
    for (const comp of components) {
      if (comp.id === id) return comp;
      if (comp.children) {
        const found = findComponentById(comp.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedComponent = currentPage?.layoutData?.content ?
    findComponentById(currentPage.layoutData.content, selectedComponentId || '') : null;

  if (!selectedComponent) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-muted-foreground text-sm">No component selected</div>
          <div className="text-xs text-muted-foreground mt-1">
            Select a component to edit its styles
          </div>
        </div>
      </div>
    );
  }

  // Recursive function to update component in nested structure
  const updateComponentInContent = (components: any[], componentId: string, updates: any): any[] => {
    return components.map(comp => {
      if (comp.id === componentId) {
        return { ...comp, ...updates };
      }
      if (comp.children) {
        return {
          ...comp,
          children: updateComponentInContent(comp.children, componentId, updates)
        };
      }
      return comp;
    });
  };

  const deleteComponent = () => {
    if (!currentPage) return;

    const removeComponentFromContent = (components: any[], componentId: string): any[] => {
      return components.filter(comp => {
        if (comp.id === componentId) return false;
        if (comp.children) {
          comp.children = removeComponentFromContent(comp.children, componentId);
        }
        return true;
      });
    };

    const updatedContent = removeComponentFromContent(currentPage.layoutData.content, selectedComponentId!);

    updatePage(currentPage.id, {
      layoutData: {
        ...currentPage.layoutData,
        content: updatedContent
      }
    });

    setSelectedComponentId(null);
  };

  // Get component styles in StylesData format (or create default)
  const getComponentStyles = (): StylesData => {
    if (selectedComponent.stylesData) {
      return selectedComponent.stylesData;
    }
    // Return empty styles if no stylesData exists
    return {
      activeProperties: [],
      values: {},
      stylingMode: 'visual'
    };
  };

  // Update component with new StylesData
  const handleStylesUpdate = (newStyles: StylesData) => {
    if (!currentPage) return;

    const updatedContent = updateComponentInContent(
      currentPage.layoutData.content,
      selectedComponentId!,
      {
        stylesData: newStyles
      }
    );

    updatePage(currentPage.id, {
      layoutData: {
        ...currentPage.layoutData,
        content: updatedContent
      }
    });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">{selectedComponent.type}</h3>
            <p className="text-xs text-muted-foreground">Component Styling</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={deleteComponent}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-auto p-4">
        <StylesPanel
          styles={getComponentStyles()}
          onUpdate={handleStylesUpdate}
          title=""
        />
      </div>
    </div>
  );
};
