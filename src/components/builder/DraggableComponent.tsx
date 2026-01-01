import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { ComponentRenderer } from './ComponentRenderer';
import { useBuilderStore } from '@/stores/builder';
import { cn } from '@/lib/utils';

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
  const { isPreviewMode, moveComponent, pages } = useBuilderStore();

  // Get sibling components to determine if this is the last one
  const currentPage = pages.find(p => p.id === pageId);
  const siblingComponents = parentId
    ? currentPage?.layoutData?.content?.find(c => c.id === parentId)?.children || []
    : currentPage?.layoutData?.content || [];
  const isLastComponent = index === siblingComponents.length - 1;

  // Use sortable for drag and drop
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: component.id,
    data: {
      type: 'existing-component',
      component,
      index,
      pageId,
      parentId
    },
    disabled: isPreviewMode
  });

  // Drop zone BEFORE this component
  const { setNodeRef: setDropBefore, isOver: isOverBefore } = useDroppable({
    id: `drop-before-${component.id}`,
    data: {
      type: 'drop-zone',
      index,
      pageId,
      parentId
    },
    disabled: isPreviewMode
  });

  // Drop zone AFTER this component (only for last component)
  const { setNodeRef: setDropAfter, isOver: isOverAfter } = useDroppable({
    id: `drop-after-${component.id}`,
    data: {
      type: 'drop-zone',
      index: index + 1,
      pageId,
      parentId
    },
    disabled: isPreviewMode || !isLastComponent
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <>
      {/* Drop zone before component */}
      {!isPreviewMode && (
        <div
          ref={setDropBefore}
          className={cn(
            'h-2 -my-1 transition-all',
            isOverBefore && 'h-8 bg-primary/10 border-2 border-dashed border-primary rounded-md'
          )}
        />
      )}

      {/* The actual component */}
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={(e) => onSelect(component.id, e)}
        className={cn(
          'transition-all duration-200 relative group',
          {
            'ring-2 ring-primary ring-offset-2 rounded-md': isSelected && !isPreviewMode,
            'cursor-pointer': !isPreviewMode,
            'cursor-move': !isPreviewMode && isDragging,
            'hover:ring-2 hover:ring-dashed hover:ring-primary/30': !isSelected && !isPreviewMode,
          }
        )}
      >
        {/* Corner Handles - only visible when selected */}
        {isSelected && !isPreviewMode && (
          <>
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-primary rounded-full z-10 pointer-events-none" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full z-10 pointer-events-none" />
            <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-primary rounded-full z-10 pointer-events-none" />
            <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full z-10 pointer-events-none" />
          </>
        )}

        {/* Component Content */}
        {component.type === 'Container' ? (
          <ContainerComponent
            component={component}
            pageId={pageId}
          />
        ) : (
          <ComponentRenderer
            component={component}
            isSelected={isSelected}
            onComponentClick={(componentId, event) => onSelect(componentId, event)}
            onDoubleClick={(componentId, event) => {
              event.stopPropagation();
              // Double-click to edit text for text-based components
              const textComponents = ['Text', 'Heading', 'Button', 'Badge', 'Link'];
              if (textComponents.includes(component.type) && !isPreviewMode) {
                const { setEditingComponentId } = useBuilderStore.getState();
                setEditingComponentId(componentId);
              }
            }}
          />
        )}
      </div>  {/* End Component Content */}

      {/* Drop zone after last component */}
      {!isPreviewMode && isLastComponent && (
        <div
          ref={setDropAfter}
          className={cn(
            'h-2 -my-1 transition-all',
            isOverAfter && 'h-8 bg-primary/10 border-2 border-dashed border-primary rounded-md'
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
}> = ({ component, pageId }) => {
  const { selectedComponentId, setSelectedComponentId, isPreviewMode } = useBuilderStore();

  // Make container a dropzone
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `container-${component.id}`,
    data: {
      type: 'container',
      componentId: component.id,
      pageId
    },
    disabled: isPreviewMode
  });

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
    <div ref={setDropRef} className={cn({
      'ring-2 ring-primary/50 ring-offset-2': isOver && !isPreviewMode,
    })}>
      <ComponentRenderer
        component={component}
        isSelected={false}
        children={containerChildren}
      />
    </div>
  );
};

