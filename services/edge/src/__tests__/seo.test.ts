/**
 * SEO Route Tests
 *
 * Tests for GET /sitemap.xml, GET /robots.txt, GET /llms.txt
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockListPublicPageSlugs = vi.fn();
const mockGetProjectSettings = vi.fn();

vi.mock('../storage', () => ({
    stateProvider: {
        listPublicPageSlugs: (...args: any[]) => mockListPublicPageSlugs(...args),
        getProjectSettings: (...args: any[]) => mockGetProjectSettings(...args),
    },
}));

vi.mock('../cache/redis.js', () => ({
    getRedis: () => ({
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn().mockResolvedValue('OK'),
    }),
}));

import { seoRoute } from '../routes/seo';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(path: string, host: string = 'example.com') {
    return new Request(`http://${host}${path}`, {
        method: 'GET',
    });
}

async function fetchRoute(path: string, host?: string) {
    const req = makeRequest(path, host);
    const res = await seoRoute.request(path, { headers: req.headers });
    return res;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SEO Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetProjectSettings.mockResolvedValue({
            siteName: 'Test Site',
            siteDescription: 'A test website',
            appUrl: 'https://example.com',
        });
    });

    describe('GET /sitemap.xml', () => {
        it('should return valid XML with public pages', async () => {
            mockListPublicPageSlugs.mockResolvedValue([
                { slug: 'about', updatedAt: '2026-01-01T00:00:00Z', isHomepage: false },
                { slug: 'contact', updatedAt: '2026-01-02T00:00:00Z', isHomepage: false },
            ]);

            const res = await fetchRoute('/sitemap.xml');
            expect(res.status).toBe(200);

            const body = await res.text();
            expect(body).toContain('<?xml');
            expect(body).toContain('<urlset');
            expect(body).toContain('/about');
            expect(body).toContain('/contact');
        });

        it('should give homepage priority 1.0', async () => {
            mockListPublicPageSlugs.mockResolvedValue([
                { slug: 'home', updatedAt: '2026-01-01T00:00:00Z', isHomepage: true },
                { slug: 'about', updatedAt: '2026-01-01T00:00:00Z', isHomepage: false },
            ]);

            const res = await fetchRoute('/sitemap.xml');
            const body = await res.text();
            expect(body).toContain('<priority>1.0</priority>');
            expect(body).toContain('<priority>0.8</priority>');
        });

        it('should exclude private pages (only public slugs returned)', async () => {
            mockListPublicPageSlugs.mockResolvedValue([
                { slug: 'public-page', updatedAt: '2026-01-01T00:00:00Z', isHomepage: false },
            ]);

            const res = await fetchRoute('/sitemap.xml');
            const body = await res.text();
            expect(body).toContain('/public-page');
            // Private pages are NOT returned by listPublicPageSlugs
        });

        it('should return empty sitemap when no pages', async () => {
            mockListPublicPageSlugs.mockResolvedValue([]);

            const res = await fetchRoute('/sitemap.xml');
            expect(res.status).toBe(200);
            const body = await res.text();
            expect(body).toContain('<urlset');
        });
    });

    describe('GET /robots.txt', () => {
        it('should return standard robots.txt', async () => {
            const res = await fetchRoute('/robots.txt');
            expect(res.status).toBe(200);

            const body = await res.text();
            expect(body).toContain('User-agent: *');
            expect(body).toContain('Allow: /');
            expect(body).toContain('Sitemap:');
            expect(body).toContain('/sitemap.xml');
        });
    });

    describe('GET /llms.txt', () => {
        it('should return markdown-formatted page listing', async () => {
            mockListPublicPageSlugs.mockResolvedValue([
                { slug: 'about', updatedAt: '2026-01-01T00:00:00Z', isHomepage: false },
            ]);

            const res = await fetchRoute('/llms.txt');
            expect(res.status).toBe(200);

            const body = await res.text();
            expect(body).toContain('Test Site');
            expect(body).toContain('/about');
        });

        it('should include site description from settings', async () => {
            mockListPublicPageSlugs.mockResolvedValue([]);

            const res = await fetchRoute('/llms.txt');
            const body = await res.text();
            expect(body).toContain('A test website');
        });
    });
});
