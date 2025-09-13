import React from 'react';
import { useDrop } from 'react-dnd';
import { useBuilderStore, type Page } from '@/stores/builder';
import { ComponentRenderer } from './ComponentRenderer';
import { v4 as uuidv4 } from 'uuid';

interface BuilderCanvasProps {
  page: Page;
}

export const BuilderCanvas: React.FC<BuilderCanvasProps> = ({ page }) => {
  const { updatePage, selectedComponentId, setSelectedComponentId, isPreviewMode } = useBuilderStore();

  const [{ isOver }, drop] = useDrop({
    accept: 'component',
    drop: (item: { type: string }, monitor) => {
      if (!monitor.didDrop()) {
        // Add component to the end of the content array
        const newComponent = {
          id: uuidv4(),
          type: item.type,
          props: getDefaultProps(item.type),
          styles: {}
        };

        const updatedContent = [...(page.layoutData?.content || []), newComponent];
        
        updatePage(page.id, {
          layoutData: {
            content: updatedContent,
            root: page.layoutData?.root || {}
          }
        });

        // Select the newly added component
        setSelectedComponentId(newComponent.id);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  });

  const handleComponentClick = (componentId: string) => {
    if (!isPreviewMode) {
      setSelectedComponentId(selectedComponentId === componentId ? null : componentId);
    }
  };

  return (
    <div 
      ref={drop}
      className={`min-h-full p-8 ${isOver ? 'bg-accent/50' : 'bg-background'} transition-colors`}
    >
      <div className="max-w-4xl mx-auto space-y-4">
        {page.layoutData?.content?.map((component, index) => (
          <div
            key={component.id}
            onClick={() => handleComponentClick(component.id)}
            className={`
              ${selectedComponentId === component.id && !isPreviewMode 
                ? 'ring-2 ring-primary ring-offset-2' 
                : ''
              }
              ${!isPreviewMode ? 'cursor-pointer' : ''}
              transition-all duration-200
            `}
          >
            <ComponentRenderer 
              component={component}
              isSelected={selectedComponentId === component.id}
            />
          </div>
        ))}
        
        {(!page.layoutData?.content || page.layoutData.content.length === 0) && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">Drop components here to start building</p>
            <p className="text-sm mt-2">Drag components from the left panel</p>
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