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
import { getUserFromSession } from '../ssr/lib/auth.js';

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
        const { getRedis } = await import('../cache/redis.js');
        const redis = getRedis();
        const cached = await redis.get<PageData>(cacheKey);
        if (cached) {
            console.log(`[SSR] Cache HIT: ${slug}`);
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
            const { getRedis } = await import('../cache/redis.js');
            const redis = getRedis();
            await redis.setex(cacheKey, 60, JSON.stringify(page));
            console.log(`[SSR] Cache SET: ${slug} (60s TTL)`);
        } catch {
            // Redis not available — no-op
        }
    }

    return page;
}

async function fetchTrackingConfig(): Promise<TrackingConfig> {
    const apiBase = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    try {
        const response = await fetch(`${apiBase}/api/settings/privacy`);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.warn('[SSR] Failed to fetch tracking config:', error);
    }
    return getDefaultTrackingConfig();
}

// Route handler
pagesRoute.openapi(renderPageRoute, async (c) => {
    const { slug } = c.req.param();

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
    if (!page.isPublic) {
        const user = await getUserFromSession(c.req.raw);
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
            const initialState = { pageVariables: context.local, sessionVariables: context.session, cookies: context.cookies };
            const trackingConfig = await fetchTrackingConfig();
            const faviconUrl = await stateProvider.getFaviconUrl();

            // Get primary auth form config if baked into page bundle
            const authFormConfig = (page as any)._primaryAuthForm || undefined;
            const supabaseUrl = process.env.SUPABASE_URL || ((page as any).datasources?.[0]?.supabaseUrl);
            const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || ((page as any).datasources?.[0]?.anonKey);

            const gatedHtml = generateGatedPageDocument(
                page, bodyHtml, initialState, trackingConfig, faviconUrl,
                authFormConfig, supabaseUrl, supabaseAnonKey
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

    // DEBUG: Log visitor context
    console.log('[SSR] Visitor Context:', JSON.stringify({
        country: context.visitor.country,
        city: context.visitor.city,
        ip: context.visitor.ip,
        device: context.visitor.device,
        browser: context.visitor.browser,
    }, null, 2));

    // Render page components to HTML (async with LiquidJS)
    const bodyHtml = await renderPage(page.layoutData, context);

    // Prepare initial state for client hydration
    const initialState = {
        pageVariables: context.local,
        sessionVariables: context.session,
        cookies: context.cookies,
    };

    // Fetch tracking config
    const trackingConfig = await fetchTrackingConfig();

    // Get favicon from local project settings (self-sufficient, no FastAPI call)
    const faviconUrl = await stateProvider.getFaviconUrl();

    // Generate full HTML document
    const htmlDoc = generateHtmlDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl);

    // Set cache headers (Disabled for debugging/immediate updates)
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    c.header('Content-Type', 'text/html; charset=utf-8');

    return c.html(htmlDoc);
});

// Homepage route - renders homepage directly or pulls from FastAPI
pagesRoute.get('/', async (c) => {
    try {
        const cacheKey = 'page:__homepage__';
        let homepage: any = null;

        // L2: Try Redis cache first
        try {
            const { getRedis } = await import('../cache/redis.js');
            const redis = getRedis();
            const cached = await redis.get<any>(cacheKey);
            if (cached) {
                console.log('[SSR] Cache HIT: homepage');
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
                    const { getRedis } = await import('../cache/redis.js');
                    const redis = getRedis();
                    await redis.setex(cacheKey, 60, JSON.stringify(homepage));
                    console.log('[SSR] Cache SET: homepage (60s TTL)');
                } catch {
                    // Redis not available — no-op
                }
            }
        }

        // Render the homepage if we have one
        if (homepage) {
            // Private homepage gating
            if (!homepage.isPublic) {
                const user = await getUserFromSession(c.req.raw);
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
                    const fav = await stateProvider.getFaviconUrl();
                    const afc = (homepage as any)._primaryAuthForm || undefined;
                    const su = process.env.SUPABASE_URL || ((homepage as any).datasources?.[0]?.supabaseUrl);
                    const sk = process.env.SUPABASE_ANON_KEY || ((homepage as any).datasources?.[0]?.anonKey);
                    return c.html(generateGatedPageDocument(page, bodyHtml, is, tc, fav, afc, su, sk));
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
            const faviconUrl = await stateProvider.getFaviconUrl();

            // Return full HTML page
            const fullHtml = generateHtmlDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl);
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
