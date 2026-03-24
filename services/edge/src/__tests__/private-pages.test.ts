/**
 * Private Page Enforcement Tests
 * 
 * Tests for private page gating: public pages render normally,
 * private pages show blurred content + auth overlay when unauthenticated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

// Mock htmlDocument (imported by gatedPage) to return simple HTML
vi.mock('../ssr/htmlDocument.js', () => ({
    generateHtmlDocument: (
        _page: any, bodyHtml: string, _state: any, _tracking: any, _favicon?: string
    ) => `<!DOCTYPE html><html><body><div id="root">${bodyHtml}</div></body></html>`,
}));

import { generateGatedPageDocument } from '../ssr/gatedPage';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Gated Page Overlay', () => {
    const mockPage = {
        id: 'page-1',
        name: 'Private Page',
        slug: 'private',
        isPublic: false,
        isHomepage: false,
        layoutData: { content: [] },
    } as any;

    const mockBodyHtml = '<div class="content">Secret content here</div>';
    const mockInitialState = {};

    it('should blur page content', () => {
        const html = generateGatedPageDocument(
            mockPage, mockBodyHtml, mockInitialState, null, null
        );

        expect(html).toContain('filter:blur(8px)');
        expect(html).toContain('pointer-events:none');
        expect(html).toContain('user-select:none');
    });

    it('should include auth overlay', () => {
        const html = generateGatedPageDocument(
            mockPage, mockBodyHtml, mockInitialState, null, null
        );

        expect(html).toContain('fb-auth-overlay');
        expect(html).toContain('fb-auth-form');
        expect(html).toContain('fb-auth-submit');
    });

    it('should include toast message', () => {
        const html = generateGatedPageDocument(
            mockPage, mockBodyHtml, mockInitialState, null, null
        );

        expect(html).toContain('fb-auth-toast');
        expect(html).toContain('Please log in or sign up');
    });

    it('should include Supabase JS CDN script', () => {
        const html = generateGatedPageDocument(
            mockPage, mockBodyHtml, mockInitialState, null, null
        );

        expect(html).toContain('supabase-js@2');
        expect(html).toContain('supabase.min.js');
    });

    it('should use custom auth form config when provided', () => {
        const authConfig = {
            type: 'login' as const,
            title: 'Members Only',
            primaryColor: '#ff5500',
        };

        const html = generateGatedPageDocument(
            mockPage, mockBodyHtml, mockInitialState, null, null,
            authConfig
        );

        expect(html).toContain('Members Only');
        expect(html).toContain('#ff5500');
    });

    it('should show login/signup toggle for type=both', () => {
        const authConfig = {
            type: 'both' as const,
            title: 'Welcome',
        };

        const html = generateGatedPageDocument(
            mockPage, mockBodyHtml, mockInitialState, null, null,
            authConfig
        );

        expect(html).toContain('fb-auth-toggle');
        expect(html).toContain("Don't have an account?");
        expect(html).toContain('Sign Up');
    });

    it('should render social provider buttons', () => {
        const authConfig = {
            type: 'both' as const,
            providers: ['google', 'github'],
        };

        const html = generateGatedPageDocument(
            mockPage, mockBodyHtml, mockInitialState, null, null,
            authConfig
        );

        expect(html).toContain('Continue with Google');
        expect(html).toContain('Continue with Github');
        expect(html).toContain('data-provider="google"');
    });

    it('should still contain the original page content (blurred)', () => {
        const html = generateGatedPageDocument(
            mockPage, mockBodyHtml, mockInitialState, null, null
        );

        // The content should still be there, just blurred
        expect(html).toContain('Secret content here');
    });

    it('should default to both mode with toggle when no config', () => {
        const html = generateGatedPageDocument(
            mockPage, mockBodyHtml, mockInitialState, null, null
        );

        // Default config is type: 'both' → toggle should appear
        expect(html).toContain('fb-auth-toggle');
    });
});
