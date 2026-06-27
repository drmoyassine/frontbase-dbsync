import api from './api-service';

export interface PlanLimits {
    [key: string]: number | boolean;
}

export interface Plan {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    infra_mode: 'managed' | 'byo';
    price_display?: string | null;
    price_period?: string | null;
    limits: PlanLimits;
    features: string[];
    is_public: boolean;
    is_active: boolean;
    is_default: boolean;
    highlighted: boolean;
    badge?: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
    tenant_count?: number;
}

export interface LimitDef {
    key: string;
    label: string;
    kind: 'int' | 'bool';
    category: 'capacity' | 'operational' | 'agent' | 'feature';
    scope: 'project' | 'tenant';
    unit: string | null;
    default: number | boolean;
}

export interface PlanChangeRequestAdmin {
    id: string;
    tenant_id: string;
    tenant_name?: string | null;
    tenant_slug?: string | null;
    from_plan: string;
    to_plan: string;
    direction: 'upgrade' | 'downgrade';
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    note?: string | null;
    admin_note?: string | null;
    created_at: string;
    reviewed_at?: string | null;
}

export type PlanWritePayload = Partial<Omit<Plan, 'id' | 'created_at' | 'updated_at' | 'tenant_count'>>;

export const adminPlansApi = {
    listPlans: async (): Promise<{ plans: Plan[] }> => {
        const res = await api.get('/api/admin/plans');
        return res.data;
    },
    getLimitRegistry: async (): Promise<{ limits: LimitDef[] }> => {
        const res = await api.get('/api/admin/plans/limit-registry');
        return res.data;
    },
    createPlan: async (payload: PlanWritePayload): Promise<{ plan: Plan }> => {
        const res = await api.post('/api/admin/plans', payload);
        return res.data;
    },
    updatePlan: async (planId: string, payload: PlanWritePayload): Promise<{ plan: Plan }> => {
        const res = await api.put(`/api/admin/plans/${planId}`, payload);
        return res.data;
    },
    deletePlan: async (planId: string): Promise<{ success: boolean; message: string }> => {
        const res = await api.delete(`/api/admin/plans/${planId}`);
        return res.data;
    },

    listRequests: async (status = 'pending'): Promise<{ requests: PlanChangeRequestAdmin[] }> => {
        const res = await api.get(`/api/admin/plan-requests`, { params: { status } });
        return res.data;
    },
    approveRequest: async (requestId: string, adminNote?: string): Promise<{ success: boolean }> => {
        const res = await api.post(`/api/admin/plan-requests/${requestId}/approve`, { admin_note: adminNote });
        return res.data;
    },
    rejectRequest: async (requestId: string, adminNote?: string): Promise<{ success: boolean }> => {
        const res = await api.post(`/api/admin/plan-requests/${requestId}/reject`, { admin_note: adminNote });
        return res.data;
    },

    listTenantAddons: async (tenantId: string): Promise<{ addons: TenantAddonEntry[] }> => {
        const res = await api.get('/api/admin/tenant-addons', { params: { tenant_id: tenantId } });
        return res.data;
    },
    grantTenantAddon: async (tenantId: string, addonType: string, quantity: number): Promise<{ addon: TenantAddonEntry }> => {
        const res = await api.post('/api/admin/tenant-addons', { tenant_id: tenantId, addon_type: addonType, quantity });
        return res.data;
    },
    revokeTenantAddon: async (addonId: string): Promise<{ success: boolean }> => {
        const res = await api.delete(`/api/admin/tenant-addons/${addonId}`);
        return res.data;
    },
};

export interface TenantAddonEntry {
    id: string;
    tenant_id: string;
    addon_type: string;
    quantity: number;
    status: string;
}
