import React from 'react';
import { useDrag, useDrop } from 'react-dnd';
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
  const { moveComponent, isPreviewMode } = useBuilderStore();

  // Make the component draggable
  const [{ isDragging }, drag] = useDrag({
    type: 'existing-component',
    item: { 
      id: component.id, 
      index, 
      pageId,
      parentId,
      component 
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: () => !isPreviewMode,
  });

  // Create drop zone for reordering (drop above this component)
  const [{ isOver }, drop] = useDrop({
    accept: ['component', 'existing-component'],
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

  // Combine drag and drop refs
  const ref = (node: HTMLDivElement | null) => {
    drag(node);
    drop(node);
  };

  // Container drop zone (for dropping inside containers)
  const [{ isOverContainer }, dropContainer] = useDrop({
    accept: ['component', 'existing-component'],
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

  return (
    <>
      {/* Drop zone above component for reordering */}
      {!isPreviewMode && (
        <div
          className={cn(
            'h-2 transition-all duration-200',
            isOver ? 'bg-primary/50 rounded' : 'transparent'
          )}
        />
      )}
      
      {/* The actual component */}
      <div
        ref={ref}
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
          />
        )}
      </div>
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

  return (
    <div 
      ref={dropContainer}
      className={cn(
        'min-h-[100px] p-6 border-2 border-dashed rounded-lg transition-all duration-200',
        {
          'border-border bg-background': !isOverContainer,
          'border-primary bg-primary/10': isOverContainer && !isPreviewMode,
          'border-solid border-border': component.children?.length > 0,
        }
      )}
    >
      {component.children?.length > 0 ? (
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
        <div className="text-center py-8">
          <p className="text-muted-foreground">Drop components here</p>
        </div>
      )}
    </div>
  );
};

// Default props helper (moved from BuilderCanvas)
function getDefaultProps(componentType: string): Record<string, any> {
  const defaults: Record<string, any> = {
    Button: { text: 'Button', variant: 'default', size: 'default' },
    Text: { text: 'Sample text content', size: 'base' },
    Heading: { text: 'Heading', level: '2' },
    Card: { title: 'Card Title', description: 'Card description', content: 'Card content' },
    Input: { placeholder: 'Enter text...', type: 'text' },
    Textarea: { placeholder: 'Enter text...', rows: 3 },
    Select: { placeholder: 'Select an option', options: ['Option 1', 'Option 2', 'Option 3'] },
    Checkbox: { label: 'Checkbox' },
    Switch: { label: 'Toggle' },
    Badge: { text: 'Badge', variant: 'default' },
    Alert: { message: 'This is an alert message.' },
    Separator: {},
    Tabs: { 
      tabs: [
        { label: 'Tab 1', content: 'Content for tab 1' },
        { label: 'Tab 2', content: 'Content for tab 2' }
      ]
    },
    Accordion: {
      items: [
        { title: 'Item 1', content: 'Content for item 1' },
        { title: 'Item 2', content: 'Content for item 2' }
      ]
    },
    Avatar: { src: '/placeholder.svg', alt: 'Avatar', fallback: 'U' },
    Breadcrumb: {
      items: [
        { label: 'Home', href: '/' },
        { label: 'Page', href: '/page' }
      ]
    },
    Progress: { value: 50 },
    Container: { className: 'p-6' },
    Image: { src: '/placeholder.svg', alt: 'Placeholder image' },
    Link: { text: 'Link', href: '#', target: '_self' }
  };

  return defaults[componentType] || {};
}
