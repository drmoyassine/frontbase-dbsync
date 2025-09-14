import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Monitor, 
  Tablet, 
  Smartphone, 
  ZoomIn, 
  ZoomOut, 
  Eye, 
  EyeOff,
  Search
} from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { cn } from '@/lib/utils';

const VIEWPORT_CONFIG = {
  mobile: { icon: Smartphone, label: 'Mobile', width: 375 },
  tablet: { icon: Tablet, label: 'Tablet', width: 768 },
  desktop: { icon: Monitor, label: 'Desktop', width: 1200 }
};

export const ResponsiveToolbar: React.FC = () => {
  const { 
    currentViewport, 
    zoomLevel, 
    isPreviewMode, 
    showDeviceFrame,
    setCurrentViewport, 
    setZoomLevel, 
    setPreviewMode,
    setShowDeviceFrame
  } = useBuilderStore();

  const handleZoomIn = () => setZoomLevel(zoomLevel + 25);
  const handleZoomOut = () => setZoomLevel(zoomLevel - 25);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-card border-b border-border">
      {/* Viewport Selection */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
        {Object.entries(VIEWPORT_CONFIG).map(([key, config]) => {
          const IconComponent = config.icon;
          const isActive = currentViewport === key;
          
          return (
            <Button
              key={key}
              variant={isActive ? "default" : "ghost"}
              size="sm"
              onClick={() => setCurrentViewport(key as any)}
              className={cn(
                "h-8 px-2",
                isActive && "shadow-sm"
              )}
            >
              <IconComponent className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">{config.label}</span>
            </Button>
          );
        })}
      </div>

      {/* Device Frame Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowDeviceFrame(!showDeviceFrame)}
        className="h-8"
      >
        <Monitor className="h-4 w-4" />
        <span className="ml-1 hidden sm:inline">Frame</span>
      </Button>

      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomOut}
          disabled={zoomLevel <= 25}
          className="h-8 w-8 p-0"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        
        <Badge variant="outline" className="min-w-16 justify-center">
          {zoomLevel}%
        </Badge>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomIn}
          disabled={zoomLevel >= 200}
          className="h-8 w-8 p-0"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Search Input */}
      <div className="relative flex-1 max-w-64">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search components..."
          className="pl-9 h-8"
        />
      </div>

      {/* Preview Toggle */}
      <Button
        variant={isPreviewMode ? "default" : "outline"}
        size="sm"
        onClick={() => setPreviewMode(!isPreviewMode)}
        className="h-8"
      >
        {isPreviewMode ? (
          <>
            <Eye className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">Preview</span>
          </>
        ) : (
          <>
            <EyeOff className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">Design</span>
          </>
        )}
      </Button>
    </div>
  );
};