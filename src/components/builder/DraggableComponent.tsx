import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { ComponentRenderer } from './ComponentRenderer';
import { ComponentErrorBoundary } from './ComponentErrorBoundary';
import { ComponentContextMenu } from './ComponentContextMenu';
import { useBuilderStore } from '@/stores/builder';
import { cn } from '@/lib/utils';
import { deepEqual } from '@/lib/equality';

interface DraggableComponentProps {
  component: {
    id: string;
    type: string;
    props: Record<string, any>;
    styles?: any;
    stylesData?: any;
    className?: string;
    children?: any[];
  };
  index: number;
  pageId: string;
  parentId?: string;
  isSelected: boolean;
  /** Whether this component is the last among its siblings. Drives the
   *  trailing drop-zone. Passed in by the parent (which already knows the
   *  sibling count) so this component does not have to subscribe to the full
   *  page tree — that subscription was the cause of cascading re-renders
   *  when typing in inline editors. */
  isLastComponent: boolean;
  onSelect: (componentId: string, event: React.MouseEvent) => void;
}

/**
 * Custom comparator for DraggableComponent's React.memo.
 *
 * Compares only the fields that affect the rendered output:
 *  - `component.id`            (identity)
 *  - `component.props`         (deep — bound data, text, etc.)
 *  - `component.styles`        (deep — legacy styles)
 *  - `component.stylesData`    (deep — styling panel data)
 *  - `component.children`      (reference — structural sharing produces a new
 *                               array ref whenever a descendant changes, which
 *                               is how we know to re-render containers)
 *  - `isSelected`              (selection ring / handles)
 *  - `isLastComponent`         (trailing drop-zone)
 *  - scalar positioning props and callbacks (reference equality)
 *
 * Callbacks (`onSelect`) are compared by reference, so callers should memoize
 * them (e.g. `useCallback`) for the comparator to skip unaffected siblings.
 */
function areDraggablePropsEqual(
  prev: DraggableComponentProps,
  next: DraggableComponentProps
): boolean {
  return (
    prev.isSelected === next.isSelected &&
    prev.isLastComponent === next.isLastComponent &&
    prev.index === next.index &&
    prev.pageId === next.pageId &&
    prev.parentId === next.parentId &&
    prev.onSelect === next.onSelect &&
    prev.component.id === next.component.id &&
    prev.component.type === next.component.type &&
    prev.component.children === next.component.children &&
    deepEqual(prev.component.props, next.component.props) &&
    deepEqual(prev.component.styles, next.component.styles) &&
    deepEqual(prev.component.stylesData, next.component.stylesData)
  );
}

const DraggableComponentBase: React.FC<DraggableComponentProps> = ({
  component,
  index,
  pageId,
  parentId,
  isSelected,
  isLastComponent,
  onSelect
}) => {
  const { isPreviewMode } = useBuilderStore();

  // Memoized so the reference passed to ComponentRenderer.onDoubleClick is
  // stable while typing (component.type and isPreviewMode don't change then),
  // letting ComponentRenderer's React.memo skip unaffected siblings.
  const handleDoubleClick = React.useCallback((componentId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    // Double-click to edit text for text-based components
    const textComponents = ['Text', 'Heading', 'Button', 'Badge', 'Link'];
    if (textComponents.includes(component.type) && !isPreviewMode) {
      const { setEditingTextNode } = useBuilderStore.getState();
      setEditingTextNode({ componentId, property: 'text' });
    }
  }, [component.type, isPreviewMode]);

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
    textAlign: 'inherit' as const,
  };

  return (
    <ComponentContextMenu
      componentId={component.id}
      componentType={component.type}
      disabled={isPreviewMode}
    >
    {/* Use a wrapper that acts as a single grid item */}
    {/* The inner component will be styled, but the wrapper becomes the grid child */}
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => onSelect(component.id, e)}
      className={cn(
        `fb-${component.id}`,
        'transition-all duration-200 relative group',
        {
          'ring-2 ring-primary ring-offset-2 rounded-md': isSelected && !isPreviewMode,
          'cursor-pointer': !isPreviewMode,
          'cursor-move': !isPreviewMode && isDragging,
          'hover:ring-2 hover:ring-dashed hover:ring-primary/30': !isSelected && !isPreviewMode,
        }
      )}
      style={{
        ...style,
        textAlign: 'inherit',
      }}
    >
      {/* Drop zone before component - positioned at top edge */}
      {!isPreviewMode && (
        <div
          ref={setDropBefore}
          className={cn(
            'absolute top-0 left-0 right-0 h-2 -translate-y-1/2 z-10 transition-all',
            isOverBefore && 'h-4 bg-primary/20 border-2 border-dashed border-primary rounded-md'
          )}
        />
      )}

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
      {['Container', 'Row', 'Column', 'Card', 'Repeater'].includes(component.type) ? (
        <ComponentErrorBoundary
          componentId={component.id}
          componentType={component.type}
        >
          <ContainerComponent
            component={component}
            pageId={pageId}
            onSelect={onSelect}
          />
        </ComponentErrorBoundary>
      ) : (
        <ComponentErrorBoundary
          componentId={component.id}
          componentType={component.type}
        >
          <ComponentRenderer
            component={component}
            isSelected={isSelected}
            onComponentClick={onSelect}
            onDoubleClick={handleDoubleClick}
          />
        </ComponentErrorBoundary>
      )}

      {/* Drop zone after last component - positioned at bottom edge */}
      {!isPreviewMode && isLastComponent && (
        <div
          ref={setDropAfter}
          className={cn(
            'absolute bottom-0 left-0 right-0 h-2 translate-y-1/2 z-10 transition-all',
            isOverAfter && 'h-4 bg-primary/20 border-2 border-dashed border-primary rounded-md'
          )}
        />
      )}
    </div>
    </ComponentContextMenu>
  );
};

export const DraggableComponent = React.memo(DraggableComponentBase, areDraggablePropsEqual);

// Container component with drop zone support
const ContainerComponent: React.FC<{
  component: any;
  pageId: string;
  onSelect: (componentId: string, event: React.MouseEvent) => void;
}> = ({ component, pageId, onSelect }) => {
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
  // NOTE: We use Fragment (not a div) to avoid adding an intermediate wrapper
  // that would override the Container's flex/grid layout

  // Check if this is a Card with content (Feature Card mode)
  // If so, we SHOULD NOT show the placeholder, but passing empty children is fine
  // because CardRenderer handles empty children by showing the feature content
  const isFeatureCard = component.type === 'Card' && (
    component.props?.title ||
    component.props?.description ||
    component.props?.icon
  );

  const showPlaceholder = !isPreviewMode && !isFeatureCard;



  const containerChildren = component.children?.length > 0 ? (
    <>
      {component.children.map((child: any, index: number) => (
        <DraggableComponent
          key={child.id}
          component={child}
          index={index}
          pageId={pageId}
          parentId={component.id}
          isSelected={selectedComponentId === child.id}
          isLastComponent={index === component.children.length - 1}
          onSelect={onSelect}
        />
      ))}
    </>
  ) : (
    showPlaceholder ? (
      <div className="text-center py-4" style={{ minHeight: '48px', border: '1px dashed hsl(var(--border))', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted-foreground text-sm">Drop components here</p>
      </div>
    ) : null
  );

  return (
    <div ref={setDropRef} style={{ textAlign: 'inherit' }} className={cn({
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

