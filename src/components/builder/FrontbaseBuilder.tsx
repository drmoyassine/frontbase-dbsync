import React from 'react';
import { Puck } from '@measured/puck';
import { ComponentPalette } from './ComponentPalette';
import { PropertiesPanel } from './PropertiesPanel';
import { BuilderHeader } from './BuilderHeader';
import { useBuilderStore } from '@/stores/builder';
import { puckConfig } from './puck-config';

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
    <Puck
      config={puckConfig}
      data={currentPage.layoutData || { content: [], root: {} }}
      onChange={(data) => {
        // Handle save - update page layout data
        useBuilderStore.getState().updatePage(currentPage.id, {
          layoutData: data
        });
      }}
    >
      <div className="h-screen flex flex-col bg-background">
        <BuilderHeader />
        
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Component Palette */}
          {!isPreviewMode && (
            <div className="w-80 border-r border-border bg-card">
              <div className="h-full overflow-y-auto">
                <ComponentPalette />
                <div className="border-t border-border mt-4 pt-4">
                  <h3 className="text-sm font-medium text-foreground mb-2 px-4">Components</h3>
                  <Puck.Components />
                </div>
              </div>
            </div>
          )}
          
          {/* Main Canvas */}
          <div className="flex-1 bg-muted/30">
            <Puck.Preview />
          </div>
          
          {/* Right Sidebar - Properties Panel */}
          {!isPreviewMode && (
            <div className="w-80 border-l border-border bg-card">
              <div className="h-full overflow-y-auto">
                <div className="p-4 border-b border-border">
                  <h3 className="text-sm font-medium text-foreground">Properties</h3>
                </div>
                <Puck.Fields />
              </div>
            </div>
          )}
        </div>
      </div>
    </Puck>
  );
};