import { useEffect } from 'react';
import { FrontbaseBuilder } from '@/components/builder/FrontbaseBuilder';
import { useBuilderStore } from '@/stores/builder';

const Index = () => {
  const { 
    project,
    projects,
    pages,
    currentPageId,
    loadProjects,
    createProject,
    loadProject
  } = useBuilderStore();

  useEffect(() => {
    // Load projects on mount
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    // If no projects exist, create a default one
    if (projects.length === 0 && !project) {
      createProject({
        name: 'My Website',
        description: 'A new Frontbase project',
        settings: {}
      });
    }
  }, [projects, project, createProject]);

  // If we have a project but no current page selected, load the project
  useEffect(() => {
    if (project && !currentPageId && pages.length === 0) {
      loadProject(project.id);
    }
  }, [project, currentPageId, pages, loadProject]);

  return <FrontbaseBuilder />;
};

export default Index;