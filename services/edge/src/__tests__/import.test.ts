/**
 * Import Route Tests
 *
 * Tests for POST /api/import, DELETE /api/import/:slug, 
 * POST/GET /api/import/settings, GET /api/import/status
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockUpsertPage = vi.fn();
const mockGetPageBySlug = vi.fn();
const mockDeletePage = vi.fn();
const mockUpdateProjectSettings = vi.fn();
const mockGetProjectSettings = vi.fn();

vi.mock('../storage', () => ({
    stateProvider: {
        upsertPage: (...args: any[]) => mockUpsertPage(...args),
        getPageBySlug: (...args: any[]) => mockGetPageBySlug(...args),
        deletePage: (...args: any[]) => mockDeletePage(...args),
        updateProjectSettings: (...args: any[]) => mockUpdateProjectSettings(...args),
        getProjectSettings: (...args: any[]) => mockGetProjectSettings(...args),
    },
}));

// Mock redis (import.ts dynamically imports it)
vi.mock('../cache/redis.js', () => ({
    getRedis: () => ({
        del: vi.fn().mockResolvedValue(1),
    }),
}));

import { importRoute } from '../routes/import';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeValidPage(overrides: Record<string, any> = {}) {
    return {
        id: 'page-1',
        slug: 'test-page',
        name: 'Test Page',
        layoutData: { content: [] },
        version: 1,
        publishedAt: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}

function makeRequest(path: string, options: RequestInit = {}): Request {
    return new Request(`http://localhost${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Import Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpsertPage.mockResolvedValue({ version: 1 });
        mockGetPageBySlug.mockResolvedValue(null);
        mockDeletePage.mockResolvedValue(undefined);
        mockUpdateProjectSettings.mockResolvedValue(undefined);
        mockGetProjectSettings.mockResolvedValue({ faviconUrl: null });
    });

    describe('POST / — Import page', () => {
        it('imports a valid page and returns success', async () => {
            const res = await importRoute.request('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: makeValidPage() }),
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(body.slug).toBe('test-page');
            expect(body.version).toBe(1);
            expect(mockUpsertPage).toHaveBeenCalledTimes(1);
        });

        it('rejects invalid payload with 400', async () => {
            const res = await importRoute.request('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: { slug: '' } }), // Missing required fields
            });
            const body = await res.json();

            expect(res.status).toBe(400);
            expect(body.success).toBe(false);
            expect(body.error).toBe('Validation failed');
            expect(mockUpsertPage).not.toHaveBeenCalled();
        });

        it('rejects when existing version >= new version without force', async () => {
            mockGetPageBySlug.mockResolvedValue({ version: 5 });

            const res = await importRoute.request('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: makeValidPage({ version: 3 }) }),
            });
            const body = await res.json();

            expect(res.status).toBe(400);
            expect(body.error).toBe('Version conflict');
            expect(mockUpsertPage).not.toHaveBeenCalled();
        });

        it('accepts lower version when force=true', async () => {
            mockGetPageBySlug.mockResolvedValue({ version: 5 });

            const res = await importRoute.request('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page: makeValidPage({ version: 3 }),
                    force: true,
                }),
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(mockUpsertPage).toHaveBeenCalledTimes(1);
        });
    });

    describe('DELETE /:slug — Unpublish', () => {
        it('deletes an existing page', async () => {
            mockGetPageBySlug.mockResolvedValue({ slug: 'my-page', version: 1 });

            const res = await importRoute.request('/my-page', {
                method: 'DELETE',
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(mockDeletePage).toHaveBeenCalledWith('my-page');
        });

        it('returns success even if page does not exist', async () => {
            mockGetPageBySlug.mockResolvedValue(null);

            const res = await importRoute.request('/nonexistent', {
                method: 'DELETE',
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(mockDeletePage).not.toHaveBeenCalled();
        });
    });

    describe('POST /settings — Sync settings', () => {
        it('updates project settings', async () => {
            const res = await importRoute.request('/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ faviconUrl: '/favicon.ico', siteName: 'Test' }),
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(mockUpdateProjectSettings).toHaveBeenCalledTimes(1);
        });
    });

    describe('GET /settings — Get settings', () => {
        it('returns current project settings', async () => {
            mockGetProjectSettings.mockResolvedValue({ faviconUrl: '/fav.ico' });

            const res = await importRoute.request('/settings', { method: 'GET' });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(body.settings.faviconUrl).toBe('/fav.ico');
        });
    });

    describe('GET /status — Health check', () => {
        it('returns ready status', async () => {
            const res = await importRoute.request('/status', { method: 'GET' });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe('ok');
            expect(body.ready).toBe(true);
        });
    });
});
