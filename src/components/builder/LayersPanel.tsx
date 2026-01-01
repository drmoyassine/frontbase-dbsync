import React, { useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBuilderStore } from '@/stores/builder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Search,
  MoreHorizontal,
  Trash2,
  Copy,
  GripVertical
} from 'lucide-react';
import { ComponentData } from '@/stores/builder';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const LayersPanel: React.FC = () => {
  const {
    currentPageId,
    pages,
    selectedComponentId,
    setSelectedComponentId,
    updatePage
  } = useBuilderStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set());

  const currentPage = pages.find(page => page.id === currentPageId);
  const components = currentPage?.layoutData?.content || [];

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleExpanded = (componentId: string) => {
    const newExpanded = new Set(expandedComponents);
    if (newExpanded.has(componentId)) {
      newExpanded.delete(componentId);
    } else {
      newExpanded.add(componentId);
    }
    setExpandedComponents(newExpanded);
  };

  const getComponentIcon = (type: string) => {
    const iconMap: Record<string, string> = {
      'Button': '🔘',
      'Text': '📝',
      'Heading': '📋',
      'Container': '📦',
      'Card': '🃏',
      'Image': '🖼️',
      'Link': '🔗',
      'Input': '📝',
      'Textarea': '📄',
      'Select': '📋',
      'Checkbox': '☑️',
      'Switch': '🔘',
      'Form': '📋',
      'DataTable': '📊',
    };
    return iconMap[type] || '🔲';
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !currentPage || !currentPageId) {
      return;
    }

    const activeIndex = components.findIndex(c => c.id === active.id);
    const overIndex = components.findIndex(c => c.id === over.id);

    if (activeIndex === -1 || overIndex === -1) {
      return;
    }

    // Reorder components
    const reorderedComponents = arrayMove(components, activeIndex, overIndex);

    // Update page with new component order
    updatePage(currentPageId, {
      layoutData: {
        ...currentPage.layoutData,
        content: reorderedComponents
      }
    });
  };

  const filteredComponents = components.filter(component =>
    component.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search layers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {/* Layers List */}
      <div className="flex-1 overflow-auto p-2">
        {filteredComponents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No layers found</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredComponents.map(c => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {filteredComponents.map((component, index) => (
                <SortableLayerItem
                  key={component.id}
                  component={component}
                  index={index}
                  isSelected={selectedComponentId === component.id}
                  isExpanded={expandedComponents.has(component.id)}
                  onSelect={() => setSelectedComponentId(component.id)}
                  onToggleExpand={() => toggleExpanded(component.id)}
                  getComponentIcon={getComponentIcon}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
};

interface SortableLayerItemProps {
  component: ComponentData;
  index: number;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  getComponentIcon: (type: string) => string;
}

const SortableLayerItem: React.FC<SortableLayerItemProps> = ({
  component,
  index,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  getComponentIcon
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: component.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasChildren = component.children && component.children.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 rounded",
        "hover:bg-accent",
        isSelected && "bg-accent border-l-2 border-primary"
      )}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Expand/Collapse */}
      {hasChildren ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleExpand}
          className="h-5 w-5 p-0"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      ) : (
        <div className="w-5" />
      )}

      {/* Icon & Name */}
      <div
        className="flex-1 flex items-center gap-2 cursor-pointer"
        onClick={onSelect}
      >
        <span className="text-sm">{getComponentIcon(component.type)}</span>
        <span className="text-sm font-medium truncate">
          {component.type}
        </span>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};