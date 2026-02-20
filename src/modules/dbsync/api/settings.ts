import axios from 'axios'
import { getFastApiBaseUrl } from '../../../lib/portConfig'
import {
    RedisSettings,
    RedisTestResult,
    PrivacySettings,
    EmailProviderSettings,
    AdminInviteRequest,
    AdminInviteResponse
} from '../types'

// Settings API uses the main FastAPI app, not the /api/sync sub-app
const mainApi = axios.create({
    baseURL: `${getFastApiBaseUrl()}/api`,
    headers: {
        'Content-Type': 'application/json',
    },
})

export const settingsApi = {
    getRedis: () => mainApi.get<RedisSettings>('/settings/redis/'),
    updateRedis: (data: Partial<RedisSettings>) => mainApi.put<RedisSettings>('/settings/redis/', data),
    testRedis: (data: Partial<RedisSettings>) => mainApi.post<RedisTestResult>('/settings/redis/test/', data),

    // Privacy & Tracking
    getPrivacy: () => mainApi.get<PrivacySettings>('/settings/privacy/'),
    updatePrivacy: (data: PrivacySettings) => mainApi.put<PrivacySettings>('/settings/privacy/', data),

    // Email Provider
    getEmail: () => mainApi.get<EmailProviderSettings>('/settings/email'),
    updateEmail: (data: Partial<EmailProviderSettings>) => mainApi.put<EmailProviderSettings>('/settings/email', data),

    // Admin Invites
    sendAdminInvite: (data: AdminInviteRequest) => mainApi.post<AdminInviteResponse>('/settings/invites', data),
}
