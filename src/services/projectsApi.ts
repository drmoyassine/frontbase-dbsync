import api from './api-service';

export interface ProjectSummary {
    id: string;
    name: string;
    description?: string | null;
    is_default: boolean;
    status: string;
    created_at: string;
    is_active_project: boolean;
}

export const projectsApi = {
    list: async (): Promise<{ projects: ProjectSummary[] }> => {
        const res = await api.get('/api/projects');
        return res.data;
    },
    create: async (name: string, description?: string): Promise<{ project: ProjectSummary }> => {
        const res = await api.post('/api/projects', { name, description });
        return res.data;
    },
    update: async (id: string, patch: { name?: string; description?: string }): Promise<{ project: ProjectSummary }> => {
        const res = await api.patch(`/api/projects/${id}`, patch);
        return res.data;
    },
    delete: async (id: string): Promise<{ success: boolean }> => {
        const res = await api.delete(`/api/projects/${id}`);
        return res.data;
    },
    listMembers: async (projectId: string): Promise<{ members: ProjectMemberEntry[] }> => {
        const res = await api.get(`/api/projects/${projectId}/members`);
        return res.data;
    },
    addMember: async (projectId: string, userId: string, role: 'admin' | 'editor' | 'viewer'): Promise<{ success: boolean }> => {
        const res = await api.post(`/api/projects/${projectId}/members`, { user_id: userId, role });
        return res.data;
    },
    removeMember: async (projectId: string, userId: string): Promise<{ success: boolean }> => {
        const res = await api.delete(`/api/projects/${projectId}/members/${userId}`);
        return res.data;
    },
};

export interface ProjectMemberEntry {
    user_id: string;
    email?: string | null;
    role: string;
    implicit: boolean;
}
