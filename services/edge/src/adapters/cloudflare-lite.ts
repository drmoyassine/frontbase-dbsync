/**
 * Cloudflare Workers — Lightweight Skeleton
 * 
 * Minimal Worker that serves pre-rendered pages from Turso.
 * No React, no LiquidJS, no native Node bindings.
 * 
 * Dependencies: hono (~14 KB), @libsql/client/web (~20 KB), @upstash/redis (~10 KB)
 * Total bundle: ~50-100 KB
 * 
 * Pages are stored in Turso by the publish pipeline (FastAPI backend).
 * This Worker simply reads and serves them.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClient, type Client } from '@libsql/client/web';
import { Redis } from '@upstash/redis/cloudflare';

// Types
interface Env {
    FRONTBASE_STATE_DB_URL: string;
    FRONTBASE_STATE_DB_TOKEN: string;
    UPSTASH_REDIS_REST_URL?: string;
    UPSTASH_REDIS_REST_TOKEN?: string;
}

interface CFExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
}

// =============================================================================
// App
// =============================================================================

const app = new Hono();

// CORS for API routes
app.use('/api/*', cors());

// -----------------------------------------------------------------------------
// Health check
// -----------------------------------------------------------------------------
app.get('/api/health', (c) => {
    return c.json({
        status: 'ok',
        provider: 'cloudflare',
        version: '1.0.0-lite',
        timestamp: new Date().toISOString(),
    });
});

// -----------------------------------------------------------------------------
// Import endpoint — receives page data from backend publish fan-out
// Accepts ImportPagePayload format: { page: { slug, ... }, force: true }
// Also accepts flat format: { slug, ... }
// -----------------------------------------------------------------------------
app.post('/api/import', async (c) => {
    try {
        const raw = await c.req.json();

        // Unwrap ImportPagePayload format: { page: { ... }, force: true }
        const payload = raw?.page ? raw.page : raw;

        if (!payload || !payload.slug) {
            return c.json({ error: 'Missing slug in payload' }, 400);
        }

        const db = getDb(c);
        if (!db) return c.json({ error: 'Database not configured' }, 503);

        // Ensure pages table exists
        await db.execute(`
            CREATE TABLE IF NOT EXISTS pages (
                id TEXT PRIMARY KEY,
                slug TEXT UNIQUE NOT NULL,
                name TEXT,
                title TEXT,
                description TEXT,
                layoutData TEXT,
                cssBundle TEXT,
                htmlBundle TEXT,
                seoData TEXT,
                datasources TEXT,
                version INTEGER DEFAULT 1,
                publishedAt TEXT,
                isPublic INTEGER DEFAULT 1,
                isHomepage INTEGER DEFAULT 0
            )
        `);

        // Upsert page
        await db.execute({
            sql: `INSERT INTO pages (id, slug, name, title, description, layoutData, cssBundle, htmlBundle, seoData, datasources, version, publishedAt, isPublic, isHomepage)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(slug) DO UPDATE SET
                    name=excluded.name, title=excluded.title, description=excluded.description,
                    layoutData=excluded.layoutData, cssBundle=excluded.cssBundle, htmlBundle=excluded.htmlBundle,
                    seoData=excluded.seoData, datasources=excluded.datasources,
                    version=excluded.version, publishedAt=excluded.publishedAt,
                    isPublic=excluded.isPublic, isHomepage=excluded.isHomepage`,
            args: [
                payload.id || crypto.randomUUID(),
                payload.slug,
                payload.name || payload.slug,
                payload.title || null,
                payload.description || null,
                typeof payload.layoutData === 'string' ? payload.layoutData : JSON.stringify(payload.layoutData),
                payload.cssBundle || null,
                payload.htmlBundle || null,
                typeof payload.seoData === 'string' ? payload.seoData : JSON.stringify(payload.seoData || null),
                typeof payload.datasources === 'string' ? payload.datasources : JSON.stringify(payload.datasources || null),
                payload.version || 1,
                payload.publishedAt || new Date().toISOString(),
                payload.isPublic !== false ? 1 : 0,
                payload.isHomepage ? 1 : 0,
            ],
        });

        // Invalidate Redis cache if available
        const redis = getRedis(c);
        if (redis) {
            try {
                await redis.del(`page:${payload.slug}`);
                if (payload.isHomepage) await redis.del('page:__homepage__');
            } catch { /* Redis optional */ }
        }

        console.log(`[Import] ✅ Page imported: ${payload.slug}`);
        return c.json({ success: true, slug: payload.slug });
    } catch (err: any) {
        console.error('[Import] Error:', err);
        return c.json({ error: err.message }, 500);
    }
});

// -----------------------------------------------------------------------------
// SSR page route — serves pre-rendered HTML from Turso
// -----------------------------------------------------------------------------
app.get('/ssr/:slug', async (c) => {
    const slug = c.req.param('slug');

    try {
        const page = await getPage(c, slug);
        if (!page) {
            return c.html(notFoundPage(slug), 404);
        }

        const html = buildPageHtml(page);
        c.header('Content-Type', 'text/html; charset=utf-8');
        c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return c.html(html);
    } catch (err: any) {
        console.error(`[SSR] Error rendering /${slug}:`, err);
        return c.html(errorPage(err.message), 500);
    }
});

