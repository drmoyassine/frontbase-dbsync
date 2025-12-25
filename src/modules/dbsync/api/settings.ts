import { api } from './client'
import { RedisSettings, RedisTestResult } from '../types'

export const settingsApi = {
    getRedis: () => api.get<RedisSettings>('/settings/redis'),
    updateRedis: (data: Partial<RedisSettings>) => api.put<RedisSettings>('/settings/redis', data),
    testRedis: (data: Partial<RedisSettings>) => api.post<RedisTestResult>('/settings/redis/test', data),
}
