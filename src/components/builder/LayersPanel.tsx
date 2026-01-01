import React, { useState } from 'react';
// TODO: Migrate to @dnd-kit - temporarily stubbed with proper types
// import { useDrag, useDrop } from 'react-dnd';
const useDrag = (spec: any, deps?: any[]) => [{ isDragging: false }, (node: any) => { }, (node: any) => { }] as const;
const useDrop = (spec: any, deps?: any[]) => [{ isOver: false, canDrop: false, isOverContainer: false }, (node: any) => { }] as const;

import { useBuilderStore } from '@/stores/builder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { shouldRenderDropZone, calculateValidDropZones } from '@/lib/dropZoneUtils';
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
    moveComponent,
    draggedComponentId,
    setDraggedComponentId
  } = useBuilderStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set());

  const currentPage = pages.find(page => page.id === currentPageId);
  const components = currentPage?.layoutData?.content || [];

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
    };
    return iconMap[type] || '🔲';
  };

  const ComponentItem: React.FC<{
    component: ComponentData;
    level: number;
    parentId?: string;
    index: number;
  }> = ({ component, level, parentId, index }) => {
    const hasChildren = component.children && component.children.length > 0;
    const isExpanded = expandedComponents.has(component.id);
    const isSelected = selectedComponentId === component.id;

    // Drag functionality
    const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
      type: 'layer-component',
      item: () => {
        // Set drag state immediately when drag begins
        setDraggedComponentId(component.id);
        return {
          id: component.id,
          index,
          parentId,
          component,
          level
        };
      },
      end: () => {
        // Clear drag state immediately when drag ends
        setDraggedComponentId(null);
      },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }), [component.id, index, parentId, component, level, setDraggedComponentId]);

    // Get sibling components for validation
    const currentPage = pages.find(p => p.id === currentPageId);
    const siblingComponents = parentId
      ? currentPage?.layoutData?.content?.find(c => c.id === parentId)?.children || []
      : currentPage?.layoutData?.content || [];

    // Check if drop zone should be rendered
    const shouldShowDropZone = shouldRenderDropZone(
      component.id,
      index,
      draggedComponentId,
      siblingComponents,
      'above'
    );

    // Drop functionality
    const [{ isOver, canDrop }, drop] = useDrop({
      accept: 'layer-component',
      drop: (item: any, monitor) => {
        if (!monitor.didDrop() && item.id !== component.id) {
          // Use smart drop zone validation
          const validZones = calculateValidDropZones({
            draggedComponentId: item.id,
            siblingComponents,
            parentId
          });

          // Find the appropriate drop zone for this index
          const validZone = validZones.find(zone => zone.index === index);
          if (validZone) {
            moveComponent(currentPageId!, item.id, item.component, validZone.index, parentId, item.parentId);
          }
        }
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
        canDrop: monitor.canDrop(),
      }),
    });

    // Container drop functionality
    const [{ isOverContainer }, dropContainer] = useDrop({
      accept: 'layer-component',
      drop: (item: any, monitor) => {
        if (!monitor.didDrop() && item.id !== component.id && (component.type === 'Container' || hasChildren)) {
          // Drop inside this component
          const childIndex = component.children?.length || 0;
          moveComponent(currentPageId!, item.id, item.component, childIndex, component.id, item.parentId);
        }
      },
      collect: (monitor) => ({
        isOverContainer: monitor.isOver({ shallow: true }),
      }),
      canDrop: (item) => component.type === 'Container' || hasChildren,
    });

    const ref = (node: HTMLDivElement | null) => {
      drag(node);
      drop(node);
      if (component.type === 'Container' || hasChildren) {
        dropContainer(node);
      }
    };

    return (
      <div>
        {/* Drop indicator above - only for valid drop zones */}
        {isOver && canDrop && shouldShowDropZone && (
          <div className="h-0.5 bg-primary mx-2 rounded" />
        )}

        <div
          ref={ref}
          className={cn(
            'flex items-center gap-1 py-1 px-2 rounded-sm cursor-pointer hover:bg-accent/50 group transition-all',
            isSelected && 'bg-accent text-accent-foreground',
            isDragging && 'opacity-50',
            isOverContainer && (component.type === 'Container' || hasChildren) && 'bg-primary/10 ring-1 ring-primary/30',
            'text-sm'
          )}
          style={{ paddingLeft: `${8 + level * 16}px` }}
          onClick={() => setSelectedComponentId(isSelected ? null : component.id)}
        >
          {/* Drag handle */}
          <div
            ref={dragPreview}
            className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>

          {hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(component.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          ) : (
            <div className="w-4" />
          )}

          <span className="text-xs mr-1">{getComponentIcon(component.type)}</span>

          <span className="flex-1 truncate">
            {component.props?.children || component.props?.text || component.type}
          </span>

          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
              <Eye className="h-3 w-3" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Copy className="h-3 w-3 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {component.children!.map((child, childIndex) => (
              <ComponentItem
                key={child.id}
                component={child}
                level={level + 1}
                parentId={component.id}
                index={childIndex}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const filteredComponents = components.filter(component =>
    searchTerm === '' ||
    component.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (component.props?.children && component.props.children.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold text-foreground mb-3">Page Layers</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search layers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Layer Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredComponents.length > 0 ? (
          <div className="space-y-1">
            {filteredComponents.map((component, index) => (
              <ComponentItem
                key={component.id}
                component={component}
                level={0}
                index={index}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            {searchTerm ? (
              <>No components found for "{searchTerm}"</>
            ) : (
              <>No components on this page</>
            )}
          </div>
        )}
      </div>
    </div>
  );
};