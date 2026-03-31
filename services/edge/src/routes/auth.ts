/**
 * Auth Routes — Server-side login/signup/logout via @supabase/ssr
 * 
 * The gated page form POSTs here instead of calling Supabase client-side.
 * All session cookies are managed by @supabase/ssr's createServerClient.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { SupabaseAuthProvider } from '../ssr/lib/SupabaseAuthProvider.js';
import { stateProvider } from '../storage/index.js';

async function resolveDynamicRedirect(
    client: Awaited<ReturnType<SupabaseAuthProvider['createClient']>>,
    userId: string,
    formId: string | undefined,
    isEmbed: boolean,
    fallbackRedirect: string
): Promise<string> {
    if (!client) return fallbackRedirect;

    try {
        const settings = await stateProvider.getProjectSettings();
        
        // 1. Form-level override (Embedded Auth)
        if (isEmbed && formId && settings.authForms) {
            const authFormsConfig = JSON.parse(settings.authForms);
            const formConfig = authFormsConfig[formId];
            if (formConfig?.redirectUrl) {
                return formConfig.redirectUrl;
            }
        }

        // 2. Contact Type Gated Homepage override
        if (settings.usersConfig) {
            const usersConfig = JSON.parse(settings.usersConfig);
            const { contactsTable, columnMapping, contactTypeHomePages } = usersConfig;
            
            if (contactsTable && columnMapping && contactTypeHomePages) {
                const typeCol = columnMapping.contactTypeColumn;
                const authUserCol = columnMapping.authUserIdColumn || 'id';
                
                if (typeCol) {
                    const { data, error } = await client.supabase
                        .from(contactsTable)
                        .select(typeCol)
                        .eq(authUserCol, userId)
                        .maybeSingle();

                    if (data && !error) {
                        const contactType = data[typeCol];
                        const homePageId = contactTypeHomePages[contactType];
                        
                        if (homePageId && homePageId !== '_default_') {
                            const pages = await stateProvider.listPages();
                            const targetPage = pages.find((p: any) => p.id === homePageId);
                            if (targetPage) {
                                return `/${targetPage.slug}`;
                            }
                        }
                    } else if (error) {
                        console.warn('[Auth] Error querying contact type:', error);
                    }
                }
            }
        }
    } catch (e) {
        console.error('[Auth] Error resolving dynamic redirect:', e);
    }
    
    return fallbackRedirect;
}

const authRoute = new OpenAPIHono();

// =============================================================================
// POST /api/auth/login
// =============================================================================

authRoute.post('/login', async (c) => {
    const provider = new SupabaseAuthProvider();
    const client = await provider.createClient(c.req.raw);

    if (!client) {
        return c.json({ error: 'Supabase not configured' }, 503);
    }

    let email: string;
    let password: string;
    let redirectTo: string;
    let isEmbed: boolean = false;
    let formId: string | undefined;

    // Support both form-encoded and JSON
    const contentType = c.req.header('Content-Type') || '';
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        const form = await c.req.parseBody();
        email = (form['email'] as string) || '';
        password = (form['password'] as string) || '';
        redirectTo = (form['redirectTo'] as string) || '/';
        isEmbed = form['isEmbed'] === 'true';
        formId = form['formId'] as string;
    } else {
        const body = await c.req.json<{ email?: string; password?: string; redirectTo?: string; isEmbed?: boolean; formId?: string }>();
        email = body.email || '';
        password = body.password || '';
        redirectTo = body.redirectTo || '/';
        isEmbed = !!body.isEmbed;
        formId = body.formId;
    }

    if (!email || !password) {
        return c.json({ error: 'Email and password required' }, 400);
    }

    const { data, error } = await client.supabase.auth.signInWithPassword({ email, password });

    if (error) {
        // For form submissions, redirect back with error
        if (contentType.includes('form')) {
            const errorUrl = new URL(redirectTo, new URL(c.req.url).origin);
            errorUrl.searchParams.set('auth_error', error.message);
            return c.redirect(errorUrl.toString(), 303);
        }
        return c.json({ error: error.message }, 401);
    }

    // Apply session cookies from @supabase/ssr
    const cookieHeaders = client.getCookieHeaders();
    for (const header of cookieHeaders) {
        c.header('Set-Cookie', header, { append: true });
    }

    let finalRedirect = redirectTo;
    let enrichedUser = null;
    if (data.user) {
        finalRedirect = await resolveDynamicRedirect(client, data.user.id, formId, isEmbed, redirectTo);
        enrichedUser = await provider.enrichUserContext(data.user, data.session?.access_token);
    }

    if (contentType.includes('form')) {
        if (isEmbed) {
            const userJson = enrichedUser ? JSON.stringify(enrichedUser) : 'null';
            return c.html(`
                <!DOCTYPE html>
                <html>
                <body>
                    <script>
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'frontbase-auth-success', redirectUrl: '${finalRedirect}', user: ${userJson} }, '*');
                        } else {
                            window.location.href = '${finalRedirect}';
                        }
                    </script>
                </body>
                </html>
            `, 200);
        }
        return c.redirect(finalRedirect, 303);
    }

    return c.json({ success: true, user: enrichedUser, redirectUrl: finalRedirect });
});

// =============================================================================
// GET /api/auth/me
// =============================================================================

authRoute.get('/me', async (c) => {
    const provider = new SupabaseAuthProvider();
    const user = await provider.getUserFromRequest(c.req.raw);
    
    if (user) {
        return c.json({ success: true, user });
    }
    
    return c.json({ success: false, user: null }, 401);
});

// =============================================================================
// POST /api/auth/signup
// =============================================================================

authRoute.post('/signup', async (c) => {
    const provider = new SupabaseAuthProvider();
    const client = await provider.createClient(c.req.raw);

    if (!client) {
        return c.json({ error: 'Supabase not configured' }, 503);
    }

    let email: string;
    let password: string;
    let redirectTo: string;
    let isEmbed: boolean = false;
    let formId: string | undefined;

    const contentType = c.req.header('Content-Type') || '';
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        const form = await c.req.parseBody();
        email = (form['email'] as string) || '';
        password = (form['password'] as string) || '';
        redirectTo = (form['redirectTo'] as string) || '/';
        isEmbed = form['isEmbed'] === 'true';
        formId = form['formId'] as string;
    } else {
        const body = await c.req.json<{ email?: string; password?: string; redirectTo?: string; isEmbed?: boolean; formId?: string }>();
        email = body.email || '';
        password = body.password || '';
        redirectTo = body.redirectTo || '/';
        isEmbed = !!body.isEmbed;
        formId = body.formId;
    }

    if (!email || !password) {
        return c.json({ error: 'Email and password required' }, 400);
    }

    const { data, error } = await client.supabase.auth.signUp({ email, password });

    if (error) {
        if (contentType.includes('form')) {
            const errorUrl = new URL(redirectTo, new URL(c.req.url).origin);
            errorUrl.searchParams.set('auth_error', error.message);
            return c.redirect(errorUrl.toString(), 303);
        }
        return c.json({ error: error.message }, 400);
    }

    // If email confirmation is required (no session returned)
    if (data.user && !data.session) {
        if (contentType.includes('form')) {
            const successUrl = new URL(redirectTo, new URL(c.req.url).origin);
            successUrl.searchParams.set('auth_message', 'Check your email to confirm your account');
            if (isEmbed) {
                return c.html(`
                    <!DOCTYPE html>
                    <html>
                    <body>
                        <script>
                            if (window.parent && window.parent !== window) {
                                window.parent.postMessage({ type: 'frontbase-auth-success', redirectUrl: '${successUrl.toString()}' }, '*');
                            } else {
                                window.location.href = '${successUrl.toString()}';
                            }
                        </script>
                    </body>
                    </html>
                `, 200);
            }
            return c.redirect(successUrl.toString(), 303);
        }
        return c.json({ success: true, message: 'Check your email to confirm your account' });
    }

    // Session created — set cookies
    const cookieHeaders = client.getCookieHeaders();
    for (const header of cookieHeaders) {
        c.header('Set-Cookie', header, { append: true });
    }

    let finalRedirect = redirectTo;
    let enrichedUser = null;
    if (data.user) {
        finalRedirect = await resolveDynamicRedirect(client, data.user.id, formId, isEmbed, redirectTo);
        enrichedUser = await provider.enrichUserContext(data.user, data.session?.access_token);
    }

    if (contentType.includes('form')) {
        if (isEmbed) {
            const userJson = enrichedUser ? JSON.stringify(enrichedUser) : 'null';
            return c.html(`
                <!DOCTYPE html>
                <html>
                <body>
                    <script>
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'frontbase-auth-success', redirectUrl: '${finalRedirect}', user: ${userJson} }, '*');
                        } else {
                            window.location.href = '${finalRedirect}';
                        }
                    </script>
                </body>
                </html>
            `, 200);
        }
        return c.redirect(finalRedirect, 303);
    }

    return c.json({ success: true, user: enrichedUser, redirectUrl: finalRedirect });
});

// =============================================================================
// POST /api/auth/logout
// =============================================================================

authRoute.post('/logout', async (c) => {
    const provider = new SupabaseAuthProvider();
    const client = await provider.createClient(c.req.raw);

    if (!client) {
        return c.json({ error: 'Supabase not configured' }, 503);
    }

    await client.supabase.auth.signOut();

    // Apply cookie-clearing headers from @supabase/ssr
    const cookieHeaders = client.getCookieHeaders();
    for (const header of cookieHeaders) {
        c.header('Set-Cookie', header, { append: true });
    }

    const contentType = c.req.header('Content-Type') || '';
    const redirectTo = c.req.query('redirectTo') || '/';

    if (contentType.includes('form')) {
        return c.redirect(redirectTo, 303);
    }

    return c.json({ success: true });
});

export { authRoute };
