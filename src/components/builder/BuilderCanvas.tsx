import React from 'react';
import { useDrop } from 'react-dnd';
import { useBuilderStore, type Page } from '@/stores/builder';
import { DraggableComponent } from './DraggableComponent';

interface BuilderCanvasProps {
  page: Page;
}

export const BuilderCanvas: React.FC<BuilderCanvasProps> = ({ page }) => {
  const { moveComponent, selectedComponentId, setSelectedComponentId, isPreviewMode } = useBuilderStore();

  // Drop zone for the main canvas (add to end)
  const [{ isOver }, drop] = useDrop({
    accept: ['component', 'existing-component'],
    drop: (item: any, monitor) => {
      console.log('Drop event triggered:', item);
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
          
          console.log('Creating new component:', newComponent);
          const targetIndex = page.layoutData?.content?.length || 0;
          moveComponent(page.id, null, newComponent, targetIndex);
          setSelectedComponentId(newComponent.id);
        } else if (item.id) {
          // Existing component being moved to end
          const targetIndex = page.layoutData?.content?.length || 0;
          moveComponent(page.id, item.id, item.component, targetIndex, undefined, item.parentId);
        }
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
    canDrop: () => true,
  });

  const handleComponentClick = (componentId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!isPreviewMode) {
      setSelectedComponentId(selectedComponentId === componentId ? null : componentId);
    }
  };

  return (
    <div 
      ref={drop}
      className={`min-h-full p-8 ${isOver ? 'bg-accent/50' : 'bg-background'} transition-colors relative`}
      style={{ minHeight: '400px' }}
      onClick={(e) => {
        // Deselect when clicking on empty canvas
        if (e.target === e.currentTarget && !isPreviewMode) {
          setSelectedComponentId(null);
        }
      }}
    >
      <div className="max-w-4xl mx-auto">
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
        
        {/* Final drop zone at the bottom */}
        {!isPreviewMode && page.layoutData?.content && page.layoutData.content.length > 0 && (
          <div className="h-4 transition-all duration-200 hover:bg-primary/20 rounded mt-4" />
        )}
        
        {(!page.layoutData?.content || page.layoutData.content.length === 0) && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">Drop components here to start building</p>
            <p className="text-sm mt-2">Drag components from the left panel or reorder existing ones</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Default props for different component types  
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
        { label: 'Home', href: '/page' },
        { label: 'Current', href: '#' }
      ]
    },
    Progress: { value: 50 },
    Container: { className: 'p-6' },
    Image: { src: '/placeholder.svg', alt: 'Placeholder image' },
    Link: { text: 'Link', href: '#', target: '_self' }
  };

  return defaults[componentType] || {};
}