import { createLiteApp } from './lite.js';
import { systemKeyAuth } from '../middleware/auth.js';
import { HYDRATE_JS, HYDRATE_CSS, FAVICON_PNG_B64 } from '../ssr/staticAssets.js';

// Page-specific routes (these pull in React, LiquidJS, SSR, etc.)
import { pagesRoute } from '../routes/pages.js';
import { importRoute } from '../routes/import.js';
import { dataRoute } from '../routes/data.js';
import { manageRoute } from '../routes/manage.js';
import { seoRoute } from '../routes/seo.js';
import { embedRoute } from '../routes/embed.js';
import { authRoute } from '../routes/auth.js';

// =============================================================================
// Full App = Lite + Pages/SSR
// =============================================================================

const app = createLiteApp('full');

// ── Embedded static assets (cloud edges without filesystem) ────────────
// These only activate when the build-time plugin replaced the placeholders.
// On Docker dev (tsx watch), the %% markers remain and serveStatic() handles it.

if (HYDRATE_JS && !HYDRATE_JS.includes('%%HYDRATE_JS%%')) {
    app.get('/static/react/hydrate.js', (c) => {
        c.header('Content-Type', 'application/javascript; charset=utf-8');
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
        return c.body(HYDRATE_JS);
    });
}

if (HYDRATE_CSS && !HYDRATE_CSS.includes('%%HYDRATE_CSS%%')) {
    // Match any entry-*.css filename (Vite uses content hashes)
    app.get('/static/react/:cssFile{entry-.+\\.css}', (c) => {
        c.header('Content-Type', 'text/css; charset=utf-8');
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
        return c.body(HYDRATE_CSS);
    });
}

if (FAVICON_PNG_B64 && !FAVICON_PNG_B64.includes('%%FAVICON_PNG_B64%%')) {
    const faviconBuf = Uint8Array.from(atob(FAVICON_PNG_B64), c => c.charCodeAt(0));
    app.get('/static/icon.png', (c) => {
        c.header('Content-Type', 'image/png');
        c.header('Cache-Control', 'public, max-age=86400');
        return c.body(faviconBuf);
    });
}

// ── System key auth for full-engine management routes ──────────────────
app.use('/api/import/*', systemKeyAuth);
// /api/data/execute is public — client-side DataTable calls it with baked dataRequest
// Phase 2 will add origin allowlist guard
app.use('/api/data/execute', async (_c, next) => await next());
app.use('/api/data/*', systemKeyAuth);
app.use('/api/manage/*', systemKeyAuth);

// ── Page / SSR Routes ──────────────────────────────────────────────────
app.route('/api/import', importRoute);
app.route('/api/data', dataRoute);
app.route('/api/manage', manageRoute);
app.route('', seoRoute);       // /sitemap.xml, /robots.txt, /llms.txt
app.route('/api/embed', embedRoute);  // /api/embed/embed.js, /api/embed/auth/:formId (public, no auth)
app.route('/api/auth', authRoute);    // /api/auth/login, /signup, /logout (public)
app.route('', pagesRoute); // SSR pages at /{slug}

export { app as fullApp };
