import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Monitor, Tablet, Smartphone, Copy } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { ComponentStyles } from '@/types/styles';

interface ResponsiveStylePanelProps {
  selectedComponent: any;
  updateComponentStyle: (property: string, value: string, viewport?: 'mobile' | 'tablet' | 'desktop') => void;
  children: React.ReactNode;
}

const VIEWPORT_CONFIG = {
  desktop: { icon: Monitor, label: 'Desktop', color: 'bg-blue-500' },
  tablet: { icon: Tablet, label: 'Tablet', color: 'bg-green-500' },
  mobile: { icon: Smartphone, label: 'Mobile', color: 'bg-orange-500' }
};

export const ResponsiveStylePanel: React.FC<ResponsiveStylePanelProps> = ({
  selectedComponent,
  updateComponentStyle,
  children
}) => {
  const { currentViewport, setCurrentViewport } = useBuilderStore();

  const hasResponsiveStyles = (viewport: string) => {
    return selectedComponent.responsiveStyles?.[viewport] && 
           Object.keys(selectedComponent.responsiveStyles[viewport]).length > 0;
  };

  const copyStylesToViewport = (fromViewport: string, toViewport: string) => {
    const sourceStyles = fromViewport === 'base' 
      ? selectedComponent.styles || {}
      : selectedComponent.responsiveStyles?.[fromViewport] || {};

    Object.entries(sourceStyles).forEach(([property, value]) => {
      if (value) {
        updateComponentStyle(property, value as string, toViewport as 'mobile' | 'tablet' | 'desktop');
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Viewport Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Responsive Breakpoints</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Copy current viewport styles to all other viewports
              const currentStyles = currentViewport === 'desktop' 
                ? selectedComponent.styles || {}
                : selectedComponent.responsiveStyles?.[currentViewport] || {};
              
              Object.entries(VIEWPORT_CONFIG).forEach(([viewport]) => {
                if (viewport !== currentViewport) {
                  Object.entries(currentStyles).forEach(([property, value]) => {
                    if (value) {
                      updateComponentStyle(property, value as string, viewport as 'mobile' | 'tablet' | 'desktop');
                    }
                  });
                }
              });
            }}
          >
            <Copy className="h-4 w-4 mr-1" />
            Copy to All
          </Button>
        </div>
        
        <Tabs value={currentViewport} onValueChange={(value) => setCurrentViewport(value as any)}>
          <TabsList className="grid w-full grid-cols-3">
            {Object.entries(VIEWPORT_CONFIG).map(([key, config]) => {
              const IconComponent = config.icon;
              const hasStyles = hasResponsiveStyles(key);
              
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="flex items-center gap-2 relative"
                >
                  <IconComponent className="h-4 w-4" />
                  <span className="hidden sm:inline">{config.label}</span>
                  {hasStyles && (
                    <div className={`absolute -top-1 -right-1 w-2 h-2 ${config.color} rounded-full`} />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
          
          {/* Current viewport indicator */}
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Editing: {VIEWPORT_CONFIG[currentViewport].label}
            </Badge>
            {hasResponsiveStyles(currentViewport) && (
              <Badge variant="secondary" className="text-xs">
                Has custom styles
              </Badge>
            )}
          </div>
        </Tabs>
      </div>

      {/* Style Controls */}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
};