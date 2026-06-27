import api from './api-service';
import type { AgentCreditBalance } from './adminAgentsApi';

/** Tenant-facing Workspace Agent credits (GET /api/agent/credits). */
export interface MyAgentCredits extends Partial<AgentCreditBalance> {
    enabled?: boolean;
    /** True for self-host / master admin — no quota applied. */
    unlimited?: boolean;
    quota_exceeded_action?: 'block' | 'warn';
}

export const agentApi = {
    getMyCredits: async (): Promise<MyAgentCredits> => {
        const res = await api.get('/api/agent/credits');
        return res.data;
    },
};
