/**
 * App User Management API client — Supabase/GoTrue app-user CRUD.
 * Companion to fastapi-backend/app/routers/users.py (mounted at /api/users).
 *
 * These manage a tenant's *app users* (GoTrue), distinct from platform team
 * members (SuperTokens). All calls are tenant-scoped server-side.
 */
import api from './api-service';

export interface AppUser {
    id: string;
    email: string;
    created_at?: string | null;
    last_sign_in_at?: string | null;
    banned_until?: string | null;
    disabled: boolean;
}

export interface InviteUserParams {
    email: string;
    role?: string;
}

export const usersApi = {
    list: async (params?: { page?: number; per_page?: number; search?: string }): Promise<{ users: AppUser[]; total: number | null }> => {
        const { data } = await api.get('/api/users', { params });
        return data;
    },
    invite: async (body: InviteUserParams): Promise<{ success: boolean; user: AppUser }> => {
        const { data } = await api.post('/api/users/invite', body);
        return data;
    },
    setState: async (userId: string, disabled: boolean): Promise<{ success: boolean; user: AppUser }> => {
        const { data } = await api.patch(`/api/users/${userId}/state`, { disabled });
        return data;
    },
    remove: async (userId: string): Promise<{ success: boolean; id: string }> => {
        const { data } = await api.delete(`/api/users/${userId}`);
        return data;
    },
};
