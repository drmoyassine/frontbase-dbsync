/**
 * SSR Pages Route
 * 
 * Renders published pages server-side for Edge deployment.
 * Route: /p/:slug
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { renderPage } from '../ssr/PageRenderer.js';
import { buildTemplateContext, PageData as ContextPageData } from '../ssr/lib/context.js';
import { getDefaultTrackingConfig, TrackingConfig } from '../ssr/lib/tracking.js';
import { stateProvider } from '../storage/index.js';
import { generateHtmlDocument, type HtmlPageData } from '../ssr/htmlDocument.js';
import { generateGatedPageDocument } from '../ssr/gatedPage.js';
import { refreshSession } from '../ssr/lib/auth.js';
import { getAuthConfig } from '../config/env.js';
import type { AuthConfig } from '../ssr/htmlDocument.js';
import { getRedis } from '../cache/redis.js';

// ============================================================================
// Caches & Globals
// ============================================================================

// L1 HTML Cache
const _htmlCache = new Map<string, { html: string; ts: number }>();
const HTML_CACHE_TTL_MS = 60_000; // 60 seconds

export function invalidateHtmlCache(slug: string) {
    _htmlCache.delete(`html:${slug}:mobile`);
    _htmlCache.delete(`html:${slug}:tablet`);
    _htmlCache.delete(`html:${slug}:desktop`);
    _htmlCache.delete(`html:__homepage__:mobile`);
    _htmlCache.delete(`html:__homepage__:tablet`);
    _htmlCache.delete(`html:__homepage__:desktop`);
}

function getCacheKey(slug: string, device: string): string {
    return `html:${slug}:${device}`;
}

const DEFAULT_FAVICON = '/static/icon.png';
const SETTINGS_TTL_MS = 30_000;   // Cache settings for 30s
const SETTINGS_TIMEOUT_MS = 3_000; // Abort if state DB is slow

interface CachedSettings {
    faviconUrl: string;
    authConfig: AuthConfig | null;
    ts: number;
}
let _settingsCache: CachedSettings | null = null;

/**
 * Get project settings with in-memory cache + timeout guard.
 * Consolidates getFaviconUrl() + getProjectSettings() into one call.
 * On timeout or error, returns safe defaults so the page still renders.
 */
async function getCachedSettings(sessionAccessToken?: string): Promise<CachedSettings> {
    if (_settingsCache && (Date.now() - _settingsCache.ts) < SETTINGS_TTL_MS) {
        // Return cached copy, but update the accessToken (per-request)
        if (sessionAccessToken && _settingsCache.authConfig) {
            return { ..._settingsCache, authConfig: { ..._settingsCache.authConfig, accessToken: sessionAccessToken } };
        }
        return _settingsCache;
    }
    try {
        const settings = await Promise.race([
            stateProvider.getProjectSettings(),
            new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('settings_timeout')), SETTINGS_TIMEOUT_MS)
            ),
        ]);

        // Build authConfig from FRONTBASE_AUTH env var (not state DB)
        let authConfig: AuthConfig | null = null;
        const authEnv = getAuthConfig();
        if (authEnv.contacts?.table && authEnv.url && authEnv.anonKey) {
            authConfig = {
                url: authEnv.url,
                anonKey: authEnv.anonKey,
                contactsTable: authEnv.contacts.table,
                authUserIdColumn: authEnv.contacts.columnMapping?.authUserIdColumn || 'auth_user_id',
                accessToken: sessionAccessToken,
            };
        }

        _settingsCache = {
            faviconUrl: settings?.faviconUrl || DEFAULT_FAVICON,
            authConfig,
            ts: Date.now(),
        };
        return _settingsCache;
    } catch (e) {
        console.warn('[Pages] Settings fetch failed/timeout:', (e as Error).message);
        // Return safe defaults — page renders without auth config
        return {
            faviconUrl: _settingsCache?.faviconUrl || DEFAULT_FAVICON,
            authConfig: null,
            ts: Date.now(),
        };
    }
}

// Type definitions for page data
interface PageComponent {
    id: string;
    type: string;
    props?: Record<string, unknown>;
    children?: PageComponent[];
}

