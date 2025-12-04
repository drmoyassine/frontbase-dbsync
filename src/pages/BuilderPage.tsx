import React, { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { FrontbaseBuilder } from '@/components/builder/FrontbaseBuilder';
import { useBuilderStore } from '@/stores/builder';
import { toast } from '@/hooks/use-toast';

const BuilderPage: React.FC = () => {
  const { pageId } = useParams<{ pageId: string }>();
  const {
    pages,
    setCurrentPageId,
    currentPageId,
    loadPagesFromDatabase,
    createPageInDatabase,
    isLoading
  } = useBuilderStore();

  useEffect(() => {
    // Load pages from database on component mount
    const initializeBuilder = async () => {
      try {
        await loadPagesFromDatabase();
      } catch (error) {
        console.error('Failed to load pages:', error);
        toast({
          title: "Error loading pages",
          description: "Failed to load pages from database",
          variant: "destructive"
        });
      }
    };

    initializeBuilder();
  }, [loadPagesFromDatabase]);

  useEffect(() => {
    if (pageId && pageId !== currentPageId) {
      // Check if page exists in loaded pages
      const pageExists = pages.find(page => page.id === pageId);
      if (pageExists) {
        setCurrentPageId(pageId);
      } else if (pages.length > 0) {
        // Page doesn't exist in database but we have pages loaded
        // Check if it exists locally (might need to be created in database)
        const localPageExists = pages.find(page => page.id === pageId);
        if (localPageExists) {
          setCurrentPageId(pageId);
        }
      }
    }
  }, [pageId, setCurrentPageId, currentPageId, pages]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading builder...</p>
        </div>
      </div>
    );
  }

  // If no pageId or page doesn't exist, redirect to dashboard
  if (!pageId || !pages.find(page => page.id === pageId)) {
    return <Navigate to="/dashboard/pages" replace />;
  }

  return <FrontbaseBuilder />;
};

export default BuilderPage;