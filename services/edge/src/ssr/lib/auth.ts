import type { IAuthProvider, UserContext, SessionRefreshResult } from './IAuthProvider.js';
import { getAuthConfig } from '../../config/env.js';

// Re-export types for consumers
export type { UserContext, SessionRefreshResult, IAuthProvider };

// =============================================================================
// Provider Factory (lazy singleton)
// =============================================================================

let _provider: IAuthProvider | null | undefined = undefined; // undefined = not resolved yet

async function getAuthProvider(): Promise<IAuthProvider | null> {
    if (_provider !== undefined) return _provider;

    const authCfg = getAuthConfig();

    // Supabase auth provider
    if (authCfg.provider === 'supabase' && authCfg.url && authCfg.anonKey) {
        const { SupabaseAuthProvider } = await import('./SupabaseAuthProvider.js');
        _provider = new SupabaseAuthProvider();
        console.log(`[Auth Factory] Resolved SupabaseAuthProvider from FRONTBASE_AUTH: ${authCfg.url.substring(0, 30)}...`);
        return _provider;
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
