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
import { findComponentWithParent, removeComponentFromTree, insertComponentIntoTree } from '@/lib/tree-utils';
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
    updatePage,
    removeComponent,
    duplicateComponent
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

    const content = currentPage.layoutData?.content || [];

    // Find both components in the tree (works for nested components)
    const activeResult = findComponentWithParent(content, String(active.id));
    const overResult = findComponentWithParent(content, String(over.id));

    if (!activeResult || !overResult) {
      return;
    }

    // Only allow reordering within the same parent (same level)
    const activeParentId = activeResult.parent?.id ?? null;
    const overParentId = overResult.parent?.id ?? null;

    if (activeParentId !== overParentId) {
      // Different parents - don't allow cross-parent moves for now
      console.log('Cannot move between different parents');
      return;
    }

    // Same parent - reorder within siblings
    const siblings = activeResult.siblings;
    const activeIndex = activeResult.index;
    const overIndex = overResult.index;

    // Create deep copy of content and reorder
    const deepClone = (arr: ComponentData[]): ComponentData[] =>
      arr.map(c => ({ ...c, children: c.children ? deepClone(c.children) : undefined }));

    let newContent = deepClone(content);

    if (activeParentId === null) {
      // Top-level reorder
      newContent = arrayMove(newContent, activeIndex, overIndex);
    } else {
      // Nested reorder - find parent and reorder its children
      const updateChildren = (items: ComponentData[]): ComponentData[] => {
        return items.map(item => {
          if (item.id === activeParentId && item.children) {
            return { ...item, children: arrayMove(item.children, activeIndex, overIndex) };
          }
          if (item.children) {
            return { ...item, children: updateChildren(item.children) };
          }
          return item;
        });
      };
      newContent = updateChildren(newContent);
    }

    // Update page with new component order
    updatePage(currentPageId, {
      layoutData: {
        ...currentPage.layoutData,
        content: newContent
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
                  depth={0}
                  isSelected={selectedComponentId === component.id}
                  isExpanded={expandedComponents.has(component.id)}
                  expandedComponents={expandedComponents}
                  onSelect={() => setSelectedComponentId(component.id)}
                  onToggleExpand={() => toggleExpanded(component.id)}
                  onSelectChild={(id: string) => setSelectedComponentId(id)}
                  onToggleExpandChild={(id: string) => toggleExpanded(id)}
                  getComponentIcon={getComponentIcon}
                  onDelete={(id) => removeComponent(id)}
                  onDuplicate={(id) => duplicateComponent(id)}
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
  depth?: number;
  isSelected: boolean;
  isExpanded: boolean;
  expandedComponents: Set<string>;
  onSelect: () => void;
  onToggleExpand: () => void;
  onSelectChild: (id: string) => void;
  onToggleExpandChild: (id: string) => void;
  getComponentIcon: (type: string) => string;
  onDelete: (componentId: string) => void;
  onDuplicate: (componentId: string) => void;
}

const SortableLayerItem: React.FC<SortableLayerItemProps> = ({
  component,
  index,
  depth = 0,
  isSelected,
  isExpanded,
  expandedComponents,
  onSelect,
  onToggleExpand,
  onSelectChild,
  onToggleExpandChild,
  getComponentIcon,
  onDelete,
  onDuplicate
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
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "group flex items-center gap-2 px-2 py-1.5 rounded",
          "hover:bg-accent",
          isSelected && "bg-accent border-l-2 border-primary"
        )}
      >
        {/* Indentation for depth */}
        {depth > 0 && <div style={{ width: depth * 16 }} />}

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
            <DropdownMenuItem onClick={() => onDuplicate(component.id)}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(component.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Render children when expanded */}
      {isExpanded && hasChildren && (
        <div className="ml-2">
          {component.children!.map((child, childIndex) => (
            <SortableLayerItem
              key={child.id}
              component={child}
              index={childIndex}
              depth={depth + 1}
              isSelected={expandedComponents.has('selected-' + child.id)}
              isExpanded={expandedComponents.has(child.id)}
              expandedComponents={expandedComponents}
              onSelect={() => onSelectChild(child.id)}
              onToggleExpand={() => onToggleExpandChild(child.id)}
              onSelectChild={onSelectChild}
              onToggleExpandChild={onToggleExpandChild}
              getComponentIcon={getComponentIcon}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
            />
          ))}
        </div>
      )}
    </>
  );
};