/**
 * Supabase Auth - User Session Handler
 * 
 * Decodes Supabase JWT and fetches user record from contacts table.
 * MVP: Supabase Auth only. Post-MVP: Support Clerk, Auth0, etc.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface UserContext {
    id: string;
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    role: string;
    phone?: string;
    company?: string;
    createdAt?: string;
    [key: string]: unknown;
}

// =============================================================================
// Supabase Client
// =============================================================================

let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
    if (supabase) return supabase;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.warn('Supabase credentials not configured. User auth will be disabled.');
        return null;
    }

    supabase = createClient(supabaseUrl, supabaseAnonKey);
    return supabase;
}

// =============================================================================
// Auth Functions
// =============================================================================

/**
 * Get authenticated user from request.
 * 
 * 1. Extract JWT from cookie or Authorization header
 * 2. Verify & decode JWT via Supabase
 * 3. Fetch full user record from contacts table
 */
export async function getUserFromSession(request: Request): Promise<UserContext | null> {
    try {
        const client = getSupabaseClient();
        if (!client) return null;

        // 1. Extract access token
        const accessToken = extractAccessToken(request);
        if (!accessToken) return null;

        // 2. Verify token and get Supabase user
        const { data: { user }, error } = await client.auth.getUser(accessToken);
        if (error || !user) {
            console.warn('Auth verification failed:', error?.message);
            return null;
        }

        // 3. Fetch full user record from contacts table
        const { data: contact, error: contactError } = await client
            .from('contacts')
            .select('*')
            .eq('email', user.email)
            .single();

        if (contactError || !contact) {
            // User exists in auth but not in contacts - return minimal info from auth
            return {
                id: user.id,
                email: user.email || '',
                name: user.user_metadata?.full_name || user.user_metadata?.name || '',
                firstName: user.user_metadata?.first_name || '',
                lastName: user.user_metadata?.last_name || '',
                avatar: user.user_metadata?.avatar_url,
                role: 'user',
            };
        }

        // Return full contact record as user context
        return {
            id: contact.id,
            email: contact.email,
            name: contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
            firstName: contact.first_name || '',
            lastName: contact.last_name || '',
            avatar: contact.avatar_url,
            role: contact.role || 'user',
            phone: contact.phone,
            company: contact.company,
            createdAt: contact.created_at,
            // Include all other contact fields dynamically
            ...contact,
        };

    } catch (error) {
        console.error('getUserFromSession error:', error);
        return null;
    }
}

/**
 * Extract access token from request.
 * Checks: 1) sb-access-token cookie, 2) Authorization header
 */
function extractAccessToken(request: Request): string | null {
    // Try cookie first (preferred for SSR)
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = parseCookies(cookieHeader);

    // Supabase stores tokens in these cookie names
    const tokenCookieNames = [
        'sb-access-token',
        'supabase-auth-token',
        'sb-auth-token',
    ];

    for (const name of tokenCookieNames) {
        if (cookies[name]) {
            // Handle JSON-encoded token (Supabase sometimes wraps it)
            try {
                const parsed = JSON.parse(cookies[name]);
                if (parsed.access_token) return parsed.access_token;
                if (typeof parsed === 'string') return parsed;
            } catch {
                return cookies[name];
            }
        }
    }

    // Fallback to Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }

    return null;
}

/**
 * Parse cookies from Cookie header
 */
function parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach(cookie => {
        const [name, ...rest] = cookie.trim().split('=');
        if (name) {
            cookies[name] = decodeURIComponent(rest.join('='));
        }
    });
    return cookies;
}
