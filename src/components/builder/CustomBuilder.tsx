import React, { useEffect, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { BuilderHeader } from './BuilderHeader';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { BuilderCanvas } from './BuilderCanvas';
import { useBuilderStore } from '@/stores/builder';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import { toast } from 'sonner';
import './builder.css';

export const CustomBuilder: React.FC = () => {
  const {
    currentPageId,
    pages,
    isPreviewMode,
    deleteSelectedComponent,
    selectedComponentId,
    setSelectedComponentId,
    savePageToDatabase,
    moveComponent
  } = useBuilderStore();

  // Keyboard shortcuts integration
  useKeyboardShortcuts({
    onSave: async () => {
      if (currentPageId) {
        try {
          await savePageToDatabase(currentPageId);
          toast.success('Page saved successfully!');
        } catch (error) {
          toast.error('Failed to save page');
        }
      }
    }
  });

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeItem, setActiveItem] = useState<any>(null);

  // Mobile drawer state
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const currentPage = pages.find(page => page.id === currentPageId);

  // Configure drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px threshold to prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag start - store the active item for overlay
  const handleDragStart = (event: DragStartEvent) => {
    setActiveItem(event.active.data.current);
  };

  // Handle drag end - add component to canvas or reorder existing
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveItem(null);

    if (!over) return;

    const overData = over.data.current;
    const activeData = active.data.current;

    // Determine if this is an existing component being moved or new component from palette
    const isExistingComponent = activeData?.type === 'existing-component';
    const isNewComponent = activeData?.type && activeData.type !== 'existing-component';

    // Handle EXISTING component reordering on drop zones
    if (overData?.type === 'drop-zone' && isExistingComponent) {
      console.log('Reordering existing component to index:', overData.index);

      if (currentPageId && activeData.component) {
        moveComponent(
          currentPageId,
          activeData.component.id,  // Pass the component ID to move it
          activeData.component,
          overData.index,
          overData.parentId,
          activeData.parentId  // Source parent ID
        );
      }
      return;
    }

    // Handle NEW component drops on drop zones (from palette)
    if (overData?.type === 'drop-zone' && isNewComponent) {
      console.log('Dropped new component on drop zone:', overData.index);

      const newComponent = {
        id: `${Date.now()}-${Math.random()}`,
        type: activeData.type,
        props: {},
        styles: {},
        children: []
      };

      if (currentPageId) {
        moveComponent(
          currentPageId,
          null,  // null means it's a new component
          newComponent,
          overData.index,
          overData.parentId
        );
        setSelectedComponentId(newComponent.id);
      }
      return;
    }

    // Handle drops on empty canvas
    if (over.id === 'canvas-drop-zone' && isNewComponent) {
      console.log('Dropped component on empty canvas:', activeData.type);

      const newComponent = {
        id: `${Date.now()}-${Math.random()}`,
        type: activeData.type,
        props: {},
        styles: {},
        children: []
      };

      if (currentPageId) {
        moveComponent(currentPageId, null, newComponent, 0);
        setSelectedComponentId(newComponent.id);
      }
    }
  };

  // Keyboard event handling
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Save shortcut (Ctrl/Cmd + S)
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (currentPageId) {
          savePageToDatabase(currentPageId);
        }
        return;
      }

      // Delete component (Delete or Backspace)
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedComponentId) {
        // Only delete if not in an input field
        const activeElement = document.activeElement;
        const isInInput = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.hasAttribute('contenteditable')
        );

        if (!isInInput) {
          event.preventDefault();
          setShowDeleteDialog(true);
        }
        return;
      }

      // Escape to deselect
      if (event.key === 'Escape' && selectedComponentId) {
        setSelectedComponentId(null);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentPageId, selectedComponentId, savePageToDatabase, deleteSelectedComponent, setSelectedComponentId]);

  if (!currentPage) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">No Page Selected</h2>
          <p className="text-muted-foreground">Create or select a page to start building.</p>
        </div>
      </div>
    );
  }

  const handleDeleteConfirm = () => {
    deleteSelectedComponent();
    setShowDeleteDialog(false);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen flex flex-col bg-background">
        <BuilderHeader
          isMobile={isMobile}
          onToggleLeftSidebar={() => setLeftSidebarOpen(!leftSidebarOpen)}
          onToggleRightSidebar={() => setRightSidebarOpen(!rightSidebarOpen)}
        />

        <div className={`builder-layout ${isPreviewMode ? 'preview-mode' : 'design-mode'}`}>
          {/* Mobile backdrop - only show when a drawer is open */}
          {isMobile && (leftSidebarOpen || rightSidebarOpen) && (
            <div
              className="builder-backdrop"
              onClick={() => {
                setLeftSidebarOpen(false);
                setRightSidebarOpen(false);
              }}
            />
          )}

          {/* Left Sidebar - Components & Layers */}
          {!isPreviewMode && (
            <div className={cn(
              "builder-sidebar left-sidebar",
              isMobile && leftSidebarOpen && "open"
            )}>
              <LeftSidebar />
            </div>
          )}

          {/* Center - Canvas */}
          <div className="builder-canvas">
            <BuilderCanvas page={currentPage} />
          </div>

          {/* Right Sidebar - Properties & Styling */}
          {!isPreviewMode && (
            <div className={cn(
              "builder-sidebar right-sidebar",
              isMobile && rightSidebarOpen && "open"
            )}>
              <RightSidebar />
            </div>
          )}
        </div>

        <DeleteConfirmationDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleDeleteConfirm}
        />

        {/* Floating Edge Buttons - Mobile only */}
        {isMobile && !isPreviewMode && (
          <>
            {/* Left edge - Hamburger for Components/Layers */}
            <button
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              className="fixed left-0 top-1/2 -translate-y-1/2 z-50 w-12 h-16 bg-card border-r border-t border-b border-border rounded-r-lg shadow-md hover:shadow-lg transition-shadow flex items-center justify-center"
              aria-label="Toggle Components"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>

            {/* Right edge - Wrench for Properties/Styling */}
            <button
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              className="fixed right-0 top-1/2 -translate-y-1/2 z-50 w-12 h-16 bg-card border-l border-t border-b border-border rounded-l-lg shadow-md hover:shadow-lg transition-shadow flex items-center justify-center"
              aria-label="Toggle Properties"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Drag Overlay - Shows custom preview while dragging */}
      {/* CRITICAL: dropAnimation={null} prevents snap-back! */}
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-3 border-2 border-primary-500 opacity-90">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <span className="text-xs font-bold text-primary-600 dark:text-primary-400">
                  {activeItem.type?.charAt(0) || 'C'}
                </span>
              </div>
              <span className="font-bold text-sm">{activeItem.type || 'Component'}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};