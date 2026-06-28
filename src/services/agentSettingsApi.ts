/**
 * Tenant / user-side Workspace Agent settings — API client.
 *
 * Wraps GET / PUT / DELETE /api/agent/settings. Uses the shared axios instance
 * (withCredentials) so the SuperTokens / master-admin session travels with
 * every call.
 */
import api from './api-service';
import type {
  SettingsResponse,
  SettingsUpdateRequest,
} from '../types/agentSettings';

export const agentSettingsApi = {
  /** Effective merged settings the caller's next turn will use. */
  get: async (): Promise<SettingsResponse> => {
    const res = await api.get<SettingsResponse>('/api/agent/settings');
    return res.data;
  },

  /** Upsert the caller's user override (scope=user) or tenant default (scope=tenant). */
  update: async (request: SettingsUpdateRequest): Promise<{ message: string; scope: string }> => {
    const res = await api.put<{ message: string; scope: string }>('/api/agent/settings', request);
    return res.data;
  },

  /** Delete the override for the given scope (falls back to the lower layer). */
  reset: async (scope: 'user' | 'tenant' = 'user'): Promise<{ message: string; deleted: number }> => {
    const res = await api.delete<{ message: string; deleted: number }>(
      `/api/agent/settings?scope=${scope}`,
    );
    return res.data;
  },
};