interface PageLayoutData {
    content: PageComponent[];
    root?: Record<string, unknown>;
}

interface PageData {
    id: string;
    name: string;
    slug: string;
    title?: string;
    description?: string;
    keywords?: string;
    isPublic: boolean;
    isHomepage: boolean;
    layoutData: PageLayoutData;
    datasources?: Record<string, unknown>[];
    cssBundle?: string;  // Tree-shaken CSS from FastAPI publish
}

// Response schemas
const ErrorResponseSchema = z.object({
    error: z.string(),
    message: z.string().optional(),
});

// Create the pages route
const pagesRoute = new OpenAPIHono();

// Middleware: Copy Content-Type → X-Content-Type on every response.
// Supabase Edge Functions strip text/html → text/plain. This header
// lets reverse proxies (CF Transform Rules) restore the original type.
pagesRoute.use('*', async (c, next) => {
    await next();
    const ct = c.res.headers.get('Content-Type');
    if (ct) {
        c.res.headers.set('X-Content-Type', ct);
    }
});

// OpenAPI route definition
const renderPageRoute = createRoute({
    method: 'get',
    path: '/:slug',
    tags: ['Pages'],
    summary: 'Render a published page',
    description: 'Server-side renders a published page by slug. Returns full HTML document.',
    request: {
        params: z.object({
            slug: z.string().min(1).describe('Page slug'),
        }),
    },
    responses: {
        200: {
            description: 'Rendered HTML page',
            content: {
                'text/html': {
                    schema: z.string(),
                },
            },
        },
        404: {
            description: 'Page not found',
            content: {
                'application/json': {
                    schema: ErrorResponseSchema,
                },
            },
        },
    },
});


// Note: Storage init is handled by import.ts module load


async function fetchPage(slug: string): Promise<PageData | null> {
    const cacheKey = `page:${slug}`;

    // L2: Try Redis cache first (Upstash or local)
    try {
        const redis = getRedis();
        const cached = await redis.get<PageData>(cacheKey);
        if (cached) {
            // console.log(`[SSR] Cache HIT: ${slug}`);
            return cached;
        }
    } catch {
        // Redis not initialized or unavailable — continue to storage
    }

    // L3: Try local published pages storage (SQLite/Turso)
    let page: PageData | null = null;
    try {
        const publishedPage = await stateProvider.getPageBySlug(slug);
        if (publishedPage) {
            console.log(`[SSR] Found published page: ${slug} (v${publishedPage.version})`);
            page = {
                id: publishedPage.id,
                name: publishedPage.name,
                slug: publishedPage.slug,
                title: publishedPage.title,
                description: publishedPage.description,
                isPublic: publishedPage.isPublic,
                isHomepage: publishedPage.isHomepage,
                layoutData: publishedPage.layoutData,
                cssBundle: publishedPage.cssBundle,
                createdAt: publishedPage.publishedAt,
                updatedAt: publishedPage.publishedAt,
            } as PageData;
        }
    } catch (error) {
        console.warn('[SSR] Error reading local storage:', error);
    }

    // Fallback to FastAPI for unpublished pages (dev mode only)
    if (!page) {
        const apiBase = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
        try {
            const url = `${apiBase}/api/pages/public/${slug}`;
            console.log(`[SSR] Fallback to FastAPI: ${url}`);

            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                redirect: 'follow',
            });

            if (!response.ok) {
                if (response.status === 404) return null;
                console.error(`Failed to fetch page: ${response.status}`);
                return null;
            }

            const result = await response.json();
            page = result.success ? result.data : null;
        } catch (error) {
            console.error('Error fetching page from FastAPI:', error);
            return null;
        }
    }

    // Populate L2 cache on miss
    if (page) {
        try {
            const redis = getRedis();
            await redis.setex(cacheKey, 60, JSON.stringify(page));
        } catch {
            // Redis not available — no-op
        }
    }

    return page;
}

let _trackingCache: { config: TrackingConfig; ts: number } | null = null;
const TRACKING_TTL_MS = 30_000;

