import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
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

// Draggable component item using @dnd-kit
const DraggableComponentItem: React.FC<{ component: any }> = ({ component }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${component.name}`,
    data: {
      type: component.name, // This is what CustomBuilder expects
      name: component.name
    }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = component.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex flex-col items-center justify-center p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/50 cursor-move transition-all group"
      title={component.description}
    >
      <Icon className="h-5 w-5 mb-1.5 text-muted-foreground group-hover:text-primary transition-colors" />
      <span className="text-xs text-center font-medium leading-tight">
        {component.name}
      </span>
    </div>
  );
};

export const ComponentPalette: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const allComponents = Object.entries(componentCategories).flatMap(([category, data]) =>
    data.components.map(comp => ({ ...comp, category }))
  );

  const filteredComponents = allComponents.filter(comp =>
    comp.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (activeCategory === 'all' || comp.category === activeCategory)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-4 border-b space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search components..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Category Filters */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="all" className="text-xs">
              All
            </TabsTrigger>
            {Object.entries(componentCategories).map(([key, data]) => (
              <TabsTrigger key={key} value={key} className="text-xs">
                {data.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Components Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Grid */}
        <div className="grid grid-cols-3 gap-2">
          {filteredComponents.map((component) => (
            <DraggableComponentItem
              key={component.name}
              component={component}
            />
          ))}
        </div>

        {/* Empty state */}
        {filteredComponents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No components found</p>
            <p className="text-xs mt-1">Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  );
};


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
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const allComponents = Object.entries(componentCategories).flatMap(([category, data]) =>
    data.components.map(comp => ({ ...comp, category }))
  );

  const filteredComponents = allComponents.filter(comp =>
    comp.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (activeCategory === 'all' || comp.category === activeCategory)
  );

  const handleDragStart = (component: any) => (event: React.DragEvent) => {
    event.dataTransfer.setData('component', JSON.stringify({
      type: component.name,
      name: component.name
    }));
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search components..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {/* Category Tabs - Compact horizontal scroll */}
      <div className="border-b">
        <div className="flex gap-1 p-2 overflow-x-auto scrollbar-hide">
          <Button
            variant={activeCategory === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveCategory('all')}
            className="h-7 px-3 text-xs"
          >
            All
          </Button>
          {Object.entries(componentCategories).map(([key, data]) => (
            <Button
              key={key}
              variant={activeCategory === key ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveCategory(key)}
              className="h-7 px-3 text-xs whitespace-nowrap"
            >
              {data.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Components Grid - 3 columns, compact */}
      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-3 gap-2">
          {filteredComponents.map((component) => {
            const Icon = component.icon;
            return (
              <div
                key={component.name}
                draggable
                onDragStart={handleDragStart(component)}
                className="flex flex-col items-center justify-center p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/50 cursor-move transition-all group"
                title={component.description}
              >
                <Icon className="h-5 w-5 mb-1.5 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-xs text-center font-medium leading-tight">
                  {component.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {filteredComponents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No components found</p>
            <p className="text-xs mt-1">Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  );
};

