import React, { useEffect } from 'react';
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
  Trash2
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
    savePageToDatabase,
    publishPage,
    togglePageVisibility,
    deleteSelectedComponent
  } = useBuilderStore();
  
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
    navigate('/dashboard/database');
  };

  const handleBackToDashboard = () => {
    navigate('/dashboard/pages');
  };

  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={handleBackToDashboard}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Pages
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
        
        {/* Delete Component Button - only show when component is selected */}
        {selectedComponentId && !isPreviewMode && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Component</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this component? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteComponent}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleSave}
          disabled={isSaving}
        >
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
        
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
    </header>
  );
};