// Homepage route
app.get('/', async (c) => {
    try {
        const page = await getHomepage(c);
        if (!page) {
            return c.html(noHomepagePage(), 200);
        }

        const html = buildPageHtml(page);
        c.header('Content-Type', 'text/html; charset=utf-8');
        c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return c.html(html);
    } catch (err: any) {
        console.error('[SSR] Error rendering homepage:', err);
        return c.html(errorPage(err.message), 500);
    }
});

// =============================================================================
// Helpers
// =============================================================================

function getDb(c: any): Client | null {
    const url = (globalThis as any).process?.env?.FRONTBASE_STATE_DB_URL;
    const token = (globalThis as any).process?.env?.FRONTBASE_STATE_DB_TOKEN;
    if (!url) return null;
    return createClient({ url, authToken: token });
}

function getRedis(c: any): Redis | null {
    const url = (globalThis as any).process?.env?.UPSTASH_REDIS_REST_URL;
    const token = (globalThis as any).process?.env?.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    try {
        return new Redis({ url, token });
    } catch {
        return null;
    }
}

interface PageRow {
    slug: string;
    name: string;
    title: string | null;
    description: string | null;
    layoutData: string | null;
    cssBundle: string | null;
    htmlBundle: string | null;
    isHomepage: number;
}

async function getPage(c: any, slug: string): Promise<PageRow | null> {
    // Try Redis cache first
    const redis = getRedis(c);
    if (redis) {
        try {
            const cached = await redis.get(`page:${slug}`);
            if (cached) {
                console.log(`[SSR] Cache HIT: ${slug}`);
                return typeof cached === 'string' ? JSON.parse(cached) : cached;
            }
        } catch { /* Redis optional */ }
    }

    const db = getDb(c);
    if (!db) return null;

    const result = await db.execute({
        sql: 'SELECT slug, name, title, description, layoutData, cssBundle, htmlBundle, isHomepage FROM pages WHERE slug = ? AND isPublic = 1',
        args: [slug],
    });

    if (!result.rows.length) return null;
    const page = result.rows[0] as unknown as PageRow;

    // Cache for 60s
    if (redis) {
        try { await redis.setex(`page:${slug}`, 60, JSON.stringify(page)); } catch { }
    }

    return page;
}

async function getHomepage(c: any): Promise<PageRow | null> {
    const redis = getRedis(c);
    if (redis) {
        try {
            const cached = await redis.get('page:__homepage__');
            if (cached) {
                console.log('[SSR] Cache HIT: homepage');
                return typeof cached === 'string' ? JSON.parse(cached) : cached;
            }
        } catch { }
    }

    const db = getDb(c);
    if (!db) return null;

    const result = await db.execute(
        'SELECT slug, name, title, description, layoutData, cssBundle, htmlBundle, isHomepage FROM pages WHERE isHomepage = 1 AND isPublic = 1 LIMIT 1'
    );

    if (!result.rows.length) return null;
    const page = result.rows[0] as unknown as PageRow;

    if (redis) {
        try { await redis.setex('page:__homepage__', 60, JSON.stringify(page)); } catch { }
    }

    return page;
}

function buildPageHtml(page: PageRow): string {
    const title = page.title || page.name || 'Frontbase Page';
    const desc = page.description || '';
    const css = page.cssBundle || '';

    // If we have pre-rendered HTML, serve it directly
    if (page.htmlBundle) {
        return page.htmlBundle;
    }

    // Fallback: serve a minimal page indicating SSR is not yet available
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escHtml(title)}</title>
    ${desc ? `<meta name="description" content="${escHtml(desc)}">` : ''}
    ${css ? `<style>${css}</style>` : ''}
</head>
<body>
    <div id="root">
        <p style="text-align:center;padding:2rem;color:#64748b;">
            This page is published but full SSR is not yet configured for this deployment.
            Please publish with HTML pre-rendering enabled.
        </p>
    </div>
</body>
</html>`;
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function notFoundPage(slug: string): string {
    return `<!DOCTYPE html><html><head><title>Not Found</title></head><body style="font-family:system-ui;text-align:center;padding:4rem"><h1>404</h1><p>Page "${escHtml(slug)}" not found.</p></body></html>`;
}

function errorPage(msg: string): string {
    return `<!DOCTYPE html><html><head><title>Error</title></head><body style="font-family:system-ui;text-align:center;padding:4rem"><h1>500</h1><p>Server error: ${escHtml(msg)}</p></body></html>`;
}

function noHomepagePage(): string {
    return `<!DOCTYPE html><html><head><title>Frontbase Edge</title></head><body style="font-family:system-ui;text-align:center;padding:4rem"><h1>Frontbase Edge</h1><p style="color:#64748b">No homepage configured. Publish a page from your dashboard.</p></body></html>`;
}

// =============================================================================
// Worker Entry Point
// =============================================================================

export default {
    async fetch(request: Request, env: Record<string, string>, ctx: CFExecutionContext): Promise<Response> {
        // Bridge Cloudflare env bindings → process.env
        (globalThis as any).process ??= { env: {} };
        for (const [key, value] of Object.entries(env)) {
            if (typeof value === 'string') {
                (globalThis as any).process.env[key] = value;
            }
        }
        (globalThis as any).process.env.FRONTBASE_ADAPTER_PLATFORM = 'cloudflare';

        return app.fetch(request);
    },
};
