import api from './api-service';
import { Page } from '@/types/builder';
import { ApiContracts, PageSchema, PageListSchema } from './api-contracts';

// Pages API - Using Strict Contracts

export const getPages = async (includeDeleted: boolean = false): Promise<Page[]> => {
  try {
    const params = includeDeleted ? '?includeDeleted=true' : '';
    const response = await api.get(`/api/pages${params}`);
    // Validate response structure
    return ApiContracts.validate(PageListSchema, response.data, 'getPages') as unknown as Page[];
  } catch (error) {
    console.error('Error getting pages:', error);
    throw error;
  }
};

export const createPage = async (pageData: Omit<Page, 'id' | 'createdAt' | 'updatedAt'>): Promise<Page> => {
  try {
    const response = await api.post('/api/pages', pageData);
    return ApiContracts.validate(PageSchema, response.data, 'createPage') as unknown as Page;
  } catch (error) {
    console.error('Error creating page:', error);
    throw error;
  }
};

export const updatePage = async (pageId: string, pageData: Partial<Page>): Promise<Page> => {
  try {
    const response = await api.put(`/api/pages/${pageId}`, pageData);
    return ApiContracts.validate(PageSchema, response.data, 'updatePage') as unknown as Page;
  } catch (error) {
    console.error('Error updating page:', error);
    throw error;
  }
};

export const updatePageLayout = async (pageId: string, layoutData: any): Promise<Page> => {
  try {
    const response = await api.put(`/api/pages/${pageId}/layout`, { layoutData });
    return ApiContracts.validate(PageSchema, response.data, 'updatePageLayout') as unknown as Page;
  } catch (error) {
    console.error('Error updating page layout:', error);
    throw error;
  }
};

export const deletePage = async (pageId: string): Promise<void> => {
  try {
    const response = await api.delete(`/api/pages/${pageId}`);
    const result = response.data;
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete page');
    }
  } catch (error) {
    console.error('Error deleting page:', error);
    throw error;
  }
};

export const restorePage = async (pageId: string): Promise<Page> => {
  try {
    const response = await api.post(`/api/pages/${pageId}/restore`);
    return ApiContracts.validate(PageSchema, response.data, 'restorePage') as unknown as Page;
  } catch (error) {
    console.error('Error restoring page:', error);
    throw error;
  }
};

export const permanentDeletePage = async (pageId: string): Promise<void> => {
  try {
    const response = await api.delete(`/api/pages/${pageId}/permanent`);
    const result = response.data;
    if (!result.success) {
      throw new Error(result.error || 'Failed to permanently delete page');
    }
  } catch (error) {
    console.error('Error permanently deleting page:', error);
    throw error;
  }
};