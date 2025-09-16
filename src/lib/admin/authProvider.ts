import { AuthProvider } from 'ra-core';

export interface AdminAuthProviderOptions {
  apiUrl: string;
  httpClient?: (url: string, options?: RequestInit) => Promise<Response>;
}

export const createAdminAuthProvider = (options: AdminAuthProviderOptions): AuthProvider => {
  const { apiUrl, httpClient = fetch } = options;

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
    login: async ({ username, password }) => {
      const response = await apiCall(`${apiUrl}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      return Promise.resolve();
    },

    logout: async () => {
      try {
        await apiCall(`${apiUrl}/auth/logout`, {
          method: 'POST',
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
      return Promise.resolve();
    },

    checkAuth: async () => {
      const response = await apiCall(`${apiUrl}/auth/me`);
      
      if (!response.ok) {
        throw new Error('Not authenticated');
      }

      return Promise.resolve();
    },

    checkError: async (error: any) => {
      const status = error.status;
      if (status === 401 || status === 403) {
        throw new Error('Authentication required');
      }
      return Promise.resolve();
    },

    getPermissions: async () => {
      // For now, return basic permissions
      // You can enhance this based on your auth system
      return Promise.resolve(['admin']);
    },

    getIdentity: async () => {
      const response = await apiCall(`${apiUrl}/auth/me`);
      
      if (!response.ok) {
        throw new Error('Not authenticated');
      }

      const data = await response.json();
      
      return Promise.resolve({
        id: data.user?.id,
        fullName: data.user?.username,
        avatar: undefined,
      });
    },
  };
};