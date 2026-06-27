import api from './api-service';

/** Workspace Agent credit balance snapshot (admin / tenant views share this shape). */
export interface AgentCreditBalance {
    daily_remaining: number;
    daily_limit: number;
    monthly_remaining: number;
    monthly_limit: number;
    daily_resets_at: string;
    monthly_resets_at: string;
    total_consumed: number;
    bonus_daily?: number;
    bonus_monthly?: number;
    daily_last_reset_at?: string | null;
    monthly_last_reset_at?: string | null;
}

export interface AgentProvider {
    id: string;
    name: string;
    provider: string;
    is_active: boolean;
    is_workspace_default: boolean;
    has_credentials: boolean;
    created_at: string;
}

export interface AgentGlobalConfig {
    enabled: boolean;
    quota_exceeded_action: 'block' | 'warn';
    default_provider?: AgentProvider | null;
}

export interface AgentBalanceRow extends AgentCreditBalance {
    tenant_id: string;
    tenant_name: string;
}

export interface AgentAnalytics {
    period: string;
    total_consumed: number;
    quota_exhausted: number;
    errors: number;
    active_tenants: number;
    avg_credits_per_tenant: number;
    top_tenants: { tenant_id: string; tenant_name: string; consumed: number }[];
    daily_series: { date: string; credits: number }[];
    provider_usage: { key: string; credits: number }[];
    model_usage: { model: string; credits: number }[];
}

export type AnalyticsPeriod = '7d' | '30d' | '90d';

export const adminAgentsApi = {
    getConfig: async (): Promise<AgentGlobalConfig> => {
        const res = await api.get('/api/admin/agents/config');
        return res.data;
    },
    updateConfig: async (payload: Partial<Pick<AgentGlobalConfig, 'enabled' | 'quota_exceeded_action'>>): Promise<{ config: AgentGlobalConfig }> => {
        const res = await api.put('/api/admin/agents/config', payload);
        return res.data;
    },
    listProviders: async (): Promise<{ providers: AgentProvider[] }> => {
        const res = await api.get('/api/admin/agents/providers');
        return res.data;
    },
    setDefaultProvider: async (providerId: string): Promise<{ provider: AgentProvider }> => {
        const res = await api.post(`/api/admin/agents/providers/${providerId}/set-default`);
        return res.data;
    },
    getAnalytics: async (period: AnalyticsPeriod = '30d'): Promise<AgentAnalytics> => {
        const res = await api.get('/api/admin/agents/analytics', { params: { period } });
        return res.data;
    },
    listBalances: async (): Promise<{ balances: AgentBalanceRow[] }> => {
        const res = await api.get('/api/admin/agents/quota/balances');
        return res.data;
    },
    grantCredits: async (tenantId: string, daily: number, monthly: number): Promise<{ balance: AgentBalanceRow }> => {
        const res = await api.post(`/api/admin/agents/quota/${tenantId}/grant`, { daily, monthly });
        return res.data;
    },
    resetAllDaily: async (): Promise<{ reset_count: number }> => {
        const res = await api.post('/api/admin/agents/quota/reset-daily');
        return res.data;
    },
};
