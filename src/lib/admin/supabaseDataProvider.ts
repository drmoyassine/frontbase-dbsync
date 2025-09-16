import { DataProvider, GetListParams, GetOneParams, GetManyParams, GetManyReferenceParams, UpdateParams, CreateParams, DeleteParams } from 'ra-core';

export interface SupabaseDataProviderOptions {
  apiUrl: string;
  httpClient?: (url: string, options?: RequestInit) => Promise<Response>;
}

export const createSupabaseDataProvider = (options: SupabaseDataProviderOptions): DataProvider => {
  const { apiUrl, httpClient = fetch } = options;

  // Helper function to make API calls with credentials
  const apiCall = async (url: string, options: RequestInit = {}) => {
    return httpClient(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
  };

  return {
    getList: async (resource: string, params: GetListParams) => {
      const { page, perPage } = params.pagination;
      const { field, order } = params.sort;
      
      const query = new URLSearchParams();
      query.set('limit', perPage.toString());
      query.set('offset', ((page - 1) * perPage).toString());
      
      if (field) {
        query.set('orderBy', field);
        query.set('orderDirection', order.toLowerCase());
      }
      
      // Add filters
      Object.entries(params.filter).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          query.set(`filter_${key}`, value.toString());
        }
      });

      const url = `${apiUrl}/database/table-data/${encodeURIComponent(resource)}?${query}`;
      const response = await apiCall(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch ${resource}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || `Failed to fetch ${resource}`);
      }

      return {
        data: result.data || [],
        total: result.total || result.data?.length || 0,
      };
    },

    getOne: async (resource: string, params: GetOneParams) => {
      // For now, we'll get the list and filter by ID
      // In a real implementation, you'd want a specific endpoint
      const url = `${apiUrl}/database/table-data/${encodeURIComponent(resource)}`;
      const response = await apiCall(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch ${resource}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || `Failed to fetch ${resource}`);
      }

      const record = result.data?.find((item: any) => item.id == params.id);
      if (!record) {
        throw new Error(`Record ${params.id} not found in ${resource}`);
      }

      return { data: record };
    },

    getMany: async (resource: string, params: GetManyParams) => {
      // For now, get all and filter by IDs
      const url = `${apiUrl}/database/table-data/${encodeURIComponent(resource)}`;
      const response = await apiCall(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch ${resource}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || `Failed to fetch ${resource}`);
      }

      const records = result.data?.filter((item: any) => 
        params.ids.includes(item.id)
      ) || [];

      return { data: records };
    },

    getManyReference: async (resource: string, params: GetManyReferenceParams) => {
      const { page, perPage } = params.pagination;
      const { field, order } = params.sort;
      
      const query = new URLSearchParams();
      query.set('limit', perPage.toString());
      query.set('offset', ((page - 1) * perPage).toString());
      
      if (field) {
        query.set('orderBy', field);
        query.set('orderDirection', order.toLowerCase());
      }
      
      // Add target filter
      query.set(`filter_${params.target}`, params.id.toString());
      
      // Add other filters
      Object.entries(params.filter).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          query.set(`filter_${key}`, value.toString());
        }
      });

      const url = `${apiUrl}/database/table-data/${encodeURIComponent(resource)}?${query}`;
      const response = await apiCall(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch ${resource}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || `Failed to fetch ${resource}`);
      }

      return {
        data: result.data || [],
        total: result.total || result.data?.length || 0,
      };
    },

    update: async (resource: string, params: UpdateParams) => {
      // This would require implementing update endpoints in your backend
      throw new Error(`Update not implemented for ${resource}`);
    },

    updateMany: async (resource: string, params: any) => {
      // This would require implementing bulk update endpoints
      throw new Error(`Update many not implemented for ${resource}`);
    },

    create: async (resource: string, params: CreateParams) => {
      // This would require implementing create endpoints in your backend
      throw new Error(`Create not implemented for ${resource}`);
    },

    delete: async (resource: string, params: DeleteParams) => {
      // This would require implementing delete endpoints in your backend
      throw new Error(`Delete not implemented for ${resource}`);
    },

    deleteMany: async (resource: string, params: any) => {
      // This would require implementing bulk delete endpoints
      throw new Error(`Delete many not implemented for ${resource}`);
    },
  };
};