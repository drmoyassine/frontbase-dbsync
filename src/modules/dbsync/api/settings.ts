import { api } from './client'
import { RedisSettings, RedisTestResult, PrivacySettings } from '../types'

export const settingsApi = {
    getRedis: () => api.get<RedisSettings>('/settings/redis'),
    updateRedis: (data: Partial<RedisSettings>) => api.put<RedisSettings>('/settings/redis', data),
    testRedis: (data: Partial<RedisSettings>) => api.post<RedisTestResult>('/settings/redis/test', data),

    // Privacy & Tracking
    getPrivacy: () => api.get<PrivacySettings>('/settings/privacy'),
    updatePrivacy: (data: PrivacySettings) => api.put<PrivacySettings>('/settings/privacy', data),
}
