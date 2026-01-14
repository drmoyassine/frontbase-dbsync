/**
 * SSR Pages Route
 * 
 * Renders published pages server-side for Edge deployment.
 * Route: /p/:slug
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { html } from 'hono/html';
import { getCookie } from 'hono/cookie';
import { renderPage } from '../ssr/PageRenderer.js';
import { createVariableStore, VariableStore } from '../ssr/store.js';

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

// Fetch page from local D1/SQLite first, fallback to FastAPI for unpublished
import { getPublishedPageBySlug, initPagesDb } from '../db/pages-store';

// Initialize pages database
initPagesDb().catch(console.error);

async function fetchPage(slug: string): Promise<PageData | null> {
    // First, try to get from local published pages storage
    try {
        const publishedPage = await getPublishedPageBySlug(slug);
        if (publishedPage) {
            console.log(`[SSR] Found published page: ${slug} (v${publishedPage.version})`);
            return {
                id: publishedPage.id,
                name: publishedPage.name,
                slug: publishedPage.slug,
                title: publishedPage.title,
                description: publishedPage.description,
                isPublic: publishedPage.isPublic,
                isHomepage: publishedPage.isHomepage,
                layoutData: publishedPage.layoutData,
                createdAt: publishedPage.publishedAt,
                updatedAt: publishedPage.publishedAt,
            } as PageData;
        }
    } catch (error) {
        console.warn('[SSR] Error reading local storage:', error);
    }

    // Fallback to FastAPI for unpublished pages (dev mode only)
    const apiBase = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';

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
        return result.success ? result.data : null;
    } catch (error) {
        console.error('Error fetching page from FastAPI:', error);
        return null;
    }
}

// Generate the full HTML document
function generateHtmlDocument(
    page: PageData,
    bodyHtml: string,
    initialState: Record<string, unknown>
): string {
    const title = page.title || page.name;
    const description = page.description || '';
    const keywords = page.keywords || '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
    ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
    <meta name="generator" content="Frontbase">
    
    <!-- Prefetch hydration bundles -->
    <link rel="modulepreload" href="/static/hydrate.js">
    <link rel="modulepreload" href="/static/react/hydrate.js">
    
    <!-- Tailwind CSS (for builder previews) -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              border: "hsl(var(--border))",
              input: "hsl(var(--input))",
              ring: "hsl(var(--ring))",
              background: "hsl(var(--background))",
              foreground: "hsl(var(--foreground))",
              primary: {
                DEFAULT: "hsl(var(--primary))",
                foreground: "hsl(var(--primary-foreground))",
              },
              secondary: {
                DEFAULT: "hsl(var(--secondary))",
                foreground: "hsl(var(--secondary-foreground))",
              },
              destructive: {
                DEFAULT: "hsl(var(--destructive))",
                foreground: "hsl(var(--destructive-foreground))",
              },
              muted: {
                DEFAULT: "hsl(var(--muted))",
                foreground: "hsl(var(--muted-foreground))",
              },
              accent: {
                DEFAULT: "hsl(var(--accent))",
                foreground: "hsl(var(--accent-foreground))",
              },
              popover: {
                DEFAULT: "hsl(var(--popover))",
                foreground: "hsl(var(--popover-foreground))",
              },
              card: {
                DEFAULT: "hsl(var(--card))",
                foreground: "hsl(var(--card-foreground))",
              },
            },
          },
        },
      }
    </script>
    
    <!-- Base styles -->
    <style>
        :root {
            --background: 0 0% 100%;
            --foreground: 222.2 84% 4.9%;
            --muted: 210 40% 96.1%;
            --muted-foreground: 215.4 16.3% 46.9%;
            --popover: 0 0% 100%;
            --popover-foreground: 222.2 84% 4.9%;
            --card: 0 0% 100%;
            --card-foreground: 222.2 84% 4.9%;
            --border: 214.3 31.8% 91.4%;
            --input: 214.3 31.8% 91.4%;
            --primary: 222.2 47.4% 11.2%;
            --primary-foreground: 210 40% 98%;
            --secondary: 210 40% 96.1%;
            --secondary-foreground: 222.2 47.4% 11.2%;
            --accent: 210 40% 96.1%;
            --accent-foreground: 222.2 47.4% 11.2%;
            --destructive: 0 84.2% 60.2%;
            --destructive-foreground: 210 40% 98%;
            --ring: 222.2 84% 4.9%;
            --radius: 0.5rem;
        }
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; }
        /* Page container - defaults to flex-column like builder */
        .fb-page { min-height: 100vh; display: flex; flex-direction: column; padding: 2rem; gap: 1rem; }
        /* Ensure buttons display as inline-flex but with vertical margins when in column layout */
        .fb-button { display: inline-flex; align-items: center; justify-content: center; }
        /* Headings with proper sizing to match shadcn */
        .fb-heading { margin: 0; }
        .fb-heading-1 { font-size: 2.25rem; font-weight: 700; }
        .fb-heading-2 { font-size: 1.875rem; font-weight: 600; }
        .fb-heading-3 { font-size: 1.5rem; font-weight: 600; }
        .fb-loading { opacity: 0.7; pointer-events: none; }
        .fb-skeleton { background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: skeleton 1.5s infinite; }
        @keyframes skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    </style>
