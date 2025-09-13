import React from 'react';
import { Puck } from '@measured/puck';
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
        
        <div className={`builder-layout ${isPreviewMode ? 'preview-mode' : 'design-mode'}`}>
          {/* Left Sidebar - Native Puck Components */}
          {!isPreviewMode && (
            <div className="builder-sidebar left-sidebar">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Components</h2>
              </div>
              <div className="puck-components-wrapper">
                <Puck.Components />
              </div>
            </div>
          )}

          {/* Center - Canvas */}
          <div className="builder-canvas">
            <Puck.Preview />
          </div>

          {/* Right Sidebar - Properties Panel */}
          {!isPreviewMode && (
            <div className="builder-sidebar right-sidebar">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Properties</h2>
              </div>
              <div className="puck-fields-wrapper">
                <Puck.Fields />
              </div>
            </div>
          )}
        </div>
      </div>
    </Puck>
  );
};