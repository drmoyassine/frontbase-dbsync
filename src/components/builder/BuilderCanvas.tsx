import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useBuilderStore, type Page } from '@/stores/builder';
import { DraggableComponent } from './DraggableComponent';
import { CanvasGrid } from './CanvasGrid';
import { cn } from '@/lib/utils';
import { getDefaultProps } from '@/lib/componentDefaults';
import { stylesToCSS } from '@/lib/styles/converters';
import type { StylesData } from '@/types/builder';

interface BuilderCanvasProps {
  page: Page;
}

export const BuilderCanvas: React.FC<BuilderCanvasProps> = ({ page }) => {
  const {
    moveComponent,
    selectedComponentId,
    setSelectedComponentId,
    isPreviewMode,
    currentViewport,
    zoomLevel,
    showDeviceFrame,
    showGrid
  } = useBuilderStore();

  const components = page.layoutData?.content || [];
  const hasComponents = components.length > 0;

  // Empty canvas drop zone for initial component
  const { setNodeRef: setDropRef, isOver: isOverEmpty } = useDroppable({
    id: 'canvas-drop-zone',
    data: {
      accepts: ['component', 'existing-component', 'layer-component'],
      pageId: page.id
    },
    disabled: hasComponents
  });

  const handleComponentClick = (componentId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!isPreviewMode) {
      setSelectedComponentId(selectedComponentId === componentId ? null : componentId);
    }
  };

  // Viewport dimensions
  const getViewportDimensions = () => {
    switch (currentViewport) {
      case 'mobile': return { width: 375, height: 667 };
      case 'tablet': return { width: 768, height: 1024 };
      case 'desktop': return { width: 1200, height: 800 };
      default: return { width: 1200, height: 800 };
    }
  };

  const { width: viewportWidth, height: viewportHeight } = getViewportDimensions();
  const scaleFactor = zoomLevel / 100;

  // Convert NEW containerStyles format to inline CSS
  const getContainerCSS = (): React.CSSProperties => {
    const containerStyles = page.containerStyles;

    if (!containerStyles) {
      return { display: 'flex', flexDirection: 'column' };
    }

    const styles: React.CSSProperties = {};

    // Handle NEW StylesData format
    if ('activeProperties' in containerStyles && 'values' in containerStyles) {
      const stylesData = containerStyles as StylesData;
      const values = stylesData.values;

      // Flex direction
      if (values.flexDirection) {
        styles.display = 'flex';
        styles.flexDirection = values.flexDirection as any;
      }

      // Gap
      if (values.gap !== undefined) {
        styles.gap = typeof values.gap === 'number' ? `${values.gap}px` : values.gap;
      }

      // Flex wrap
      if (values.flexWrap) {
        styles.flexWrap = values.flexWrap as any;
      }

      // Align items
      if (values.alignItems) {
        styles.alignItems = values.alignItems as any;
      }

      // Justify content
      if (values.justifyContent) {
        styles.justifyContent = values.justifyContent as any;
      }

      // Background color
      if (values.backgroundColor) {
        styles.backgroundColor = values.backgroundColor;
      }

      // Padding
      if (values.padding) {
        const p = values.padding;
        if (typeof p === 'object' && 'top' in p) {
          styles.padding = `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
        }
      }

      // Width, height, etc.
      ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'].forEach(prop => {
        if (values[prop] !== undefined && values[prop] !== 'auto') {
          (styles as any)[prop] = typeof values[prop] === 'number' ? `${values[prop]}px` : values[prop];
        }
      });

      // Typography
      if (values.fontSize) styles.fontSize = `${values.fontSize}px`;
      if (values.fontWeight) styles.fontWeight = values.fontWeight;
      if (values.lineHeight) styles.lineHeight = values.lineHeight;
      if (values.textAlign) styles.textAlign = values.textAlign as any;
      if (values.color) styles.color = values.color;

      // Effects
      if (values.opacity) styles.opacity = values.opacity;
      if (values.borderRadius) styles.borderRadius = `${values.borderRadius}px`;
      if (values.borderWidth) styles.borderWidth = `${values.borderWidth}px`;
      if (values.borderStyle) styles.borderStyle = values.borderStyle as any;
      if (values.borderColor) styles.borderColor = values.borderColor;
      if (values.boxShadow && typeof values.boxShadow === 'object') {
        const { x, y, blur, spread, color } = values.boxShadow;
        styles.boxShadow = `${x}px ${y}px ${blur}px ${spread}px ${color}`;
      }
    } else {
      // Handle OLD ContainerStyles format for backward compatibility
      const oldStyles = containerStyles as any;

      if (oldStyles.orientation) {
        styles.display = 'flex';
        styles.flexDirection = oldStyles.orientation;
      }

      if (oldStyles.gap !== undefined) {
        styles.gap = `${oldStyles.gap}px`;
      }

      if (oldStyles.flexWrap) {
        styles.flexWrap = oldStyles.flexWrap;
      }

      if (oldStyles.alignItems) {
        const alignMap: Record<string, string> = {
          'start': 'flex-start',
          'center': 'center',
          'end': 'flex-end',
          'stretch': 'stretch'
        };
        styles.alignItems = alignMap[oldStyles.alignItems] || oldStyles.alignItems;
      }

      if (oldStyles.justifyContent) {
        const justifyMap: Record<string, string> = {
          'start': 'flex-start',
          'center': 'center',
          'end': 'flex-end',
          'between': 'space-between',
          'around': 'space-around'
        };
        styles.justifyContent = justifyMap[oldStyles.justifyContent] || oldStyles.justifyContent;
      }

      if (oldStyles.backgroundColor) {
        styles.backgroundColor = oldStyles.backgroundColor;
      }

      if (oldStyles.padding) {
        const { top, right, bottom, left } = oldStyles.padding;
        styles.padding = `${top}px ${right}px ${bottom}px ${left}px`;
      }
    }

    console.log('🎨 [Canvas] Applied container styles:', styles);
    return styles;
  };

  return (
    <div
      className="min-h-full p-8 bg-muted/30 transition-colors relative overflow-auto"
      style={{ minHeight: '400px' }}
      onClick={(e) => {
        // Only deselect if clicking on outer wrapper, not canvas content
        if (e.target === e.currentTarget && !isPreviewMode) {
          setSelectedComponentId(null);
        }
      }}
    >
      {/* Grid Overlay */}
      {showGrid && <CanvasGrid visible={showGrid} />}

      {/* Device Frame / Viewport Container */}
      <div
        className={cn(
          "mx-auto transition-all duration-300 relative",
          showDeviceFrame && "shadow-2xl rounded-lg overflow-hidden"
        )}
        style={{
          width: `${viewportWidth}px`,
          minHeight: `${viewportHeight}px`,
          transform: `scale(${scaleFactor})`,
          transformOrigin: 'top center'
        }}
      >
        {/* Canvas Content with Container Styles - No onClick here */}
        <div
          ref={hasComponents ? undefined : setDropRef}
          className={cn(
            "min-h-full",
            !hasComponents && isOverEmpty && "bg-blue-50/50 border-2 border-dashed border-blue-400"
          )}
          style={getContainerCSS()}
        >
          {!hasComponents && (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-12">
              <div className="text-5xl mb-4">📄</div>
              <h3 className="text-xl font-semibold mb-2">Empty Canvas</h3>
              <p className="text-muted-foreground">
                Drag components from the left panel to start building your page
              </p>
            </div>
          )}

          {components.map((component, index) => (
            <DraggableComponent
              key={component.id}
              component={component}
              index={index}
              pageId={page.id}
              isSelected={selectedComponentId === component.id}
              onSelect={handleComponentClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
