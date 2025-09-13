const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:3000/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('frontbase_token');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(response.status, errorData.error || 'Request failed');
    }

    return response.json();
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('frontbase_token', token);
    } else {
      localStorage.removeItem('frontbase_token');
    }
  }

  // Auth methods
  async register(email: string, password: string) {
    const response = await this.request<{
      token: string;
      user: { id: number; email: string };
      message: string;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setToken(response.token);
    return response;
  }

  async login(email: string, password: string) {
    const response = await this.request<{
      token: string;
      user: { id: number; email: string };
      message: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setToken(response.token);
    return response;
  }

  async verifyToken() {
    if (!this.token) {
      throw new ApiError(401, 'No token available');
    }

    return this.request<{ user: { id: number; email: string } }>('/auth/verify');
  }

  logout() {
    this.setToken(null);
  }

  // Project methods
  async getProjects() {
    return this.request<any[]>('/projects');
  }

  async getProject(id: string) {
    return this.request<any>(`/projects/${id}`);
  }

  async createProject(data: { name: string; description?: string; settings?: any }) {
    return this.request<any>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(id: string, data: { name?: string; description?: string; settings?: any }) {
    return this.request<{ message: string }>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string) {
    return this.request<{ message: string }>(`/projects/${id}`, {
      method: 'DELETE',
    });
  }

  // Page methods
  async getProjectPages(projectId: string) {
    return this.request<any[]>(`/pages/project/${projectId}`);
  }

  async getPage(id: string) {
    return this.request<any>(`/pages/${id}`);
  }

  async createPage(data: any) {
    return this.request<any>('/pages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePage(id: string, data: any) {
    return this.request<{ message: string }>(`/pages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePage(id: string) {
    return this.request<{ message: string }>(`/pages/${id}`, {
      method: 'DELETE',
    });
  }

  // App variables methods
  async getProjectVariables(projectId: string) {
    return this.request<any[]>(`/projects/${projectId}/variables`);
  }

  async createVariable(projectId: string, data: { name: string; value: string; type?: string }) {
    return this.request<any>(`/projects/${projectId}/variables`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteVariable(projectId: string, variableId: string) {
    return this.request<{ message: string }>(`/projects/${projectId}/variables/${variableId}`, {
      method: 'DELETE',
    });
  }

  // Upload methods
  async uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/upload/single`, {
      method: 'POST',
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : '',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new ApiError(response.status, errorData.error || 'Upload failed');
    }

    return response.json();
  }

  async uploadFiles(files: File[]) {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    const response = await fetch(`${API_BASE_URL}/upload/multiple`, {
      method: 'POST',
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : '',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new ApiError(response.status, errorData.error || 'Upload failed');
    }

    return response.json();
  }

  async deleteFile(filename: string) {
    return this.request<{ message: string }>(`/upload/${filename}`, {
      method: 'DELETE',
    });
  }
}

export const apiService = new ApiService();
export { ApiError };