</head>
<body>
    <div id="root">${bodyHtml}</div>
    
    <!-- Initial state for hydration -->
    <script>
        window.__INITIAL_STATE__ = ${JSON.stringify(initialState)};
        window.__PAGE_DATA__ = ${JSON.stringify({
        id: page.id,
        slug: page.slug,
        layoutData: page.layoutData,  // Include for hydration access to bindings with dataRequest
        datasources: page.datasources
    })};
    </script>
    
    <!-- Hydration bundle (vanilla JS for simple components) -->
    <script type="module" src="/static/hydrate.js"></script>
    
    <!-- React hydration bundle (DataTable, Charts, Forms) -->
    <script type="module" src="/static/react/hydrate.js"></script>
</body>
</html>`;
}

// Escape HTML special characters
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

    // Check if page is public (for now, render all pages - auth handled later)
    // if (!page.isPublic) {
    //     return c.json({ error: 'Unauthorized', message: 'This page is private' }, 403);
    // }

    // Create variable store with 3 scopes
    const store = createVariableStore();

    // Initialize cookies from request
    const theme = getCookie(c, 'theme') || 'light';
    const authToken = getCookie(c, 'sb-access-token');

    store.setCookie('theme', theme);
    if (authToken) {
        store.setCookie('sb-access-token', authToken);
    }

    // Render page components to HTML
    const bodyHtml = renderPage(page.layoutData, store);

    // Prepare initial state for client hydration
    const initialState = {
        pageVariables: store.getPageVariables(),
        sessionVariables: store.getSessionVariables(),
        cookies: { theme },
    };

    // Generate full HTML document
    const htmlDoc = generateHtmlDocument(page, bodyHtml, initialState);

    // Set cache headers (Disabled for debugging/immediate updates)
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    c.header('Content-Type', 'text/html; charset=utf-8');

    return c.html(htmlDoc);
});

// Homepage route - renders homepage directly or pulls from FastAPI
pagesRoute.get('/', async (c) => {
    // Try to find a page marked as homepage from local storage first
    const { getHomepage: getLocalHomepage, upsertPublishedPage } = await import('../db/pages-store');

    try {
        let homepage = await getLocalHomepage();

        if (homepage) {
            console.log(`[SSR] Rendering homepage: ${homepage.slug} (v${homepage.version})`);
        } else {
            // Pull-publish: Fetch homepage from FastAPI and store locally
            console.log('[SSR] No local homepage found, pulling from FastAPI...');

            const fastapiUrl = process.env.FASTAPI_URL || 'http://backend:8000';
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

                    await upsertPublishedPage(publishData);
                    console.log(`[SSR] Pull-published homepage: ${pageData.slug}`);

                    // Set homepage for rendering
                    homepage = publishData;
                } else {
                    console.warn(`[SSR] FastAPI homepage fetch failed: ${response.status}`);
                }
            } catch (fetchError) {
                console.error('[SSR] Pull-publish failed:', fetchError);
            }
        }

        // Render the homepage if we have one
        if (homepage) {
            // Create variable store with 3 scopes
            const store = createVariableStore();

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
            };

            // Render the page content
            const bodyHtml = await renderPage(page.layoutData.content || [], store);

            // Build initial state from store
            const initialState = {
                global: store.getAll('global'),
                page: store.getAll('page'),
                component: store.getAll('component'),
            };

            // Return full HTML page
            const fullHtml = renderFullPage(page, bodyHtml, initialState);
            return c.html(fullHtml);
        }
    } catch (error) {
        console.error('Error fetching homepage:', error);
    }

    // Ultimate fallback: No homepage in FastAPI either
    return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>No Homepage Configured</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; }
        .container { max-width: 600px; margin: 0 auto; text-align: center; padding-top: 4rem; }
        h1 { color: #1e293b; }
        p { color: #64748b; }
        a { display: inline-block; background: #1e293b; color: white; padding: 0.75rem 2rem; border-radius: 0.5rem; text-decoration: none; margin-top: 1rem; }
        a:hover { background: #334155; }
    </style>
</head>
<body>
    <div class="container">
        <h1>No Homepage Configured</h1>
        <p>Create a homepage in the dashboard and mark it as the homepage.</p>
        <a href="/dashboard">Go to Dashboard</a>
    </div>
</body>
</html>
    `);
});

export { pagesRoute };
