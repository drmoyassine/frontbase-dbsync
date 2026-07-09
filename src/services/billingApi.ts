import { api } from './api';

export const billingApi = {
    createCheckoutSession: async (plan_slug: string, add_ons?: Array<{ addon_type: string, quantity: number }>): Promise<{ url: string }> => {
        const res = await api.post('/api/billing/checkout', { plan_slug, add_ons });
        return res.data;
    },
    
    createPortalSession: async (): Promise<{ url: string }> => {
        const res = await api.post('/api/billing/portal');
        return res.data;
    }
};
