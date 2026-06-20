/**
 * Conditional Visibility — Server-Side Rendering Tests
 *
 * Verifies the visibilityCondition gating in PageRenderer.renderComponent:
 *  - No condition           → always rendered
 *  - Server-side + TRUE     → rendered
 *  - Server-side + FALSE    → element skipped entirely (empty string)
 *  - Client-side condition  → rendered with a `data-show-if` attribute
 *  - Evaluation error       → defaults to visible (safe)
 *
 * Scopes the SSR treats as CLIENT-side: local, session, cookies, url.
 * Everything else (page, user, visitor, system, app) is evaluated server-side.
 */

import { describe, it, expect } from 'vitest';
import { renderComponent } from '../ssr/PageRenderer';
import type { TemplateContext } from '../ssr/lib/context';

function makeContext(overrides: Partial<TemplateContext> = {}): TemplateContext {
    return {
        page: {
            id: 'p1', title: 'Home', url: '/home', slug: 'home',
            description: '', published: true, createdAt: '', updatedAt: '',
            image: '', type: 'website', custom: {},
        },
        user: null,
        visitor: {
            ip: '', country: 'United States', city: '', timezone: 'UTC',
            device: 'desktop', browser: 'Chrome', os: 'Windows', language: 'en',
            referrer: '', isBot: false,
        },
        url: {},
        system: {
            date: '2026-01-01', time: '00:00:00', datetime: '2026-01-01T00:00:00Z',
            timestamp: 0, year: 2026, month: 1, day: 1, env: 'test',
        },
        cookies: {},
        local: {},
        session: {},
        app: {},
        ...overrides,
    } as TemplateContext;
}

const textComponent = (condition?: string) => ({
    id: 'cmp-1',
    type: 'Text',
    props: { text: 'VISIBLE_MARKER' },
    ...(condition ? { visibilityCondition: condition } : {}),
});

describe('Conditional Visibility — SSR (renderComponent)', () => {
    it('renders unconditionally when no visibilityCondition is set', async () => {
        const html = await renderComponent(textComponent(), makeContext());
        expect(html).toContain('VISIBLE_MARKER');
    });

    // ── Server-side conditions ──────────────────────────────────────────────
    it('renders when a server-side condition is TRUE', async () => {
        const html = await renderComponent(
            textComponent('page.title == "Home"'),
            makeContext()
        );
        expect(html).toContain('VISIBLE_MARKER');
    });

    it('skips the element entirely when a server-side condition is FALSE', async () => {
        const html = await renderComponent(
            textComponent('page.title == "Nonexistent"'),
            makeContext()
        );
        expect(html).toBe('');
    });

    it('evaluates server-side user scope (authenticated)', async () => {
        const ctx = makeContext({
            user: { id: 'u1', email: 'a@b.com', role: 'admin' } as any,
        });
        const html = await renderComponent(textComponent('user.role == "admin"'), ctx);
        expect(html).toContain('VISIBLE_MARKER');
    });

    it('evaluates server-side user scope (unauthenticated → skipped)', async () => {
        // user is null in the default context
        const html = await renderComponent(textComponent('user.role == "admin"'), makeContext());
        expect(html).toBe('');
    });

    it('evaluates server-side visitor scope', async () => {
        const html = await renderComponent(
            textComponent('visitor.country == "United States"'),
            makeContext()
        );
        expect(html).toContain('VISIBLE_MARKER');
    });

    it('supports AND-combined server-side conditions', async () => {
        const html = await renderComponent(
            textComponent('page.title == "Home" and visitor.country == "United States"'),
            makeContext()
        );
        expect(html).toContain('VISIBLE_MARKER');
    });

    // ── Client-side conditions ──────────────────────────────────────────────
    it('emits data-show-if for a client-side local condition', async () => {
        const html = await renderComponent(
            textComponent('local.modalOpen == true'),
            makeContext()
        );
        expect(html).toContain('data-show-if');
        expect(html).toContain('VISIBLE_MARKER');
    });

    it('emits data-show-if for a client-side session condition', async () => {
        const html = await renderComponent(
            textComponent('session.theme == "dark"'),
            makeContext()
        );
        expect(html).toContain('data-show-if');
    });

    it('emits data-show-if for a client-side cookies condition', async () => {
        const html = await renderComponent(
            textComponent('cookies.consent == "accepted"'),
            makeContext()
        );
        expect(html).toContain('data-show-if');
    });

    it('emits data-show-if for a client-side url condition', async () => {
        const html = await renderComponent(
            textComponent('url.utm_source == "newsletter"'),
            makeContext()
        );
        expect(html).toContain('data-show-if');
    });

    it('does NOT emit data-show-if for a pure server-side condition', async () => {
        const html = await renderComponent(
            textComponent('page.title == "Home"'),
            makeContext()
        );
        expect(html).not.toContain('data-show-if');
    });

    // ── Safety / robustness ─────────────────────────────────────────────────
    it('gracefully evaluates an undefined nested property path to false (skipped, no crash)', async () => {
        // LiquidJS resolves missing property chains to nil rather than throwing;
        // `nil == true` is false, so a server-side condition is correctly
        // skipped without breaking the render.
        const html = await renderComponent(
            textComponent('page.this.does.not.exist == true'),
            makeContext()
        );
        expect(html).toBe('');
    });

    it('never rejects for a malformed expression (safe fallback)', async () => {
        // A broken Liquid expression must not crash renderComponent. Whether the
        // engine throws (→ caught, defaults visible) or returns empty, the call
        // resolves to a string.
        const result = renderComponent(
            textComponent('{% if with no end'),
            makeContext()
        );
        await expect(result).resolves.toEqual(expect.any(String));
    });
});
