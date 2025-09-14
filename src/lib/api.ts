// API service layer for backend communication
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export const pageAPI = {
  // Get all pages
  getAllPages: async (): Promise<APIResponse> => {
    try {
      const response = await fetch('/api/pages', {
        credentials: 'include' // Include session cookies
      });
      if (!response.ok) throw new Error('Failed to fetch pages');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Get single page
  getPage: async (id: string): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/pages/${id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch page');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Create new page
  createPage: async (pageData: any): Promise<APIResponse> => {
    try {
      const response = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(pageData)
      });
      if (!response.ok) throw new Error('Failed to create page');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Update page
  updatePage: async (id: string, pageData: any): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/pages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(pageData)
      });
      if (!response.ok) throw new Error('Failed to update page');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Update page layout data only
  updatePageLayout: async (id: string, layoutData: any): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/pages/${id}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ layoutData })
      });
      if (!response.ok) throw new Error('Failed to update page layout');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Delete page
  deletePage: async (id: string): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/pages/${id}`, { 
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete page');
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
};