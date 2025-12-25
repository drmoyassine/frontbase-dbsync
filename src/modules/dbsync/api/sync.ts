import { api } from './client'
import { SyncConfig, SyncJob, Conflict } from '../types'

export const syncConfigsApi = {
    list: () => api.get<SyncConfig[]>('/sync-configs'),
    get: (id: string) => api.get<SyncConfig>(`/sync-configs/${id}`),
    create: (data: Partial<SyncConfig>) => api.post<SyncConfig>('/sync-configs', data),
    update: (id: string, data: Partial<SyncConfig>) => api.put<SyncConfig>(`/sync-configs/${id}`, data),
    delete: (id: string) => api.delete(`/sync-configs/${id}`),
}

export const syncApi = {
    execute: (configId: string) => api.post<SyncJob>(`/operations/${configId}`),
    getStatus: (jobId: string) => api.get<SyncJob>(`/operations/${jobId}/status`),
    getConflicts: (configId: string, status?: string) =>
        api.get<Conflict[]>(`/operations/${configId}/conflicts`, { params: { status_filter: status } }),
    resolveConflict: (configId: string, conflictId: string, data: { resolution: string; merged_data?: Record<string, unknown> }) =>
        api.post<Conflict>(`/operations/${configId}/resolve/${conflictId}`, data),
    listJobs: (configId?: string, limit?: number) =>
        api.get<SyncJob[]>('/operations/jobs', { params: { config_id: configId, limit } }),
}
