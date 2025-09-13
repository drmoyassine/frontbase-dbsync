import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { BuilderHeader } from './BuilderHeader';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { BuilderCanvas } from './BuilderCanvas';
import { useBuilderStore } from '@/stores/builder';
import './builder.css';

export const CustomBuilder: React.FC = () => {
  const { 
    currentPageId, 
    pages, 
    isPreviewMode 
  } = useBuilderStore();
  
  const currentPage = pages.find(page => page.id === currentPageId);
  
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
      </div>
    </DndProvider>
  );
};