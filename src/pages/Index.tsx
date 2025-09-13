import React, { useEffect } from 'react';
import { FrontbaseBuilder } from '@/components/builder/FrontbaseBuilder';
import { useBuilderStore } from '@/stores/builder';
import { v4 as uuidv4 } from 'uuid';

const Index = () => {
  const { project, setProject, pages, createPage } = useBuilderStore();

  // Initialize project and demo page on first load
  useEffect(() => {
    if (!project) {
      setProject({
        id: uuidv4(),
        name: 'My Frontbase Project',
        description: 'A new project created with Frontbase',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    if (pages.length === 0) {
      createPage({
        name: 'Home',
        slug: 'home',
        title: 'Home - My Website',
        description: 'Welcome to my website',
        keywords: 'home, welcome, website',
        isPublic: true,
        isHomepage: true,
        layoutData: {
          content: [
            {
              type: 'Heading',
              props: {
                id: 'heading-1',
                text: 'Welcome to Frontbase',
                level: '1'
              }
            },
            {
              type: 'Text',
              props: {
                id: 'text-1',
                text: 'Start building your amazing website with our visual page builder.',
                size: 'lg'
              }
            },
            {
              type: 'Button',
              props: {
                id: 'button-1',
                text: 'Get Started',
                variant: 'default',
                size: 'lg'
              }
            }
          ],
          root: {}
        }
      });
    }
  }, [project, pages.length, setProject, createPage]);

  return <FrontbaseBuilder />;
};

export default Index;
