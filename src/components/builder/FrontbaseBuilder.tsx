import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Puck } from '@measured/puck';
import { ComponentPalette } from './ComponentPalette';
import { PropertiesPanel } from './PropertiesPanel';
import { BuilderHeader } from './BuilderHeader';
import { useBuilderStore } from '@/stores/builder';
import { puckConfig } from './puck-config';
import './builder.css';

export const FrontbaseBuilder: React.FC = () => {
  const { 
    currentPageId, 
    pages, 
    isPreviewMode, 
    setPreviewMode 
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
        
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Component Palette */}
          {!isPreviewMode && (
            <div className="w-80 border-r border-border bg-card">
              <ComponentPalette />
            </div>
          )}
          
          {/* Main Canvas */}
          <div className="flex-1 bg-muted/30">
            <Puck
              config={puckConfig}
              data={currentPage.layoutData || { content: [], root: {} }}
              onChange={(data) => {
                // Handle save - update page layout data
                useBuilderStore.getState().updatePage(currentPage.id, {
                  layoutData: data
                });
              }}
              overrides={{
                header: () => null,
                headerActions: () => null,
                outline: () => null,
              }}
              viewports={[
                { width: 1200, height: 'auto', label: 'Desktop' },
                { width: 768, height: 'auto', label: 'Tablet' },
                { width: 375, height: 'auto', label: 'Mobile' },
              ]}
            />
          </div>
          
          {/* Right Sidebar - Properties Panel */}
          {!isPreviewMode && (
            <div className="w-80 border-l border-border bg-card">
              <PropertiesPanel />
            </div>
          )}
        </div>
      </div>
    </DndProvider>
  );
};