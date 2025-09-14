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
  const { 
    moveComponent, 
    selectedComponentId, 
    setSelectedComponentId, 
    isPreviewMode,
    currentViewport,
    zoomLevel,
    showDeviceFrame
  } = useBuilderStore();
  
  const components = page.layoutData?.content || [];
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
          moveComponent(page.id, null, newComponent, 0);
          setSelectedComponentId(newComponent.id);
        } else if (item.id) {
          // Existing component being moved to empty canvas
          moveComponent(page.id, item.id, item.component, 0, undefined, item.parentId);
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

  // Viewport dimensions
  const getViewportDimensions = () => {
    switch (currentViewport) {
      case 'mobile': return { width: 375, height: 667 };
      case 'tablet': return { width: 768, height: 1024 };
      case 'desktop': return { width: 1200, height: 800 };
      default: return { width: 1200, height: 800 };
    }
  };

  const { width: viewportWidth, height: viewportHeight } = getViewportDimensions();
  const scaleFactor = zoomLevel / 100;

  return (
    <div 
      className="min-h-full p-8 bg-muted/30 transition-colors relative overflow-auto"
      style={{ minHeight: '400px' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPreviewMode) {
          setSelectedComponentId(null);
        }
      }}
    >
      <div className="flex justify-center items-start">
        <div 
          className={cn(
            "bg-background transition-all duration-300 relative",
            showDeviceFrame && currentViewport !== 'desktop' && "shadow-2xl rounded-lg border border-border",
            currentViewport === 'mobile' && showDeviceFrame && "rounded-[2.5rem] border-8 border-slate-300",
            currentViewport === 'tablet' && showDeviceFrame && "rounded-xl border-4 border-slate-300"
          )}
          style={{
            width: `${viewportWidth}px`,
            minHeight: `${viewportHeight}px`,
            transform: `scale(${scaleFactor})`,
            transformOrigin: 'top center',
            marginBottom: `${(viewportHeight * scaleFactor - viewportHeight) + 32}px`
          }}
        >
          <div className="p-4">
            {/* Render components with integrated drop zones */}
            {page.layoutData?.content?.map((component, index) => (
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
      </div>
    </div>
  );
};
