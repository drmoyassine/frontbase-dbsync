/**
 * Auth Routes — Server-side login/signup/logout via @supabase/ssr
 * 
 * The gated page form POSTs here instead of calling Supabase client-side.
 * All session cookies are managed by @supabase/ssr's createServerClient.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { SupabaseAuthProvider } from '../ssr/lib/SupabaseAuthProvider.js';
import { stateProvider } from '../storage/index.js';
import { getAuthConfig } from '../config/env.js';
import { rateLimit } from '../cache/redis.js';
import { getBotProtection } from '../config/securityConfig.js';
import { verifyCaptchaToken } from '../middleware/captchaVerify.js';

function isSafeRedirect(urlStr: string, requestUrl: string): boolean {
    if (!urlStr) return false;
    // Allow relative paths (starting with / but NOT //)
    if (urlStr.startsWith('/') && !urlStr.startsWith('//')) {
        return true;
    }
    try {
        const parsedRedirect = new URL(urlStr);
        const parsedRequest = new URL(requestUrl);
        return parsedRedirect.host === parsedRequest.host;
    } catch {
        return false;
    }
}

function safeScriptJson(val: any): string {
    return JSON.stringify(val)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\//g, '\\u002f')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function getTargetOrigin(redirectUrl: string, requestUrl: string): string {
    if (redirectUrl.startsWith('/') && !redirectUrl.startsWith('//')) {
        try {
            return new URL(requestUrl).origin;
        } catch {
            return '*';
        }
    }
    try {
        return new URL(redirectUrl).origin;
    } catch {
        return '*';
    }
}

function getClientIp(c: Context): string {
    return c.req.header('cf-connecting-ip')
        || c.req.header('x-real-ip')
        || c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
        || 'unknown';
}

async function checkRateLimit(c: Context, key: string, limit: number, windowSeconds: number): Promise<boolean> {
    try {
        const ip = getClientIp(c);
        const rateLimitKey = `ratelimit:auth:${key}:${ip}`;
        const res = await rateLimit(rateLimitKey, limit, windowSeconds);
        return res.allowed;
    } catch {
        // Fallback to allow if Redis is not configured
        return true;
    }
}

async function resolveDynamicRedirect(
    client: Awaited<ReturnType<SupabaseAuthProvider['createClient']>>,
    userId: string,
    formId: string | undefined,
    isEmbed: boolean,
    fallbackRedirect: string,
    tenantSlug?: string
): Promise<string> {
    if (!client) return fallbackRedirect;

    try {
        const settings = await stateProvider.getProjectSettings(tenantSlug);
        
        // 1. Form-level override (Embedded Auth)
        if (isEmbed && formId && settings.authForms) {
            const authFormsConfig = JSON.parse(settings.authForms);
            const formConfig = authFormsConfig[formId];
            if (formConfig?.redirectUrl) {
                return formConfig.redirectUrl;
            }
        }

        // 2. Contact Type Gated Homepage override (from FRONTBASE_AUTH env var)
        const authCfg = getAuthConfig(tenantSlug);
        const contacts = authCfg.contacts;
        if (contacts?.table && contacts?.columnMapping && contacts?.contactTypeHomePages) {
            const typeCol = contacts.columnMapping.contactTypeColumn;
            const authUserCol = contacts.columnMapping.authUserIdColumn || 'id';
            
            if (typeCol) {
                const { data, error } = await client.supabase
                    .from(contacts.table)
                    .select(typeCol)
                    .eq(authUserCol, userId)
                    .maybeSingle();

                if (data && !error) {
                    const contactType = data[typeCol];
                    const homePageId = contacts.contactTypeHomePages[contactType];
                    
                    if (homePageId && homePageId !== '_default_') {
                        const pages = await stateProvider.listPages(tenantSlug);
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
    } catch (e) {
        console.error('[Auth] Error resolving dynamic redirect:', e);
    }
    
    return fallbackRedirect;
}

const authRoute = new OpenAPIHono();

// =============================================================================
// POST /api/page-auth/login
// =============================================================================

authRoute.post('/login', async (c) => {
    let email = '';
    let password = '';
    let redirectTo = '/';
    let isEmbed = false;
    let formId: string | undefined;
    let captchaToken = '';

    const contentType = c.req.header('Content-Type') || '';
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        const form = await c.req.parseBody();
        email = (form['email'] as string) || '';
        password = (form['password'] as string) || '';
        redirectTo = (form['redirectTo'] as string) || '/';
        isEmbed = form['isEmbed'] === 'true';
        formId = form['formId'] as string;
        captchaToken = (form['cf-turnstile-response'] as string) || 
                       (form['g-recaptcha-response'] as string) || 
                       (form['captchaToken'] as string) || '';
    } else {
        const body = await c.req.json<{ email?: string; password?: string; redirectTo?: string; isEmbed?: boolean; formId?: string; captchaToken?: string; 'cf-turnstile-response'?: string; 'g-recaptcha-response'?: string }>().catch(() => null);
        if (body) {
            email = body.email || '';
            password = body.password || '';
            redirectTo = body.redirectTo || '/';
            isEmbed = !!body.isEmbed;
            formId = body.formId;
            captchaToken = body.captchaToken || body['cf-turnstile-response'] || body['g-recaptcha-response'] || '';
        }
    }

    if (!isSafeRedirect(redirectTo, c.req.url)) {
        redirectTo = '/';
    }

    // 1. IP-based Rate Limiting (10 requests per 60 seconds per IP)
    const allowed = await checkRateLimit(c, 'login', 10, 60);
    if (!allowed) {
        if (contentType.includes('form')) {
            const errorUrl = new URL(redirectTo, new URL(c.req.url).origin);
            errorUrl.searchParams.set('auth_error', 'Too many attempts. Please try again later.');
            return c.redirect(errorUrl.toString(), 303);
        }
        return c.json({ error: 'Too many attempts. Please try again later.' }, 429);
    }

    // 2. CAPTCHA Verification
    const botConfig = getBotProtection();
    if (botConfig && botConfig.enabled && botConfig.protectLogin) {
        const clientIp = getClientIp(c);
        const verifyResult = await verifyCaptchaToken(captchaToken, clientIp);
        if (!verifyResult.success) {
            const errorMsg = verifyResult.error || 'CAPTCHA verification failed';
            if (contentType.includes('form')) {
                const errorUrl = new URL(redirectTo, new URL(c.req.url).origin);
                errorUrl.searchParams.set('auth_error', errorMsg);
                return c.redirect(errorUrl.toString(), 303);
            }
            return c.json({ error: errorMsg }, 403);
        }
    }

    const tenantSlug = (c as any).get('tenantSlug') as string | undefined;
    const provider = new SupabaseAuthProvider(tenantSlug);
    const client = await provider.createClient(c.req.raw);

    if (!client) {
        return c.json({ error: 'Supabase not configured' }, 503);
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
        finalRedirect = await resolveDynamicRedirect(client, data.user.id, formId, isEmbed, redirectTo, tenantSlug);
        // Double-check the dynamically resolved redirect too
        if (!isSafeRedirect(finalRedirect, c.req.url)) {
            finalRedirect = '/';
        }
        enrichedUser = await provider.enrichUserContext(data.user, data.session?.access_token);
    }

    if (contentType.includes('form')) {
        if (isEmbed) {
            const safeRedirectJson = safeScriptJson(finalRedirect);
            const safeUserJson = enrichedUser ? safeScriptJson(enrichedUser) : 'null';
            const targetOrigin = getTargetOrigin(finalRedirect, c.req.url);
            const safeTargetOriginJson = safeScriptJson(targetOrigin);
            return c.html(`
                <!DOCTYPE html>
                <html>
                <body>
                    <script>
                        (function() {
                            const redirectUrl = ${safeRedirectJson};
                            const user = ${safeUserJson};
                            const targetOrigin = ${safeTargetOriginJson};
                            if (window.parent && window.parent !== window) {
                                window.parent.postMessage({ type: 'frontbase-auth-success', redirectUrl: redirectUrl, user: user }, targetOrigin);
                            } else {
                                window.location.href = redirectUrl;
                            }
                        })();
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
// GET /api/page-auth/me
// =============================================================================

authRoute.get('/me', async (c) => {
    const tenantSlug = (c as any).get('tenantSlug') as string | undefined;
    const provider = new SupabaseAuthProvider(tenantSlug);
    const user = await provider.getUserFromRequest(c.req.raw);
    
    if (user) {
        return c.json({ success: true, user });
    }
    
    return c.json({ success: false, user: null }, 401);
});

// =============================================================================
// POST /api/page-auth/signup
// =============================================================================

authRoute.post('/signup', async (c) => {
    let email = '';
    let password = '';
    let redirectTo = '/';
    let isEmbed = false;
    let formId: string | undefined;
    let captchaToken = '';

    const contentType = c.req.header('Content-Type') || '';
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        const form = await c.req.parseBody();
        email = (form['email'] as string) || '';
        password = (form['password'] as string) || '';
        redirectTo = (form['redirectTo'] as string) || '/';
        isEmbed = form['isEmbed'] === 'true';
        formId = form['formId'] as string;
        captchaToken = (form['cf-turnstile-response'] as string) || 
                       (form['g-recaptcha-response'] as string) || 
                       (form['captchaToken'] as string) || '';
    } else {
        const body = await c.req.json<{ email?: string; password?: string; redirectTo?: string; isEmbed?: boolean; formId?: string; captchaToken?: string; 'cf-turnstile-response'?: string; 'g-recaptcha-response'?: string }>().catch(() => null);
        if (body) {
            email = body.email || '';
            password = body.password || '';
            redirectTo = body.redirectTo || '/';
            isEmbed = !!body.isEmbed;
            formId = body.formId;
            captchaToken = body.captchaToken || body['cf-turnstile-response'] || body['g-recaptcha-response'] || '';
        }
    }

    if (!isSafeRedirect(redirectTo, c.req.url)) {
        redirectTo = '/';
    }

    // 1. IP-based Rate Limiting (10 requests per 60 seconds per IP)
    const allowed = await checkRateLimit(c, 'signup', 10, 60);
    if (!allowed) {
        if (contentType.includes('form')) {
            const errorUrl = new URL(redirectTo, new URL(c.req.url).origin);
            errorUrl.searchParams.set('auth_error', 'Too many attempts. Please try again later.');
            return c.redirect(errorUrl.toString(), 303);
        }
        return c.json({ error: 'Too many attempts. Please try again later.' }, 429);
    }

    // 2. CAPTCHA Verification
    const botConfig = getBotProtection();
    if (botConfig && botConfig.enabled && botConfig.protectLogin) {
        const clientIp = getClientIp(c);
        const verifyResult = await verifyCaptchaToken(captchaToken, clientIp);
        if (!verifyResult.success) {
            const errorMsg = verifyResult.error || 'CAPTCHA verification failed';
            if (contentType.includes('form')) {
                const errorUrl = new URL(redirectTo, new URL(c.req.url).origin);
                errorUrl.searchParams.set('auth_error', errorMsg);
                return c.redirect(errorUrl.toString(), 303);
            }
            return c.json({ error: errorMsg }, 403);
        }
    }

    const tenantSlug = (c as any).get('tenantSlug') as string | undefined;
    const provider = new SupabaseAuthProvider(tenantSlug);
    const client = await provider.createClient(c.req.raw);

    if (!client) {
        return c.json({ error: 'Supabase not configured' }, 503);
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
                const targetOrigin = getTargetOrigin(successUrl.toString(), c.req.url);
                const safeSuccessUrlJson = safeScriptJson(successUrl.toString());
                const safeTargetOriginJson = safeScriptJson(targetOrigin);
                return c.html(`
                    <!DOCTYPE html>
                    <html>
                    <body>
                        <script>
                            (function() {
                                const redirectUrl = ${safeSuccessUrlJson};
                                const targetOrigin = ${safeTargetOriginJson};
                                if (window.parent && window.parent !== window) {
                                    window.parent.postMessage({ type: 'frontbase-auth-success', redirectUrl: redirectUrl }, targetOrigin);
                                } else {
                                    window.location.href = redirectUrl;
                                }
                            })();
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
        finalRedirect = await resolveDynamicRedirect(client, data.user.id, formId, isEmbed, redirectTo, tenantSlug);
        // Double-check the dynamically resolved redirect too
        if (!isSafeRedirect(finalRedirect, c.req.url)) {
            finalRedirect = '/';
        }
        enrichedUser = await provider.enrichUserContext(data.user, data.session?.access_token);
    }

    if (contentType.includes('form')) {
        if (isEmbed) {
            const safeRedirectJson = safeScriptJson(finalRedirect);
            const safeUserJson = enrichedUser ? safeScriptJson(enrichedUser) : 'null';
            const targetOrigin = getTargetOrigin(finalRedirect, c.req.url);
            const safeTargetOriginJson = safeScriptJson(targetOrigin);
            return c.html(`
                <!DOCTYPE html>
                <html>
                <body>
                    <script>
                        (function() {
                            const redirectUrl = ${safeRedirectJson};
                            const user = ${safeUserJson};
                            const targetOrigin = ${safeTargetOriginJson};
                            if (window.parent && window.parent !== window) {
                                window.parent.postMessage({ type: 'frontbase-auth-success', redirectUrl: redirectUrl, user: user }, targetOrigin);
                            } else {
                                window.location.href = redirectUrl;
                            }
                        })();
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
// POST /api/page-auth/logout
// =============================================================================

authRoute.post('/logout', async (c) => {
    const tenantSlug = (c as any).get('tenantSlug') as string | undefined;
    const provider = new SupabaseAuthProvider(tenantSlug);
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
    const safeRedirect = isSafeRedirect(redirectTo, c.req.url) ? redirectTo : '/';

    if (contentType.includes('form')) {
        return c.redirect(safeRedirect, 303);
    }

    return c.json({ success: true });
});

export { authRoute };
