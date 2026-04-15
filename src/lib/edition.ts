/**
 * Edition Helper — Controls whether Frontbase runs in self-host or cloud mode.
 * 
 * When VITE_FRONTBASE_EDITION is not set or "self-host":
 *   - SPA talks to FastAPI via relative URLs (Vite proxy)
 *   - Agent chat goes to FastAPI /api/agent/chat
 *   - Auth via ADMIN_EMAIL/ADMIN_PASSWORD session cookies
 * 
 * When VITE_FRONTBASE_EDITION is "cloud":
 *   - SPA talks to Mega Engine for tenant operations
 *   - Auth via Supabase JWT
 *   - FastAPI only handles master admin + billing
 */

export const EDITION = import.meta.env.VITE_FRONTBASE_EDITION || 'self-host';
export const isCloud = EDITION === 'cloud';

/**
 * Get the API base URL for design-time operations.
 * 
 * Self-host: '' (relative URLs → Vite proxy → FastAPI)
 * Cloud users: Mega Engine URL
 */
export function getApiBase(): string {
    if (isCloud) {
        return import.meta.env.VITE_MEGA_ENGINE_URL || 'https://api.frontbase.dev';
    }
    return ''; // relative → Vite proxy → FastAPI
}

/**
 * Get the agent chat URL.
 * 
 * Self-host: FastAPI /api/agent/chat (Python, no Zod bugs)
 * Cloud: Mega Engine /api/agent/chat (tenant-scoped, BYOK)
 */
export function getAgentChatUrl(profileSlug: string): string {
    if (isCloud) {
        return `${getApiBase()}/api/agent/chat/${profileSlug}`;
    }
    // Self-host: FastAPI handles the workspace agent natively
    return `/api/agent/chat/${profileSlug}`;
}
