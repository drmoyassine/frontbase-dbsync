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
    edge_cache_id: string | null;
    edge_cache_name?: string;
    edge_queue_id: string | null;
    edge_queue_name?: string;
    engine_config?: any;
    gpu_models?: {
        id: string;
        name: string;
        slug?: string;
        model_id?: string;
        model_type: string;
        endpoint_url: string | null;
    }[];
    is_active: boolean;
    is_system?: boolean;
    bundle_checksum?: string | null;
    config_checksum?: string | null;
    last_deployed_at?: string | null;
    last_synced_at?: string | null;
    sync_status?: 'synced' | 'stale' | 'unknown';
    is_outdated?: boolean;
    created_at: string;
    updated_at: string;
}

export interface EdgeCache {
    id: string;
    name: string;
    provider: string; // 'upstash', 'redis', 'dragonfly'
    cache_url: string;
    has_token: boolean;
    is_default: boolean;
    is_system: boolean;
    provider_account_id?: string | null;
    account_name?: string | null;
    created_at: string;
    updated_at: string;
    engine_count: number;
    supports_remote_delete?: boolean;
}

export interface EdgeQueue {
    id: string;
    name: string;
    provider: string; // 'qstash', 'rabbitmq', 'bullmq', 'sqs'
    queue_url: string;
    has_token: boolean;
    has_signing_key: boolean;
    is_default: boolean;
    is_system: boolean;
    created_at: string;
    updated_at: string;
    engine_count: number;
    provider_account_id?: string | null;
    supports_remote_delete?: boolean;
}

export interface BatchResult {
    success: string[];
    failed: { id: string; error: string }[];
    total: number;
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
    deleteEngine: async (id: string, deleteRemote = false): Promise<void> => {
        const qs = deleteRemote ? '?delete_remote=true' : '';
        const res = await fetch(`${API_BASE}/api/edge-engines/${id}${qs}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 204) throw new Error('Failed to delete engine');
    },
    redeployEngine: async (id: string): Promise<any> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${id}/redeploy`, { method: 'POST' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || 'Redeploy failed');
        }
        const result = await res.json();
        // Auto-sync manifest after redeploy to update GPU models + metadata
        try {
            await fetch(`${API_BASE}/api/edge-engines/${id}/sync-manifest`, { method: 'POST' });
        } catch {
            // Silent — manifest sync is best-effort
        }
        return result;
    },
    syncManifest: async (id: string): Promise<any> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/${id}/sync-manifest`, { method: 'POST' });
        if (!res.ok) throw new Error('Manifest sync failed');
        return res.json();
    },

    // Batch Operations
    batchDelete: async (engine_ids: string[], delete_remote = false): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/batch/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engine_ids, delete_remote }),
        });
        if (!res.ok) throw new Error('Batch delete failed');
        return res.json();
    },
    batchToggle: async (engine_ids: string[], is_active: boolean): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/batch/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engine_ids, is_active }),
        });
        if (!res.ok) throw new Error('Batch toggle failed');
        return res.json();
    },
    batchSyncCheck: async (engine_ids: string[]): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-engines/batch/sync-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engine_ids }),
        });
        if (!res.ok) throw new Error('Batch sync check failed');
        return res.json();
    },

    // Edge Databases
    getEdgeDatabases: async (): Promise<any[]> => {
        const res = await fetch(`${API_BASE}/api/edge-databases/`);
        if (!res.ok) throw new Error('Failed to fetch edge databases');
        return res.json();
    },

    // Edge Caches
    getEdgeCaches: async (): Promise<EdgeCache[]> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/`);
        if (!res.ok) throw new Error('Failed to fetch edge caches');
        return res.json();
    },
    createEdgeCache: async (data: Partial<EdgeCache> & { cache_token?: string }): Promise<EdgeCache> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create edge cache');
        return res.json();
    },
    updateEdgeCache: async ({ id, data }: { id: string; data: Partial<EdgeCache> & { cache_token?: string } }): Promise<EdgeCache> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update edge cache');
        return res.json();
    },
    deleteEdgeCache: async (id: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to delete edge cache');
        }
    },
    testEdgeCache: async (id: string): Promise<{ success: boolean; message: string; latency_ms?: number }> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/${id}/test`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to test cache connection');
        return res.json();
    },
    testEdgeCacheInline: async (data: { provider: string; cache_url: string; cache_token?: string }): Promise<{ success: boolean; message: string; latency_ms?: number }> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/test-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, name: 'test' }),
        });
        if (!res.ok) throw new Error('Failed to test cache connection');
        return res.json();
    },

    // Edge Queues
    getEdgeQueues: async (): Promise<EdgeQueue[]> => {
        const res = await fetch(`${API_BASE}/api/edge-queues/`);
        if (!res.ok) throw new Error('Failed to fetch edge queues');
        return res.json();
    },

    // Batch Operations — Databases
    batchDeleteDatabases: async (ids: string[], delete_remote = false): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-databases/batch/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, delete_remote }),
        });
        if (!res.ok) throw new Error('Batch delete databases failed');
        return res.json();
    },

    // Batch Operations — Caches
    batchDeleteCaches: async (ids: string[], delete_remote = false): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-caches/batch/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, delete_remote }),
        });
        if (!res.ok) throw new Error('Batch delete caches failed');
        return res.json();
    },

    // Batch Operations — Queues
    batchDeleteQueues: async (ids: string[], delete_remote = false): Promise<BatchResult> => {
        const res = await fetch(`${API_BASE}/api/edge-queues/batch/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, delete_remote }),
        });
        if (!res.ok) throw new Error('Batch delete queues failed');
        return res.json();
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

export function useEdgeDatabases() {
    return useQuery({
        queryKey: ['edge-databases'],
        queryFn: edgeInfrastructureApi.getEdgeDatabases,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

export function useEdgeCaches() {
    return useQuery({
        queryKey: ['edge-caches'],
        queryFn: edgeInfrastructureApi.getEdgeCaches,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

export function useEdgeQueues() {
    return useQuery({
        queryKey: ['edge-queues'],
        queryFn: edgeInfrastructureApi.getEdgeQueues,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}


// ============================================================================
// API Keys
// ============================================================================

export interface EdgeAPIKey {
    id: string;
    name: string;
    prefix: string;
    edge_engine_id: string | null;
    engine_name: string | null;
    is_active: boolean;
    expires_at: string | null;
    last_used_at: string | null;
    created_at: string;
    updated_at: string;
    key?: string;  // Only present at creation
}

export function useEdgeAPIKeys() {
    return useQuery({
        queryKey: ['edge-api-keys'],
        queryFn: async (): Promise<EdgeAPIKey[]> => {
            const res = await fetch(`${API_BASE}/api/edge-api-keys`);
            if (!res.ok) throw new Error('Failed to fetch API keys');
            const data = await res.json();
            return data.keys;
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}
