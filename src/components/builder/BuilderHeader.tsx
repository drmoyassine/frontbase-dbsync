import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Play, 
  Eye, 
  EyeOff, 
  Save, 
  Settings, 
  Globe,
  Layers,
  Database
} from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { PageSelector } from './PageSelector';
import { ProjectSettings } from './ProjectSettings';

export const BuilderHeader: React.FC = () => {
  const { 
    project, 
    currentPageId, 
    pages, 
    isPreviewMode, 
    setPreviewMode,
    isSupabaseConnected 
  } = useBuilderStore();
  
  const currentPage = pages.find(page => page.id === currentPageId);

  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">Frontbase</span>
        </div>
        
        <div className="h-6 w-px bg-border" />
        
        <PageSelector />
        
        {currentPage && (
          <Badge variant={currentPage.isPublic ? "default" : "secondary"}>
            {currentPage.isPublic ? (
              <>
                <Globe className="h-3 w-3 mr-1" />
                Public
              </>
            ) : (
              <>
                <EyeOff className="h-3 w-3 mr-1" />
                Private
              </>
            )}
          </Badge>
        )}
      </div>

      {/* Center Section */}
      <div className="flex items-center gap-2">
        <Button
          variant={isPreviewMode ? "default" : "outline"}
          size="sm"
          onClick={() => setPreviewMode(!isPreviewMode)}
        >
          {isPreviewMode ? (
            <>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </>
          ) : (
            <>
              <Layers className="h-4 w-4 mr-2" />
              Design
            </>
          )}
        </Button>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-3">
        <Badge 
          variant={isSupabaseConnected ? "default" : "outline"}
          className="gap-1"
        >
          <Database className="h-3 w-3" />
          {isSupabaseConnected ? "Connected" : "No Database"}
        </Badge>
        
        <Button variant="outline" size="sm">
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
        
        <Button size="sm">
          <Play className="h-4 w-4 mr-2" />
          Publish
        </Button>
        
        <ProjectSettings />
      </div>
    </header>
  );
};