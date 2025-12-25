import api from './api-service';
import { ProjectConfig as Project } from '@/types/builder';

// Project API
export const getProject = async (): Promise<Project> => {
  try {
    const response = await api.get('/api/project');
    return response.data;
  } catch (error) {
    console.error('Error getting project:', error);
    throw error;
  }
};

export const updateProject = async (projectData: Partial<Project>): Promise<Project> => {
  try {
    const response = await api.put('/api/project', projectData);
    return response.data;
  } catch (error) {
    console.error('Error updating project:', error);
    throw error;
  }
};