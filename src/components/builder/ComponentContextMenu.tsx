import React from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useBuilderStore } from '@/stores/builder';
import { Copy, Trash2, CopyPlus, ArrowUp, ArrowDown } from 'lucide-react';

interface ComponentContextMenuProps {
  componentId: string;
  componentType: string;
  children: React.ReactNode;
  disabled?: boolean;
}

/**
 * Right-click context menu for canvas components.
 * Surfaces common actions: Duplicate, Delete, Move Up/Down.
 * Only renders in builder mode (disabled in preview mode).
 */
export const ComponentContextMenu: React.FC<ComponentContextMenuProps> = ({
  componentId,
  componentType,
  children,
  disabled = false,
}) => {
  const {
    duplicateComponent,
    removeComponent,
    selectedComponentId,
    setSelectedComponentId,
  } = useBuilderStore();

  if (disabled) {
    return <>{children}</>;
  }

  const handleDuplicate = () => {
    duplicateComponent(componentId);
  };

  const handleDelete = () => {
    removeComponent(componentId);
    if (selectedComponentId === componentId) {
      setSelectedComponentId(null);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={handleDuplicate}>
          <CopyPlus className="h-4 w-4 mr-2" />
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {componentType}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
