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
    },

    // ============================================
    // Metadata methods (local storage of form data)
    // ============================================

    /**
     * Save metadata when creating a policy
     */
    saveMetadata: async (
        tableName: string,
        policyName: string,
        formData: unknown,
        generatedUsing: string,
        generatedCheck?: string
    ): Promise<RLSApiResponse> => {
        return fetchRLS('/rls/metadata', {
            method: 'POST',
            body: JSON.stringify({
                tableName,
                policyName,
                formData,
                generatedUsing,
                generatedCheck
            })
        });
    },

    /**
     * Update metadata when updating a policy
     */
    updateMetadata: async (
        tableName: string,
        policyName: string,
        newPolicyName: string | undefined,
        formData: unknown,
        generatedUsing: string,
        generatedCheck?: string
    ): Promise<RLSApiResponse> => {
        return fetchRLS(`/rls/metadata/${tableName}/${encodeURIComponent(policyName)}`, {
            method: 'PUT',
            body: JSON.stringify({
                newPolicyName,
                formData,
                generatedUsing,
                generatedCheck
            })
        });
    },

    /**
     * Delete metadata when deleting a policy
     */
    deleteMetadata: async (tableName: string, policyName: string): Promise<RLSApiResponse> => {
        return fetchRLS(`/rls/metadata/${tableName}/${encodeURIComponent(policyName)}`, {
            method: 'DELETE'
        });
    },

    /**
     * Verify if a policy can be edited visually (matches stored hash)
     * Returns formData if verified, null otherwise
     */
    verifyMetadata: async (
        tableName: string,
        policyName: string,
        currentUsing: string | null
    ): Promise<RLSApiResponse<{
        hasMetadata: boolean;
        isVerified: boolean;
        reason: 'match' | 'modified_externally' | 'no_metadata';
        formData: unknown | null;
    }>> => {
        return fetchRLS('/rls/metadata/verify', {
            method: 'POST',
            body: JSON.stringify({
                tableName,
                policyName,
                currentUsing
            })
        });
    }
};

export default rlsApi;

