import React, { useEffect, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { BuilderHeader } from './BuilderHeader';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { BuilderCanvas } from './BuilderCanvas';
import { useBuilderStore } from '@/stores/builder';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import './builder.css';

export const CustomBuilder: React.FC = () => {
  const { 
    currentPageId, 
    pages, 
    isPreviewMode,
    deleteSelectedComponent,
    selectedComponentId,
    setSelectedComponentId,
    savePageToDatabase
  } = useBuilderStore();
  
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  const currentPage = pages.find(page => page.id === currentPageId);

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
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col bg-background">
        <BuilderHeader />
        
        <div className={`builder-layout ${isPreviewMode ? 'preview-mode' : 'design-mode'}`}>
          {/* Left Sidebar - Components & Layers */}
          {!isPreviewMode && (
            <div className="builder-sidebar left-sidebar">
              <LeftSidebar />
            </div>
          )}

          {/* Center - Canvas */}
          <div className="builder-canvas">
            <BuilderCanvas page={currentPage} />
          </div>

          {/* Right Sidebar - Properties & Styling */}
          {!isPreviewMode && (
            <div className="builder-sidebar right-sidebar">
              <RightSidebar />
            </div>
          )}
        </div>

        <DeleteConfirmationDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleDeleteConfirm}
        />
      </div>
    </DndProvider>
  );
};