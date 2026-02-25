import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = '';

// ============================================================================
// Types
// ============================================================================

export interface EdgeProviderAccount {
    id: string;
    provider: string; // 'cloudflare', 'vercel', etc.
    name: string;
    provider_credentials?: any;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface EdgeEngine {
    id: string;
    name: string;
    edge_provider_id: string | null;
    provider: string;
    adapter_type: string;
    url: string;
    edge_db_id: string | null;
    edge_db_name?: string;
    engine_config?: any;
    is_active: boolean;
    is_system?: boolean;
    created_at: string;
    updated_at: string;
}

// ============================================================================
// API Service
// ============================================================================

export const edgeInfrastructureApi = {
    // Providers
    getProviders: async (): Promise<EdgeProviderAccount[]> => {
        const res = await fetch(`${API_BASE}/api/edge-providers/`);
        if (!res.ok) throw new Error('Failed to fetch edge providers');
        return res.json();
    },
    createProvider: async (data: Partial<EdgeProviderAccount>): Promise<EdgeProviderAccount> => {
        const res = await fetch(`${API_BASE}/api/edge-providers/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create provider');
        return res.json();
    },
    updateProvider: async ({ id, data }: { id: string; data: Partial<EdgeProviderAccount> }): Promise<EdgeProviderAccount> => {
        const res = await fetch(`${API_BASE}/api/edge-providers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update provider');
        return res.json();
    },
    deleteProvider: async (id: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/api/edge-providers/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete provider');
    },

    // Engines
    getEngines: async (): Promise<EdgeEngine[]> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/`);
        if (!res.ok) throw new Error('Failed to fetch edge engines');
        return res.json();
    },
    createEngine: async (data: Partial<EdgeEngine>): Promise<EdgeEngine> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create engine');
        return res.json();
    },
    updateEngine: async ({ id, data }: { id: string; data: Partial<EdgeEngine> }): Promise<EdgeEngine> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update engine');
        return res.json();
    },
    deleteEngine: async (id: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete engine');
    },
};

// ============================================================================
// React Query Hooks (AGENTS.md Compliant)
// ============================================================================

export function useEdgeProviders() {
    return useQuery({
        queryKey: ['edge-providers'],
        queryFn: edgeInfrastructureApi.getProviders,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

export function useEdgeEngines() {
    return useQuery({
        queryKey: ['edge-engines'],
        queryFn: edgeInfrastructureApi.getEngines,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}
