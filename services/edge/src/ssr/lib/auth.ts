/**
 * Auth Module — Provider Factory + Facade
 * 
 * Resolves the active auth provider from env vars and exposes
 * backward-compatible functions (getUserFromSession).
 * 
 * Provider selection:
 * - SUPABASE_URL / FRONTBASE_SUPABASE_URL → SupabaseAuthProvider
 * - Future: CLERK_SECRET_KEY → ClerkAuthProvider
 */

import type { IAuthProvider, UserContext, SessionRefreshResult } from './IAuthProvider.js';

// Re-export types for consumers
export type { UserContext, SessionRefreshResult, IAuthProvider };

// =============================================================================
// Provider Factory (lazy singleton)
// =============================================================================

let _provider: IAuthProvider | null | undefined = undefined; // undefined = not resolved yet

async function getAuthProvider(): Promise<IAuthProvider | null> {
    if (_provider !== undefined) return _provider;

    // 1. Supabase: check for URL env var (cloud Edge / Docker)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.FRONTBASE_SUPABASE_URL;
    if (supabaseUrl) {
        const { SupabaseAuthProvider } = await import('./SupabaseAuthProvider.js');
        _provider = new SupabaseAuthProvider();
        return _provider;
    }

    // 2. Fallback: check baked authProvider in project settings (local Edge)
    try {
        const { stateProvider } = await import('../../storage/index.js');
        const settings = await stateProvider.getProjectSettings();
        if (settings?.usersConfig) {
            const config = JSON.parse(settings.usersConfig);
            if (config.authProvider?.url && config.authProvider?.anonKey) {
                const { SupabaseAuthProvider } = await import('./SupabaseAuthProvider.js');
                _provider = new SupabaseAuthProvider();
                console.log('[Auth Factory] Resolved SupabaseAuthProvider from baked project settings');
                return _provider;
            }
        }
    } catch (err) {
        console.warn('[Auth Factory] Failed to check project settings:', err);
    }

    // Future: Clerk, Auth0, etc.

    _provider = null;
    return null;
}

// =============================================================================
// Facade Functions (backward-compatible)
// =============================================================================

/**
 * Get authenticated user from request.
 * Delegates to the active auth provider's getUserFromRequest().
 */
export async function getUserFromSession(request: Request): Promise<UserContext | null> {
    const provider = await getAuthProvider();
    if (!provider) return null;
    return provider.getUserFromRequest(request);
}

/**
 * Refresh session and return user + Set-Cookie headers.
 * Used by middleware to transparently renew expired tokens.
 */
export async function refreshSession(request: Request): Promise<SessionRefreshResult> {
    const provider = await getAuthProvider();
    if (!provider) return { user: null, setCookieHeaders: [] };
    return provider.refreshSession(request);
}
