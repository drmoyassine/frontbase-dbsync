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
    icon: Layout,
    label: 'Basic',
    components: [
      // Basic Components separator (NEW)
      { name: '_separator_basic', icon: MousePointer, description: 'Basic Components', section: 'separator' },

      // Basic Components (Container REMOVED)
      { name: 'Button', icon: MousePointer, description: 'Interactive button', section: 'basic' },
      { name: 'Text', icon: Type, description: 'Text content', section: 'basic' },
      { name: 'Heading', icon: Type, description: 'Headings (H1-H6)', section: 'basic' },
      { name: 'Link', icon: Globe, description: 'Navigation link', section: 'basic' },
      { name: 'Image', icon: Image, description: 'Image display', section: 'basic' },

      // Layout separator
      { name: '_separator_layout', icon: Layout, description: 'Layout Components', section: 'separator' },

      // Layout Components (Container MOVED HERE)
      { name: 'Container', icon: Layout, description: 'Layout container', section: 'layout' },
      { name: 'Card', icon: Layout, description: 'Content card', section: 'layout' },
      { name: 'Grid', icon: Layout, description: 'Grid layout', section: 'layout' },
      { name: 'Flex', icon: Layout, description: 'Flex container', section: 'layout' },
      { name: 'Separator', icon: Layout, description: 'Visual separator', section: 'layout' },
      { name: 'Tabs', icon: Layout, description: 'Tabbed content', section: 'layout' },
      { name: 'Accordion', icon: Layout, description: 'Collapsible content', section: 'layout' },
    ]
  },
  data: {
    icon: Table,
    label: 'Data',
    components: [
      // Record Components separator (RENAMED from Form Components)
      { name: '_separator_record', icon: CheckSquare, description: 'Record Components', section: 'separator' },

      // Form/Record Components
      { name: 'Form', icon: CheckSquare, description: 'Form container', section: 'forms' },
      { name: 'Input', icon: Type, description: 'Text input', section: 'forms' },
      { name: 'Textarea', icon: Type, description: 'Multi-line text', section: 'forms' },
      { name: 'Select', icon: CheckSquare, description: 'Dropdown select', section: 'forms' },
      { name: 'Checkbox', icon: CheckSquare, description: 'Checkbox input', section: 'forms' },
      { name: 'Switch', icon: CheckSquare, description: 'Toggle switch', section: 'forms' },
      { name: 'DatePicker', icon: Calendar, description: 'Date selection', section: 'forms' },

      // Lists Components separator (RENAMED from Single Record)
      { name: '_separator_lists', icon: Table, description: 'Lists Components', section: 'separator' },

      // Data/Lists Components
      { name: 'DataTable', icon: Table, description: 'Advanced data table', section: 'data' },
      { name: 'KPICard', icon: BarChart, description: 'KPI display card', section: 'data' },
      { name: 'Chart', icon: BarChart, description: 'Data visualization', section: 'data' },
      { name: 'Badge', icon: MousePointer, description: 'Status badge', section: 'data' },
      { name: 'Progress', icon: BarChart, description: 'Progress indicator', section: 'data' },
      { name: 'Avatar', icon: MousePointer, description: 'User avatar', section: 'data' },
    ]
  }
};

// Draggable component item using @dnd-kit
const DraggableComponentItem: React.FC<{ component: any }> = ({ component }) => {
  // Render separator
  if (component.section === 'separator') {
    return (
      <div className="col-span-3 flex items-center gap-2 my-2">
        <div className="flex-1 border-t border-border"></div>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {component.description}
        </span>
        <div className="flex-1 border-t border-border"></div>
      </div>
    );
  }

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
          <TabsList className="grid w-full grid-cols-3">
            {/* Basic and Data first */}
            {Object.entries(componentCategories).map(([key, data]) => (
              <TabsTrigger key={key} value={key} className="text-xs">
                {data.label}
              </TabsTrigger>
            ))}
            {/* All at the end */}
            <TabsTrigger value="all" className="text-xs">
              All
            </TabsTrigger>
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
