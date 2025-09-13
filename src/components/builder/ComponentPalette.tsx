import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  MousePointer, 
  Type, 
  Layout, 
  BarChart, 
  Table,
  CheckSquare,
  Image,
  Calendar,
  Globe
} from 'lucide-react';

const componentCategories = {
  basic: {
    icon: MousePointer,
    label: 'Basic',
    components: [
      { name: 'Button', icon: MousePointer, description: 'Interactive button' },
      { name: 'Text', icon: Type, description: 'Text content' },
      { name: 'Heading', icon: Type, description: 'Headings (H1-H6)' },
      { name: 'Link', icon: Globe, description: 'Navigation link' },
      { name: 'Image', icon: Image, description: 'Image display' },
      { name: 'Container', icon: Layout, description: 'Layout container' },
    ]
  },
  layout: {
    icon: Layout,
    label: 'Layout',
    components: [
      { name: 'Card', icon: Layout, description: 'Content card' },
      { name: 'Grid', icon: Layout, description: 'Grid layout' },
      { name: 'Flex', icon: Layout, description: 'Flex container' },
      { name: 'Separator', icon: Layout, description: 'Visual separator' },
      { name: 'Tabs', icon: Layout, description: 'Tabbed content' },
      { name: 'Accordion', icon: Layout, description: 'Collapsible content' },
    ]
  },
  forms: {
    icon: CheckSquare,
    label: 'Forms',
    components: [
      { name: 'Form', icon: CheckSquare, description: 'Form container' },
      { name: 'Input', icon: Type, description: 'Text input' },
      { name: 'Textarea', icon: Type, description: 'Multi-line text' },
      { name: 'Select', icon: CheckSquare, description: 'Dropdown select' },
      { name: 'Checkbox', icon: CheckSquare, description: 'Checkbox input' },
      { name: 'Switch', icon: CheckSquare, description: 'Toggle switch' },
      { name: 'DatePicker', icon: Calendar, description: 'Date selection' },
    ]
  },
  data: {
    icon: Table,
    label: 'Data',
    components: [
      { name: 'DataTable', icon: Table, description: 'Advanced data table' },
      { name: 'KPICard', icon: BarChart, description: 'KPI display card' },
      { name: 'Chart', icon: BarChart, description: 'Data visualization' },
      { name: 'Badge', icon: MousePointer, description: 'Status badge' },
      { name: 'Progress', icon: BarChart, description: 'Progress indicator' },
      { name: 'Avatar', icon: MousePointer, description: 'User avatar' },
    ]
  },
  advanced: {
    icon: BarChart,
    label: 'Advanced',
    components: [
      { name: 'Dashboard', icon: BarChart, description: 'Dashboard layout' },
      { name: 'Navigation', icon: Globe, description: 'Navigation menu' },
      { name: 'Breadcrumb', icon: Globe, description: 'Breadcrumb trail' },
      { name: 'Pagination', icon: Globe, description: 'Page navigation' },
      { name: 'Dialog', icon: Layout, description: 'Modal dialog' },
      { name: 'Tooltip', icon: MousePointer, description: 'Hover tooltip' },
    ]
  }
};

export const ComponentPalette: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('basic');

  const filteredComponents = searchTerm
    ? Object.values(componentCategories)
        .flatMap(category => category.components)
        .filter(component => 
          component.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          component.description.toLowerCase().includes(searchTerm.toLowerCase())
        )
    : componentCategories[activeCategory as keyof typeof componentCategories]?.components || [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold text-foreground mb-3">Components</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search components..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Category Tabs */}
      {!searchTerm && (
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="flex-1 flex flex-col">
          <TabsList className="grid grid-cols-2 gap-1 p-2 h-auto">
            {Object.entries(componentCategories).map(([key, category]) => {
              const Icon = category.icon;
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="flex flex-col gap-1 h-auto py-2"
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs">{category.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          
          {Object.entries(componentCategories).map(([key]) => (
            <TabsContent key={key} value={key} className="flex-1 overflow-y-auto">
              <div className="p-2 space-y-2">
                {componentCategories[key as keyof typeof componentCategories].components.map((component) => (
                  <ComponentItem
                    key={component.name}
                    name={component.name}
                    icon={component.icon}
                    description={component.description}
                  />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Search Results */}
      {searchTerm && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {filteredComponents.length > 0 ? (
            filteredComponents.map((component) => (
              <ComponentItem
                key={component.name}
                name={component.name}
                icon={component.icon}
                description={component.description}
              />
            ))
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No components found for "{searchTerm}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ComponentItemProps {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

import { useDrag } from 'react-dnd';

const ComponentItem: React.FC<ComponentItemProps> = ({ name, icon: Icon, description }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: { type: name },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: () => true,
    end: (item, monitor) => {
      console.log('Drag ended:', item, 'Drop result:', monitor.getDropResult());
    },
  });

  return (
    <div
      ref={drag}
      className={`
        p-3 border border-border rounded-lg bg-card hover:bg-accent/50 cursor-grab active:cursor-grabbing transition-colors
        ${isDragging ? 'opacity-50' : 'opacity-100'}
      `}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary/10 rounded-md">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <div className="font-medium text-foreground">{name}</div>
          <div className="text-xs text-muted-foreground mt-1">{description}</div>
        </div>
      </div>
    </div>
  );
};