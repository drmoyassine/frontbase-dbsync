import type { IAuthProvider, UserContext, SessionRefreshResult } from './IAuthProvider.js';
import { getAuthConfig } from '../../config/env.js';

// Re-export types for consumers
export type { UserContext, SessionRefreshResult, IAuthProvider };

// =============================================================================
// Provider Factory (lazy maps per tenant)
// =============================================================================

const _providers = new Map<string, IAuthProvider | null>();

/**
 * Resolve tenant slug dynamically from the request's Host header if not already known.
 */
export function resolveTenantSlugFromRequest(request: Request): string {
    const deploymentMode = process.env.FRONTBASE_DEPLOYMENT_MODE || '';
    const baseDomain = process.env.FRONTBASE_BASE_DOMAIN || '';

    if (deploymentMode !== 'cloud' || !baseDomain) {
        return '_default';
    }

    const host = request.headers.get('host') || '';
    const hostOnly = host.split(':')[0].toLowerCase();
    const base = baseDomain.toLowerCase();

    if (!hostOnly.endsWith(base)) return '_default';

    const prefix = hostOnly.slice(0, -(base.length + 1));
    if (!prefix || prefix.includes('.')) return '_default';

    const RESERVED_SUBDOMAINS = new Set([
        'app', 'api', 'www', 'admin', 'status', 'docs'
    ]);
    if (RESERVED_SUBDOMAINS.has(prefix)) return '_default';

    return prefix;
}

async function getAuthProvider(tenantSlug?: string): Promise<IAuthProvider | null> {
    const key = tenantSlug || '_default';
    if (_providers.has(key)) {
        return _providers.get(key)!;
    }

    const authCfg = getAuthConfig(key);

    // Supabase auth provider
    if (authCfg.provider === 'supabase' && authCfg.url && authCfg.anonKey) {
        const { SupabaseAuthProvider } = await import('./SupabaseAuthProvider.js');
        const provider = new SupabaseAuthProvider(authCfg);
        _providers.set(key, provider);
        console.log(`[Auth Factory] Resolved SupabaseAuthProvider for tenant "${key}" from FRONTBASE_AUTH: ${authCfg.url.substring(0, 30)}...`);
        return provider;
    }

    // Future: Clerk, Auth0, etc.

    _providers.set(key, null);
    return null;
}

// =============================================================================
// Facade Functions (backward-compatible)
// =============================================================================

/**
 * Get authenticated user from request.
 * Delegates to the active auth provider's getUserFromRequest().
 */
export async function getUserFromSession(request: Request, tenantSlug?: string): Promise<UserContext | null> {
    const resolvedSlug = tenantSlug || resolveTenantSlugFromRequest(request);
    const provider = await getAuthProvider(resolvedSlug);
    if (!provider) return null;
    return provider.getUserFromRequest(request);
}

/**
 * Refresh session and return user + Set-Cookie headers.
 * Used by middleware to transparently renew expired tokens.
 */
export async function refreshSession(request: Request, tenantSlug?: string): Promise<SessionRefreshResult> {
    const resolvedSlug = tenantSlug || resolveTenantSlugFromRequest(request);
    const provider = await getAuthProvider(resolvedSlug);
    if (!provider) return { user: null, setCookieHeaders: [] };
    return provider.refreshSession(request);
}

