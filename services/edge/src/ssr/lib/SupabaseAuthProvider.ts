/**
 * SupabaseAuthProvider — Supabase Auth via @supabase/ssr
 * 
 * Uses createServerClient() from @supabase/ssr for proper cookie-based
 * SSR authentication. All cookie management (chunking, naming, refresh)
 * is handled by the library.
 * 
 * Client-side: gated page form POSTs to /api/auth/login (no client SDK)
 * Server-side: createServerClient reads/writes cookies natively
 */

import { createServerClient } from '@supabase/ssr';
import type { IAuthProvider, UserContext, SessionRefreshResult } from './IAuthProvider.js';

// =============================================================================
// Credential Resolution — reads FRONTBASE_AUTH env var (single source of truth)
// =============================================================================

import { getAuthConfig } from '../../config/env.js';

function getSupabaseConfig(): { url: string; anonKey: string } | null {
    const auth = getAuthConfig();
    if (auth.provider === 'supabase' && auth.url && auth.anonKey) {
        return { url: auth.url, anonKey: auth.anonKey };
    }
    return null;
}

// =============================================================================
// Cookie Helpers
// =============================================================================

interface ParsedCookie {
    name: string;
    value: string;
}

function parseCookieHeader(cookieHeader: string): ParsedCookie[] {
    if (!cookieHeader) return [];
    return cookieHeader.split(';').map(c => {
        const [name, ...rest] = c.trim().split('=');
        return { name: name || '', value: rest.join('=') };
    }).filter(c => c.name);
}

function serializeSetCookie(
    name: string,
    value: string,
    options?: { path?: string; maxAge?: number; domain?: string; sameSite?: string; secure?: boolean; httpOnly?: boolean }
): string {
    let header = `${name}=${value}`;
    if (options?.path) header += `; Path=${options.path}`;
    if (options?.maxAge !== undefined) header += `; Max-Age=${options.maxAge}`;
    if (options?.domain) header += `; Domain=${options.domain}`;
    if (options?.sameSite) header += `; SameSite=${options.sameSite}`;
    if (options?.secure) header += '; Secure';
    if (options?.httpOnly) header += '; HttpOnly';
    return header;
}

// =============================================================================
// SupabaseAuthProvider
// =============================================================================

export class SupabaseAuthProvider implements IAuthProvider {

    /**
     * Create a server-side Supabase client that reads cookies from the request
     * and captures Set-Cookie headers for the response.
     */
    async createClient(request: Request): Promise<{
        supabase: ReturnType<typeof createServerClient>;
        getCookieHeaders: () => string[];
    } | null> {
        const config = await getSupabaseConfig();
        if (!config) return null;

        const cookies = parseCookieHeader(request.headers.get('Cookie') || '');
        const setCookieHeaders: string[] = [];

        const supabase = createServerClient(config.url, config.anonKey, {
            cookies: {
                getAll: () => cookies,
                setAll: (cookiesToSet) => {
                    for (const { name, value, options } of cookiesToSet) {
                        const sameSite = typeof options?.sameSite === 'string' ? options.sameSite : undefined;
                        setCookieHeaders.push(serializeSetCookie(name, value, { ...options, sameSite }));
                    }
                },
            },
        });

        return { supabase, getCookieHeaders: () => setCookieHeaders };
    }

    async getUserFromRequest(request: Request): Promise<UserContext | null> {
        const client = await this.createClient(request);
        if (!client) {
            console.warn('[Auth] Supabase credentials not configured.');
            return null;
        }

        try {
            const { data: { user }, error } = await client.supabase.auth.getUser();
            if (error || !user) return null;

            // Get session access token for RLS-protected contacts query
            const { data: sessionData } = await client.supabase.auth.getSession();
            const accessToken = sessionData?.session?.access_token;

            return await this.enrichUserContext(user, accessToken);
        } catch (err) {
            console.error('[Auth] getUserFromRequest error:', err);
            return null;
        }
    }

    async refreshSession(request: Request): Promise<SessionRefreshResult> {
        const client = await this.createClient(request);
        if (!client) {
            return { user: null, setCookieHeaders: [] };
        }

        try {
            // getUser() validates the JWT and triggers refresh if expired.
            // Any refreshed tokens are captured via the setAll callback.
            const { data: { user }, error } = await client.supabase.auth.getUser();
            if (error || !user) {
                return { user: null, setCookieHeaders: client.getCookieHeaders() };
            }

            // Get session access token for RLS-protected contacts query
            const { data: sessionData } = await client.supabase.auth.getSession();
            const accessToken = sessionData?.session?.access_token;

            return {
                user: await this.enrichUserContext(user, accessToken),
                setCookieHeaders: client.getCookieHeaders(),
                accessToken,
            };
        } catch (err) {
            console.error('[Auth] refreshSession error:', err);
            return { user: null, setCookieHeaders: [] };
        }
    }

    public async enrichUserContext(user: any, accessToken?: string): Promise<UserContext> {
        const baseContext: UserContext = {
            id: user.id,
            email: user.email || '',
            name: user.user_metadata?.full_name || user.user_metadata?.name || '',
            firstName: user.user_metadata?.first_name || '',
            lastName: user.user_metadata?.last_name || '',
            avatar: user.user_metadata?.avatar_url,
            role: user.role || 'user',
        };

        try {
            // Read contacts config from FRONTBASE_AUTH env var (not state DB)
            const authCfg = getAuthConfig();
            const contacts = authCfg.contacts;
            if (!contacts?.table || !contacts?.datasource || !contacts?.columnMapping) {
                return baseContext;
            }

            const authUserCol = contacts.columnMapping.authUserIdColumn || 'auth_user_id';

            // Create the correct adapter from baked credentials (Supabase, Neon, Turso, etc.)
            const { createDatasourceAdapter } = await import('../../db/datasource-adapter.js');
            const adapter = createDatasourceAdapter({
                ...contacts.datasource,
                id: 'contacts',
                name: 'Contacts Datasource',
            } as any);

            const result = await adapter.query({
                table: contacts.table,
                filters: { [authUserCol]: user.id },
                limit: 1,
                accessToken, // Pass user's JWT so RLS policies work
            });

            if (result.data && result.data.length > 0) {
                const record = result.data[0];

                // Merge contact record into base context
                const enrichedContext = { ...baseContext, ...record };

                // Protect critical auth fields from being overwritten
                enrichedContext.id = baseContext.id;
                enrichedContext.contactId = record[contacts.columnMapping.contactIdColumn] || '';

                if (contacts.columnMapping.emailColumn && record[contacts.columnMapping.emailColumn]) {
                    enrichedContext.email = record[contacts.columnMapping.emailColumn] as string;
                }
                if (contacts.columnMapping.nameColumn && record[contacts.columnMapping.nameColumn]) {
                    enrichedContext.name = record[contacts.columnMapping.nameColumn] as string;
                }

                console.log(`[Auth] Enriched user context with contact record for ${user.id}`);
                return enrichedContext;
            }
        } catch (err) {
            console.error('[Auth] Error enriching contact record:', err);
        }

        return baseContext;
    }
}
