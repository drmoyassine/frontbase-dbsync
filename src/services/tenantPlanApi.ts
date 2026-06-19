import api from './api-service';
import type { Plan, PlanLimits } from './adminPlansApi';

export interface MyPlanRequest {
    id: string;
    from_plan: string;
    to_plan: string;
    direction: 'upgrade' | 'downgrade';
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    note?: string | null;
    admin_note?: string | null;
    created_at: string;
    reviewed_at?: string | null;
}

export interface MyPlanResponse {
    plan: Plan | null;
    limits: PlanLimits;
    usage: Record<string, number>;
    pending_request: MyPlanRequest | null;
}

export interface PublicPricingPlan {
    name: string;
    price: string;
    period: string;
    description: string;
    features: string[];
    ctaText: string;
    ctaLink: string;
    highlighted: boolean;
    badge: string;
}

export const tenantPlanApi = {
    getMyPlan: async (): Promise<MyPlanResponse> => {
        const res = await api.get('/api/tenants/me/plan');
        return res.data;
    },
    requestChange: async (toPlan: string, note?: string): Promise<{ success: boolean; request: MyPlanRequest }> => {
        const res = await api.post('/api/tenants/me/plan-request', { to_plan: toPlan, note });
        return res.data;
    },
    cancelRequest: async (requestId: string): Promise<{ success: boolean }> => {
        const res = await api.delete(`/api/tenants/me/plan-request/${requestId}`);
        return res.data;
    },
    getMyAddons: async (): Promise<{ addons: Record<string, number> }> => {
        const res = await api.get('/api/tenants/me/addons');
        return res.data;
    },
    listPublicPlans: async (): Promise<{ plans: PublicPricingPlan[]; detailed: Plan[] }> => {
        const res = await api.get('/api/plans/public');
        return res.data;
    },
};
