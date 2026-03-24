/**
 * SEO Routes — Auto-generated sitemap, robots.txt, and llms.txt
 * 
 * All three files are generated from published page data stored in the
 * Edge state provider. No FastAPI calls at runtime (AGENTS.md §2.1).
 * 
 * Sitemap and llms.txt are cached in Redis (L2) with 1hr TTL, invalidated
 * when pages are imported/deleted via import.ts.
 */

import { Hono } from 'hono';
import { stateProvider } from '../storage/index.js';

const seoRoute = new Hono();

// =============================================================================
// Helper: Resolve base URL from env or request
// =============================================================================

function getBaseUrl(request: Request): string {
    const publicUrl = process.env.PUBLIC_URL;
    if (publicUrl) return publicUrl.replace(/\/$/, '');

    try {
        const url = new URL(request.url);
        return url.origin;
    } catch {
        return 'http://localhost:3002';
    }
}

// =============================================================================
// GET /sitemap.xml
// =============================================================================

seoRoute.get('/sitemap.xml', async (c) => {
    // Try Redis cache first
    try {
        const { getRedis } = await import('../cache/redis.js');
        const redis = getRedis();
        const cached = await redis.get<string>('seo:sitemap');
        if (cached) {
            c.header('Content-Type', 'application/xml');
            c.header('Cache-Control', 'public, max-age=3600');
            c.header('X-Cache', 'HIT');
            return c.body(cached);
        }
    } catch {
        // Redis not initialized or unavailable — generate fresh
    }

    const baseUrl = getBaseUrl(c.req.raw);
    const pages = await stateProvider.listPublicPageSlugs();

    const urls = pages.map((page) => {
        const loc = page.isHomepage ? baseUrl + '/' : `${baseUrl}/${page.slug}`;
        const priority = page.isHomepage ? '1.0' : '0.8';
        const lastmod = page.updatedAt ? page.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0];

        return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

    // Cache in Redis (1hr TTL)
    try {
        const { getRedis } = await import('../cache/redis.js');
        const redis = getRedis();
        await redis.setex('seo:sitemap', 3600, xml);
    } catch {
        // Redis not configured — skip caching
    }

    c.header('Content-Type', 'application/xml');
    c.header('Cache-Control', 'public, max-age=3600');
    c.header('X-Cache', 'MISS');
    return c.body(xml);
});

// =============================================================================
// GET /robots.txt
// =============================================================================

seoRoute.get('/robots.txt', async (c) => {
    const baseUrl = getBaseUrl(c.req.raw);

    const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;

    c.header('Content-Type', 'text/plain');
    c.header('Cache-Control', 'public, max-age=600');
    return c.body(robotsTxt);
});

// =============================================================================
// GET /llms.txt — LLM-friendly site index (llmstxt.org)
// =============================================================================

seoRoute.get('/llms.txt', async (c) => {
    // Try Redis cache first
    try {
        const { getRedis } = await import('../cache/redis.js');
        const redis = getRedis();
        const cached = await redis.get<string>('seo:llms');
        if (cached) {
            c.header('Content-Type', 'text/plain');
            c.header('Cache-Control', 'public, max-age=3600');
            c.header('X-Cache', 'HIT');
            return c.body(cached);
        }
    } catch {
        // Redis not configured
    }

    const baseUrl = getBaseUrl(c.req.raw);
    const pages = await stateProvider.listPublicPageSlugs();
    const settings = await stateProvider.getProjectSettings();

    const siteName = (settings as any).siteName || 'Frontbase Site';
    const siteDescription = (settings as any).siteDescription || '';

    const lines: string[] = [
        `# ${siteName}`,
    ];

    if (siteDescription) {
        lines.push(`> ${siteDescription}`);
    }

    lines.push('', '## Pages', '');

    for (const page of pages) {
        const url = page.isHomepage ? baseUrl + '/' : `${baseUrl}/${page.slug}`;
        const label = page.slug.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
        lines.push(`- [${label}](${url})`);
    }

    const llmsTxt = lines.join('\n') + '\n';

    // Cache in Redis (1hr TTL)
    try {
        const { getRedis } = await import('../cache/redis.js');
        const redis = getRedis();
        await redis.setex('seo:llms', 3600, llmsTxt);
    } catch {
        // Redis not configured
    }

    c.header('Content-Type', 'text/plain');
    c.header('Cache-Control', 'public, max-age=3600');
    c.header('X-Cache', 'MISS');
    return c.body(llmsTxt);
});

// =============================================================================
// Helpers
// =============================================================================

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export { seoRoute };
