import api from './api-service';

export interface TenantAdminUser {
    id: string;
    user_id: string;
    email: string;
    role: string;
    created_at: string;
}

export interface TenantAdminResponse {
    id: string;
    slug: string;
    name: string;
    plan: string;
    status: string;
    member_count: number;
    created_at: string;
    owner_last_login_at?: string | null;
    project_count: number;
}

export interface TenantAdminDetailResponse extends TenantAdminResponse {
    members: TenantAdminUser[];
    project_id?: string | null;
}

export interface CreateTenantPayload {
    slug: string;
    name: string;
    plan: string;
}

export interface CreateTenantUserPayload {
    email: string;
    password?: string;
    username?: string;
    role?: string;
}

export const tenantAdminApi = {
    listTenants: async (): Promise<{ tenants: TenantAdminResponse[] }> => {
        const response = await api.get('/api/admin/tenants/');
        return response.data;
    },

    getTenant: async (tenantId: string): Promise<{ tenant: TenantAdminDetailResponse }> => {
        const response = await api.get(`/api/admin/tenants/${tenantId}`);
        return response.data;
    },

    createTenant: async (payload: CreateTenantPayload): Promise<{ tenant: TenantAdminResponse & { project_id?: string } }> => {
        const response = await api.post('/api/admin/tenants/', payload);
        return response.data;
    },

    createTenantUser: async (tenantId: string, payload: CreateTenantUserPayload): Promise<{ user: any }> => {
        const response = await api.post(`/api/admin/tenants/${tenantId}/users`, payload);
        return response.data;
    },

    updateTenant: async (tenantId: string, payload: Partial<CreateTenantPayload> & { status?: string }): Promise<{ success: boolean; tenant: any }> => {
        const response = await api.put(`/api/admin/tenants/${tenantId}`, payload);
        return response.data;
    },

    deleteTenant: async (tenantId: string): Promise<{ success: boolean; message: string }> => {
        const response = await api.delete(`/api/admin/tenants/${tenantId}`);
        return response.data;
    }
};
