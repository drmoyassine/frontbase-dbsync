import React from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { ComponentRenderer } from './ComponentRenderer';
import { useBuilderStore } from '@/stores/builder';
import { cn } from '@/lib/utils';
import { shouldRenderDropZone, getDropZoneStyle } from '@/lib/dropZoneUtils';
import { getDefaultProps } from '@/lib/componentDefaults';

interface DraggableComponentProps {
  component: {
    id: string;
    type: string;
    props: Record<string, any>;
    styles?: any;
    className?: string;
    children?: any[];
  };
  index: number;
  pageId: string;
  parentId?: string;
  isSelected: boolean;
  onSelect: (componentId: string, event: React.MouseEvent) => void;
}

export const DraggableComponent: React.FC<DraggableComponentProps> = ({ 
  component, 
  index, 
  pageId, 
  parentId,
  isSelected, 
  onSelect 
}) => {
  const { moveComponent, isPreviewMode, draggedComponentId, setDraggedComponentId } = useBuilderStore();

  // Make the component draggable
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'existing-component',
    item: () => {
      // Set drag state immediately when drag begins (replaces deprecated begin)
      setDraggedComponentId(component.id);
      return { 
        id: component.id, 
        index, 
        pageId,
        parentId,
        component 
      };
    },
    end: () => {
      // Clear drag state immediately when drag ends
      setDraggedComponentId(null);
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: () => !isPreviewMode,
  }), [component.id, index, pageId, parentId, component, isPreviewMode, setDraggedComponentId]);

  // Get sibling components for drop zone validation
  const { pages } = useBuilderStore();
  const currentPage = pages.find(p => p.id === pageId);
  const siblingComponents = parentId 
    ? currentPage?.layoutData?.content?.find(c => c.id === parentId)?.children || []
    : currentPage?.layoutData?.content || [];
  
  // Create drop zone for reordering (drop above this component)
  const [{ isOver }, drop] = useDrop({
    accept: ['component', 'existing-component', 'layer-component'],
    drop: (item: any, monitor) => {
      if (!monitor.didDrop()) {
        if (item.type) {
          // New component from palette
          const newComponent = {
            id: `${Date.now()}-${Math.random()}`,
            type: item.type,
            props: getDefaultProps(item.type),
            styles: {},
            children: []
          };
          moveComponent(pageId, null, newComponent, index, parentId);
        } else if (item.id !== component.id) {
          // Existing component being moved
          moveComponent(pageId, item.id, item.component, index, parentId, item.parentId);
        }
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
    canDrop: () => !isPreviewMode,
  });

  // Check if this drop zone should be rendered (first or between)
  const shouldShowAboveZone = shouldRenderDropZone(
    component.id,
    index,
    draggedComponentId,
    siblingComponents,
    'above'
  );

  // No need to combine refs - separate them for cleaner logic

  // Container drop zone (for dropping inside containers)
  const [{ isOverContainer }, dropContainer] = useDrop({
    accept: ['component', 'existing-component', 'layer-component'],
    drop: (item: any, monitor) => {
      if (component.type === 'Container' && !monitor.didDrop()) {
        if (item.type) {
          // New component from palette
          const newComponent = {
            id: `${Date.now()}-${Math.random()}`,
            type: item.type,
            props: getDefaultProps(item.type),
            styles: {},
            children: []
          };
          moveComponent(pageId, null, newComponent, 0, component.id);
        } else if (item.id !== component.id) {
          // Existing component being moved
          moveComponent(pageId, item.id, item.component, 0, component.id, item.parentId);
        }
      }
    },
    collect: (monitor) => ({
      isOverContainer: monitor.isOver({ shallow: true }),
    }),
    canDrop: () => !isPreviewMode && component.type === 'Container',
  });

  // Check if this is the last component in its container
  const isLastComponent = index === siblingComponents.length - 1;


  // Drop zone after last component
  const [{ isOverAfter }, dropAfter] = useDrop({
    accept: ['component', 'existing-component', 'layer-component'],
    drop: (item: any, monitor) => {
      if (!monitor.didDrop() && isLastComponent) {
        const targetIndex = index + 1;
        if (item.type) {
          // New component from palette
          const newComponent = {
            id: `${Date.now()}-${Math.random()}`,
            type: item.type,
            props: getDefaultProps(item.type),
            styles: {},
            children: []
          };
          moveComponent(pageId, null, newComponent, targetIndex, parentId);
        } else if (item.id !== component.id) {
          // Existing component being moved (prevent self-drop)
          moveComponent(pageId, item.id, item.component, targetIndex, parentId, item.parentId);
        }
      }
    },
    collect: (monitor) => ({
      isOverAfter: monitor.isOver({ shallow: true }),
    }),
    canDrop: () => !isPreviewMode && isLastComponent && component.id !== draggedComponentId,
  });

  // Check if the "after last" drop zone should be rendered
  const shouldShowAfterZone = shouldRenderDropZone(
    component.id,
    index,
    draggedComponentId,
    siblingComponents,
    'after'
  );

  return (
    <>
      {/* Drop zone above component (first or between) */}
      {!isPreviewMode && shouldShowAboveZone && (
        <div
          ref={drop}
          className={cn(
            'mb-1',
            getDropZoneStyle(index === 0 ? 'first' : 'between', isOver)
          )}
        />
      )}
      
      {/* The actual component */}
      <div
        ref={drag}
        onClick={(e) => onSelect(component.id, e)}
        className={cn(
          'transition-all duration-200',
          {
            'opacity-50': isDragging,
            'ring-2 ring-primary ring-offset-2 rounded-md': isSelected && !isPreviewMode,
            'cursor-pointer': !isPreviewMode,
            'cursor-move': !isPreviewMode && isDragging,
          }
        )}
      >
        {component.type === 'Container' ? (
          <ContainerComponent 
            component={component}
            pageId={pageId}
            isOverContainer={isOverContainer}
            dropContainer={dropContainer}
          />
        ) : (
          <ComponentRenderer 
            component={component}
            isSelected={isSelected}
            onComponentClick={(componentId, event) => onSelect(componentId, event)}
          />
        )}
      </div>

      {/* Drop zone after last component only */}
      {!isPreviewMode && shouldShowAfterZone && (
        <div
          ref={dropAfter}
          className={cn(
            'mt-1',
            getDropZoneStyle('last', isOverAfter)
          )}
        />
      )}
    </>
  );
};

// Container component with drop zone support
const ContainerComponent: React.FC<{
  component: any;
  pageId: string;
  isOverContainer: boolean;
  dropContainer: (node: HTMLElement | null) => void;
}> = ({ component, pageId, isOverContainer, dropContainer }) => {
  const { selectedComponentId, setSelectedComponentId, isPreviewMode } = useBuilderStore();

  // Use ComponentRenderer for Container to apply styles properly
  const containerChildren = component.children?.length > 0 ? (
    <div className="space-y-4">
      {component.children.map((child: any, index: number) => (
        <DraggableComponent
          key={child.id}
          component={child}
          index={index}
          pageId={pageId}
          parentId={component.id}
          isSelected={selectedComponentId === child.id}
          onSelect={(componentId, event) => {
            event.stopPropagation();
            if (!isPreviewMode) {
              setSelectedComponentId(selectedComponentId === componentId ? null : componentId);
            }
          }}
        />
      ))}
    </div>
  ) : (
    !isPreviewMode && (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Drop components here</p>
      </div>
    )
  );

  return (
    <div ref={dropContainer} className={cn({
      'ring-2 ring-primary/50 ring-offset-2': isOverContainer && !isPreviewMode,
    })}>
      <ComponentRenderer 
        component={component}
        isSelected={false}
        children={containerChildren}
      />
    </div>
  );
};

