import api from './api-service';
import { AppVariable } from '@/types/builder';

// Variables API
export const getVariables = async (): Promise<AppVariable[]> => {
  try {
    const response = await api.get('/api/variables');
    return response.data;
  } catch (error) {
    console.error('Error getting variables:', error);
    throw error;
  }
};

export const createVariable = async (variableData: Omit<AppVariable, 'id' | 'createdAt'>): Promise<AppVariable> => {
  try {
    const response = await api.post('/api/variables', variableData);
    return response.data;
  } catch (error) {
    console.error('Error creating variable:', error);
    throw error;
  }
};

export const updateVariable = async (variableId: string, variableData: Partial<AppVariable>): Promise<AppVariable> => {
  try {
    const response = await api.put(`/api/variables/${variableId}`, variableData);
    return response.data;
  } catch (error) {
    console.error('Error updating variable:', error);
    throw error;
  }
};

export const deleteVariable = async (variableId: string): Promise<void> => {
  try {
    await api.delete(`/api/variables/${variableId}`);
  } catch (error) {
    console.error('Error deleting variable:', error);
    throw error;
  }
};