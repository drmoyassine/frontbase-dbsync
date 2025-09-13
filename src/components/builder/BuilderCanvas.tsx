import React from 'react';
import { useDrop } from 'react-dnd';
import { useBuilderStore, type Page } from '@/stores/builder';
import { DraggableComponent } from './DraggableComponent';
import { cn } from '@/lib/utils';
import { getDefaultProps } from '@/lib/componentDefaults';

interface BuilderCanvasProps {
  page: Page;
}

export const BuilderCanvas: React.FC<BuilderCanvasProps> = ({ page }) => {
  const { moveComponent, selectedComponentId, setSelectedComponentId, isPreviewMode } = useBuilderStore();
  
  const components = page.layout_data || [];
  const hasComponents = components.length > 0;

  // Empty canvas drop zone for initial component
  const [{ isOverEmpty }, dropEmpty] = useDrop({
    accept: ['component', 'existing-component', 'layer-component'],
    drop: (item: any, monitor) => {
      if (!monitor.didDrop() && !hasComponents) {
        if (item.type) {
          // New component from palette
          const newComponent = {
            id: `${Date.now()}-${Math.random()}`,
            type: item.type,
            props: getDefaultProps(item.type),
            styles: {},
            children: []
          };
          moveComponent(page.id, newComponent.id, 0);
          setSelectedComponentId(newComponent.id);
        } else if (item.id) {
          // Existing component being moved to empty canvas
          moveComponent(page.id, item.id, 0);
        }
      }
    },
    collect: (monitor) => ({
      isOverEmpty: monitor.isOver({ shallow: true }),
    }),
    canDrop: () => !hasComponents,
  });

  const handleComponentClick = (componentId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!isPreviewMode) {
      setSelectedComponentId(selectedComponentId === componentId ? null : componentId);
    }
  };

  return (
    <div 
      className={`min-h-full p-8 bg-background transition-colors relative`}
      style={{ minHeight: '400px' }}
      onClick={(e) => {
        // Deselect when clicking on empty canvas
        if (e.target === e.currentTarget && !isPreviewMode) {
          setSelectedComponentId(null);
        }
      }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Render components with integrated drop zones */}
        {page.layout_data?.map((component, index) => (
          <DraggableComponent
            key={component.id}
            component={component}
            index={index}
            pageId={page.id}
            isSelected={selectedComponentId === component.id}
            onSelect={handleComponentClick}
          />
        ))}
        
        {/* Empty canvas drop zone */}
        {!isPreviewMode && !hasComponents && (
          <div 
            ref={dropEmpty}
            className={cn(
              "text-center py-16 text-muted-foreground transition-all duration-200 rounded-lg border-2 border-dashed",
              isOverEmpty ? 'border-primary bg-primary/10' : 'border-muted hover:border-primary/50'
            )}
          >
            <p className="text-lg">Drop components here to start building</p>
            <p className="text-sm mt-2">Drag components from the left panel or reorder existing ones</p>
          </div>
        )}
      </div>
    </div>
  );
};
