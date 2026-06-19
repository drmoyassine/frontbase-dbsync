import api from './api-service';

export interface TenantInvite {
    id: string;
    email: string;
    role: string;
    status: string;
    created_at: string;
    expires_at: string;
}

export const tenantTeamApi = {
    listInvites: async (): Promise<{ invites: TenantInvite[] }> => {
        const res = await api.get('/api/tenants/me/invites');
        return res.data;
    },
    createInvite: async (
        email: string,
        role: 'admin' | 'editor' | 'viewer',
        projectIds?: string[],
    ): Promise<{ success: boolean; invite: TenantInvite; link: string }> => {
        const res = await api.post('/api/tenants/me/invites', {
            email, role, project_ids: projectIds ?? null,
        });
        return res.data;
    },
    revokeInvite: async (inviteId: string): Promise<{ success: boolean }> => {
        const res = await api.delete(`/api/tenants/me/invites/${inviteId}`);
        return res.data;
    },
};
