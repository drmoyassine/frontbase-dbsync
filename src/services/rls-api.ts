/**
 * RLS API Service
 * Frontend API layer for RLS policy management
 */

import type {
    RLSPolicy,
    RLSTableStatus,
    RLSApiResponse,
    CreatePolicyRequest,
    UpdatePolicyRequest
} from '@/types/rls';

const API_BASE = '/api/database';

/**
 * Fetch wrapper with error handling
 */
async function fetchRLS<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<RLSApiResponse<T>> {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.message || data.error || 'Request failed'
            };
        }

        return data;
    } catch (error) {
        console.error('RLS API error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Network error'
        };
    }
}

export const rlsApi = {
    /**
     * List all RLS policies
     */
    listPolicies: async (schema = 'public'): Promise<RLSApiResponse<RLSPolicy[]>> => {
        return fetchRLS<RLSPolicy[]>(`/rls/policies?schema=${schema}`);
    },

    /**
     * Get policies for a specific table
     */
    getTablePolicies: async (
        tableName: string,
        schema = 'public'
    ): Promise<RLSApiResponse<RLSPolicy[]>> => {
        return fetchRLS<RLSPolicy[]>(`/rls/policies/${tableName}?schema=${schema}`);
    },

    /**
     * Get RLS status for all tables
     */
    getTablesStatus: async (schema = 'public'): Promise<RLSApiResponse<RLSTableStatus[]>> => {
        return fetchRLS<RLSTableStatus[]>(`/rls/tables?schema=${schema}`);
    },

    /**
     * Create a new RLS policy
     */
    createPolicy: async (policy: CreatePolicyRequest): Promise<RLSApiResponse> => {
        return fetchRLS('/rls/policies', {
            method: 'POST',
            body: JSON.stringify(policy)
        });
    },

    /**
     * Update an existing RLS policy
     */
    updatePolicy: async (
        tableName: string,
        policyName: string,
        updates: UpdatePolicyRequest
    ): Promise<RLSApiResponse> => {
        return fetchRLS(`/rls/policies/${tableName}/${encodeURIComponent(policyName)}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    },

    /**
     * Delete an RLS policy
     */
    deletePolicy: async (tableName: string, policyName: string): Promise<RLSApiResponse> => {
        return fetchRLS(`/rls/policies/${tableName}/${encodeURIComponent(policyName)}`, {
            method: 'DELETE'
        });
    },

    /**
     * Toggle RLS on a table (enable/disable)
     */
    toggleTableRLS: async (tableName: string, enable: boolean): Promise<RLSApiResponse> => {
        return fetchRLS(`/rls/tables/${tableName}/toggle`, {
            method: 'POST',
            body: JSON.stringify({ enable })
        });
    }
};

export default rlsApi;
