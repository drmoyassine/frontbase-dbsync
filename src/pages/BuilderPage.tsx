import React, { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { FrontbaseBuilder } from '@/components/builder/FrontbaseBuilder';
import { useBuilderStore } from '@/stores/builder';

const BuilderPage: React.FC = () => {
  const { pageId } = useParams<{ pageId: string }>();
  const { pages, setCurrentPageId, currentPageId } = useBuilderStore();

  useEffect(() => {
    if (pageId && pageId !== currentPageId) {
      // Check if page exists
      const pageExists = pages.find(page => page.id === pageId);
      if (pageExists) {
        setCurrentPageId(pageId);
      }
    }
  }, [pageId, setCurrentPageId, currentPageId, pages]);

  // If no pageId or page doesn't exist, redirect to dashboard
  if (!pageId || !pages.find(page => page.id === pageId)) {
    return <Navigate to="/dashboard/pages" replace />;
  }

  return <FrontbaseBuilder />;
};

export default BuilderPage;