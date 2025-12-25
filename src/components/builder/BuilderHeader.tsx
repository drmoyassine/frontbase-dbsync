import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Eye,
  EyeOff,
  Save,
  Globe,
  Layers,
  Database,
  ArrowLeft,
  Smartphone,
  Tablet,
  Monitor,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useBuilderStore } from '@/stores/builder';
import { PageSelector } from './PageSelector';
import { PageSettings } from './PageSettings';
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';

export const BuilderHeader: React.FC = () => {
  const navigate = useNavigate();
  const {
    project,
    currentPageId,
    pages,
    isPreviewMode,
    setPreviewMode,
    isSupabaseConnected,
    selectedComponentId,
    isSaving,
    hasUnsavedChanges,
    currentViewport,
    zoomLevel,
    setCurrentViewport,
    setZoomLevel,
    savePageToDatabase,
    publishPage,
    togglePageVisibility,
    deleteSelectedComponent
  } = useBuilderStore();

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  const currentPage = pages.find(page => page.id === currentPageId);

  const handleSave = async () => {
    if (currentPageId) {
      await savePageToDatabase(currentPageId);
    }
  };

  const handlePublish = async () => {
    if (currentPageId) {
      await publishPage(currentPageId);
    }
  };

  const handleToggleVisibility = async () => {
    if (currentPageId) {
      await togglePageVisibility(currentPageId);
    }
  };

  const handleDeleteComponent = () => {
    deleteSelectedComponent();
  };

  const handleNavigateToDatabase = () => {
    navigate('/data-studio');
  };

  const handleBackToDashboard = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
    } else {
      navigate('/pages');
    }
  };

  const handleSaveAndNavigate = async () => {
    if (currentPageId) {
      await handleSave();
    }
    navigate('/pages');
    setShowUnsavedDialog(false);
  };

  const handleDiscardAndNavigate = () => {
    navigate('/pages');
    setShowUnsavedDialog(false);
  };

  return (
    <header className="relative h-14 bg-card border-b border-border flex items-center px-4">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={handleBackToDashboard}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">Frontbase</span>
        </div>

        <div className="h-6 w-px bg-border" />

        <PageSelector />

        {currentPage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleVisibility}
            className="h-auto p-1"
          >
            <Badge
              variant={currentPage.isPublic ? "default" : "secondary"}
              className="cursor-pointer"
            >
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
          </Button>
        )}
      </div>

      {/* Center Section - Responsive Controls */}
      <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-3">
        {/* Viewport Selection */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          <Button
            variant={currentViewport === 'mobile' ? "default" : "ghost"}
            size="sm"
            onClick={() => setCurrentViewport('mobile')}
            className="h-8 w-8 p-0"
          >
            <Smartphone className="h-4 w-4" />
          </Button>
          <Button
            variant={currentViewport === 'tablet' ? "default" : "ghost"}
            size="sm"
            onClick={() => setCurrentViewport('tablet')}
            className="h-8 w-8 p-0"
          >
            <Tablet className="h-4 w-4" />
          </Button>
          <Button
            variant={currentViewport === 'desktop' ? "default" : "ghost"}
            size="sm"
            onClick={() => setCurrentViewport('desktop')}
            className="h-8 w-8 p-0"
          >
            <Monitor className="h-4 w-4" />
          </Button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoomLevel(Math.max(25, zoomLevel - 25))}
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
            onClick={() => setZoomLevel(Math.min(200, zoomLevel + 25))}
            disabled={zoomLevel >= 200}
            className="h-8 w-8 p-0"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-3 ml-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNavigateToDatabase}
          className="h-auto p-1"
        >
          <Badge
            variant={isSupabaseConnected ? "default" : "outline"}
            className="gap-1 cursor-pointer"
          >
            <Database className="h-3 w-3" />
            {isSupabaseConnected ? "Connected" : "No Database"}
          </Badge>
        </Button>


        <div className="flex items-center gap-2">
          {!isSaving && !hasUnsavedChanges && (
            <Badge variant="outline" className="text-xs text-green-600 border-green-500">
              Synced
            </Badge>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className={hasUnsavedChanges ? "border-orange-500 text-orange-600" : ""}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save*' : 'Save'}
          </Button>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" disabled={isSaving}>
              <Play className="h-4 w-4 mr-2" />
              Publish
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish Page</AlertDialogTitle>
              <AlertDialogDescription>
                This will make your page publicly accessible. Are you sure you want to publish it?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handlePublish}>
                Publish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <PageSettings />
      </div>

      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        onSaveAndContinue={handleSaveAndNavigate}
        onDiscardAndContinue={handleDiscardAndNavigate}
      />
    </header>
  );
};