async function fetchTrackingConfig(): Promise<TrackingConfig> {
    if (_trackingCache && (Date.now() - _trackingCache.ts) < TRACKING_TTL_MS) {
        return _trackingCache.config;
    }

    const apiBase = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    try {
        // Note: use trailing slash to avoid 307 redirect from FastAPI
        const response = await fetch(`${apiBase}/api/settings/privacy/`);
        if (response.ok) {
            const config = await response.json();
            _trackingCache = { config, ts: Date.now() };
            return config;
        }
    } catch (error) {
        console.warn('[SSR] Failed to fetch tracking config:', (error as Error).message);
    }
    return getDefaultTrackingConfig();
}

// Route handler
pagesRoute.openapi(renderPageRoute, async (c) => {
    const { slug } = c.req.param();

    const deviceMatch = c.req.header('user-agent')?.toLowerCase().match(/(mobile|tablet|ipad|android(?=.*mobile)|iphone)/i) || [];
    const deviceType = deviceMatch[0] ? (deviceMatch[0].includes('ipad') || deviceMatch[0].includes('tablet') ? 'tablet' : 'mobile') : 'desktop';
    const htmlKey = getCacheKey(slug, deviceType);

    // Try L1 cache FIRST before doing any DB or Redis lookups
    const cachedHtml = _htmlCache.get(htmlKey);
    if (cachedHtml && (Date.now() - cachedHtml.ts) < HTML_CACHE_TTL_MS) {
        c.header('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
        c.header('Content-Type', 'text/html; charset=utf-8');
        c.header('X-Cache', 'HIT');
        return c.html(cachedHtml.html);
    }

    // Fetch page data
    const page = await fetchPage(slug);

    if (!page) {
        return c.json(
            { error: 'Page not found', message: `No page found with slug: ${slug}` },
            404
        );
    }

    // Homepage should only be served at "/", not at "/{slug}"
    // This frees the slug for use by other pages
    if (page.isHomepage) {
        return c.redirect('/', 301);
    }

    // Private page gating — render blurred content with auth overlay
    let sessionAccessToken: string | undefined;
    if (!page.isPublic) {
        // Use refreshSession to validate + renew tokens in one call
        const refreshResult = await refreshSession(c.req.raw);
        const { user, setCookieHeaders } = refreshResult;
        sessionAccessToken = refreshResult.accessToken;

        // Apply any token-refresh cookies to the response
        for (const header of setCookieHeaders) {
            c.header('Set-Cookie', header, { append: true });
        }

        if (!user) {
            // Still render the page fully, but gated behind auth overlay
            const contextPageData: ContextPageData = {
                id: page.id, title: page.title || page.name, slug: page.slug,
                description: page.description, published: page.isPublic,
                createdAt: (page as any).createdAt || new Date().toISOString(),
                updatedAt: (page as any).updatedAt || new Date().toISOString(),
                canonicalUrl: undefined, ogImage: undefined, ogType: 'website', customVariables: {},
            };
            const context = await buildTemplateContext(c.req.raw, contextPageData);
            const bodyHtml = await renderPage(page.layoutData, context);
            const initialState = { pageVariables: context.local, sessionVariables: context.session, cookies: context.cookies, user: context.user };
            const trackingConfig = await fetchTrackingConfig();
            const { faviconUrl } = await getCachedSettings();

            // Get primary auth form config if baked into page bundle
            const authFormConfig = (page as any)._primaryAuthForm || undefined;

            const gatedHtml = generateGatedPageDocument(
                page, bodyHtml, initialState, trackingConfig, faviconUrl,
                authFormConfig
            );
            c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
            c.header('Content-Type', 'text/html; charset=utf-8');
            return c.html(gatedHtml);
        }
    }

    // Build page data for template context
    const contextPageData: ContextPageData = {
        id: page.id,
        title: page.title || page.name,
        slug: page.slug,
        description: page.description,
        published: page.isPublic,
        createdAt: (page as any).createdAt || new Date().toISOString(),
        updatedAt: (page as any).updatedAt || new Date().toISOString(),
        canonicalUrl: undefined,
        ogImage: undefined,
        ogType: 'website',
        customVariables: {},
    };

    // Build template context for LiquidJS
    const context = await buildTemplateContext(
        c.req.raw,
        contextPageData,
        undefined,  // trackingConfig (use defaults)
        undefined   // dataContext
    );

    // Render page components to HTML (async with LiquidJS)
    const bodyHtml = await renderPage(page.layoutData, context);

    // Prepare initial state for client hydration
    const initialState = {
        pageVariables: context.local,
        sessionVariables: context.session,
        cookies: context.cookies,
        user: context.user,
    };

    // Fetch tracking config
    const trackingConfig = await fetchTrackingConfig();

    // Get settings (favicon + auth config) from cached helper — single DB call, 3s timeout
    const { faviconUrl, authConfig } = await getCachedSettings(sessionAccessToken);

    // Generate full HTML document
    const htmlDoc = generateHtmlDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl, authConfig);

    // Set cache headers
    if (page.isPublic) {
        _htmlCache.set(htmlKey, { html: htmlDoc, ts: Date.now() });
        c.header('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
        c.header('X-Cache', 'MISS');
    } else {
        c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    
    c.header('Content-Type', 'text/html; charset=utf-8');

    return c.html(htmlDoc);
});

// Homepage route - renders homepage directly or pulls from FastAPI
pagesRoute.get('/', async (c) => {
    try {
        const deviceMatch = c.req.header('user-agent')?.toLowerCase().match(/(mobile|tablet|ipad|android(?=.*mobile)|iphone)/i) || [];
        const deviceType = deviceMatch[0] ? (deviceMatch[0].includes('ipad') || deviceMatch[0].includes('tablet') ? 'tablet' : 'mobile') : 'desktop';
        const htmlKey = getCacheKey('__homepage__', deviceType);

        // Try L1 cache FIRST before doing any DB or Redis lookups
        const cachedHtml = _htmlCache.get(htmlKey);
        if (cachedHtml && (Date.now() - cachedHtml.ts) < HTML_CACHE_TTL_MS) {
            c.header('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
            c.header('Content-Type', 'text/html; charset=utf-8');
            c.header('X-Cache', 'HIT');
            return c.html(cachedHtml.html);
        }

        const cacheKey = 'page:__homepage__';
        let homepage: any = null;

        // L2: Try Redis cache first
        try {
            const redis = getRedis();
            const cached = await redis.get<any>(cacheKey);
            if (cached) {
                homepage = cached;
            }
        } catch {
            // Redis not available — continue
        }

        if (!homepage) {
            homepage = await stateProvider.getHomepage();

            if (homepage) {
                console.log(`[SSR] Rendering homepage: ${homepage.slug} (v${homepage.version})`);
            } else {
                // Pull-publish: Fetch homepage from FastAPI and store locally
                console.log('[SSR] No local homepage found, pulling from FastAPI...');

                const fastapiUrl = process.env.BACKEND_URL || 'http://backend:8000';
                try {
                    const response = await fetch(`${fastapiUrl}/api/pages/homepage/`);

                    if (response.ok) {
                        const result = await response.json();
                        const pageData = result.data;

                        // Convert to publish format and store
                        const publishData = {
                            id: pageData.id,
                            slug: pageData.slug,
                            name: pageData.name,
                            title: pageData.title || undefined,
                            description: pageData.description || undefined,
                            layoutData: pageData.layoutData,
                            seoData: pageData.seoData || undefined,
                            datasources: pageData.datasources || undefined,
                            version: 1,
                            publishedAt: new Date().toISOString(),
                            isPublic: pageData.isPublic ?? true,
                            isHomepage: true,
                        };

                        await stateProvider.upsertPage(publishData);
                        console.log(`[SSR] Pull-published homepage: ${pageData.slug}`);
                        homepage = publishData;
                    } else {
                        console.warn(`[SSR] FastAPI homepage fetch failed: ${response.status}`);
                    }
                } catch (fetchError) {
                    console.error('[SSR] Pull-publish failed:', fetchError);
                }
            }

            // Populate L2 cache on miss
            if (homepage) {
                try {
                    const redis = getRedis();
                    await redis.setex(cacheKey, 60, JSON.stringify(homepage));
                } catch {
                    // Redis not available — no-op
                }
            }
        }

        // Render the homepage if we have one
        if (homepage) {
            // Private homepage gating
            if (!homepage.isPublic) {
                const { user, setCookieHeaders } = await refreshSession(c.req.raw);
                for (const header of setCookieHeaders) {
                    c.header('Set-Cookie', header, { append: true });
                }
                if (!user) {
                    const page: PageData = {
                        id: homepage.id, slug: homepage.slug, title: homepage.title,
                        description: homepage.description, name: homepage.name,
                        isPublic: homepage.isPublic, isHomepage: homepage.isHomepage,
                        layoutData: homepage.layoutData as unknown as PageLayoutData,
                        datasources: homepage.datasources as unknown as Record<string, unknown>[] | undefined,
                        cssBundle: homepage.cssBundle || undefined,
                    };
                    const cpd: ContextPageData = {
                        id: homepage.id, title: homepage.title || homepage.name, slug: homepage.slug,
                        description: homepage.description, published: homepage.isPublic,
                        createdAt: homepage.publishedAt || new Date().toISOString(),
                        updatedAt: homepage.publishedAt || new Date().toISOString(),
                        canonicalUrl: undefined, ogImage: undefined, ogType: 'website', customVariables: {},
                    };
                    const ctx = await buildTemplateContext(c.req.raw, cpd);
                    const bodyHtml = await renderPage(page.layoutData, ctx);
                    const is = { pageVariables: ctx.local, sessionVariables: ctx.session, cookies: ctx.cookies };
                    const tc = await fetchTrackingConfig();
                    const { faviconUrl: fav } = await getCachedSettings();
                    const afc = (homepage as any)._primaryAuthForm || undefined;
                    return c.html(generateGatedPageDocument(page, bodyHtml, is, tc, fav, afc));
                }
            }

            // Prepare page data for the template
            const page: PageData = {
                id: homepage.id,
                slug: homepage.slug,
                title: homepage.title,
                description: homepage.description,
                name: homepage.name,
                isPublic: homepage.isPublic,
                isHomepage: homepage.isHomepage,
                layoutData: homepage.layoutData as unknown as PageLayoutData,
                datasources: homepage.datasources as unknown as Record<string, unknown>[] | undefined,
                cssBundle: homepage.cssBundle || undefined,
            };

            // Build page data for template context
            const contextPageData: ContextPageData = {
                id: homepage.id,
                title: homepage.title || homepage.name,
                slug: homepage.slug,
                description: homepage.description,
                published: homepage.isPublic,
                createdAt: homepage.publishedAt || new Date().toISOString(),
                updatedAt: homepage.publishedAt || new Date().toISOString(),
                canonicalUrl: undefined,
                ogImage: undefined,
                ogType: 'website',
                customVariables: {},
            };

            // Build template context for LiquidJS
            const context = await buildTemplateContext(
                c.req.raw,
                contextPageData,
                undefined,  // trackingConfig
                undefined   // dataContext
            );

            // Render the page content (async with LiquidJS)
            const bodyHtml = await renderPage(page.layoutData, context);

            // Build initial state from context
            const initialState = {
                pageVariables: context.local,
                sessionVariables: context.session,
                cookies: context.cookies,
            };

            // Fetch tracking config
            const trackingConfig = await fetchTrackingConfig();

            // Get favicon from local project settings (self-sufficient)
            const { faviconUrl } = await getCachedSettings();

            // Return full HTML page
            const fullHtml = generateHtmlDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl);
            
            // Set cache headers
            if (page.isPublic) {
                _htmlCache.set(htmlKey, { html: fullHtml, ts: Date.now() });
                c.header('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
                c.header('X-Cache', 'MISS');
            } else {
                c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
            }

            return c.html(fullHtml);
        }
    } catch (error) {
        console.error('Error fetching homepage:', error);
    }

    // Ultimate fallback: No homepage available
    return c.json({
        service: 'Frontbase Edge Engine',
        mode: 'full',
        status: 'running',
        homepage: false,
        message: 'No homepage published. Publish a page marked as homepage from the dashboard.',
        docs: '/api/docs',
        health: '/api/health',
    });
});

export { pagesRoute };
