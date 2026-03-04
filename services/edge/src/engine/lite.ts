/**
 * Lite Engine
 * 
 * Self-contained automation engine: creates the Hono app, wires all
 * middleware, and registers automation-only routes.
 * 
 * No SSR / Pages / React / ReactDOM — bundle stays small.
 * Full Engine imports this and layers SSR routes on top (DRY).
 * 
 * Includes LiquidJS for dynamic webhook templates, email rendering,
 * and action step string interpolation.
 * 
 * Target bundle size: ~350-400 KB (Cloudflare Workers compatible).
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';

// ── Hono Middleware (full spec per implementation plan) ─────────────
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { requestId } from 'hono/request-id';
import { timeout } from 'hono/timeout';
import { bodyLimit } from 'hono/body-limit';
import { etag } from 'hono/etag';
import { timing } from 'hono/timing';
// Streaming + SSE available via: import { streamSSE } from 'hono/streaming'
// JWT available via: import { jwt } from 'hono/jwt'
// IP restriction available via: import { ipRestriction } from 'hono/ip-restriction'
// These are route-level, not global middleware — used in route handlers as needed.

// ── LiquidJS (dynamic templates for webhooks, emails, action steps) ─
import { Liquid } from 'liquidjs';

// ── Automation routes only — NO pages/SSR/React ────────────────────
import { healthRoute } from '../routes/health.js';
import { deployRoute } from '../routes/deploy.js';
import { executeRoute } from '../routes/execute.js';
import { webhookRoute } from '../routes/webhook.js';
import { executionsRoute } from '../routes/executions.js';
import { updateRoute } from '../routes/update.js';
import { apiKeyAuth } from '../middleware/auth.js';

// =============================================================================
// Liquid Engine (shared singleton for template rendering)
// =============================================================================

export const liquidEngine = new Liquid({
    strictVariables: false,
    strictFilters: false,
});

// =============================================================================
// App Creation & Middleware (shared foundation for Lite + Full)
// =============================================================================

export function createLiteApp() {
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success) {
                console.error('[Zod Validation Error]', JSON.stringify(result.error.issues, null, 2));
                return c.json({
                    success: false,
                    error: 'Validation failed',
                    details: result.error.issues,
                }, 400);
            }
        }
    });

    // Global error handler
    app.onError((err, c) => {
        console.error('[Global Error]', err);
        if (err.name === 'ZodError' || (err as any).issues) {
            return c.json({
                success: false,
                error: 'Validation failed',
                details: (err as any).issues || err.message,
            }, 400);
        }
        return c.json({
            success: false,
            error: err.message || 'Internal server error',
        }, 500);
    });

    // ── Middleware ──────────────────────────────────────────────────────
    app.use('*', requestId());
    app.use('*', logger());
    app.use('*', secureHeaders());
    app.use('*', timing());               // Server-Timing header
    app.use('*', bodyLimit({ maxSize: 50 * 1024 * 1024 })); // 50MB
    app.use('/api/*', etag());            // ETag + 304 Not Modified

    // Timeout: wrap in try-catch for CF Workers where ExecutionContext may be missing
    app.use('*', async (c, next) => {
        try {
            const mw = timeout(29000);    // 29s (CF Workers limit)
            return await mw(c, next);
        } catch {
            return await next();          // Degrade gracefully
        }
    });

    // Cache-Control headers (doesn't use CF Cache API, avoids ExecutionContext error)
    app.use('/api/*', async (c, next) => {
        await next();
        if (!c.res.headers.has('Cache-Control')) {
            c.res.headers.set('Cache-Control', 'no-cache');
        }
    });

    // CORS — allow all origins (edge engines are public-facing; auth is via API keys)
    app.use('/api/*', cors({ origin: '*' }));
    app.use('*', cors({ origin: '*' }));

    // Auth
    app.use('/api/webhook/*', apiKeyAuth);

    // ── Automation Routes ──────────────────────────────────────────────
    app.route('/api/health', healthRoute);
    app.route('/api/deploy', deployRoute);
    app.route('/api/execute', executeRoute);
    app.route('/api/webhook', webhookRoute);
    app.route('/api/executions', executionsRoute);
    app.route('/api/update', updateRoute);

    // ── OpenAPI Docs ───────────────────────────────────────────────────
    app.doc('/api/openapi.json', {
        openapi: '3.1.0',
        info: {
            title: 'Frontbase Edge Engine API',
            version: '0.1.0',
            description: 'Edge runtime API for workflows, webhooks, triggers, and data proxy.',
        },
        servers: [
            { url: 'http://localhost:3002', description: 'Local development' },
        ],
    });
    app.get('/api/docs', swaggerUI({ url: '/api/openapi.json' }));

    return app;
}

// Pre-built instance for direct use by lite adapters
const liteApp = createLiteApp();

// Root info route — only on standalone lite (full engine has its own homepage route)
liteApp.get('/', (c) => c.json({
    service: 'Frontbase Edge Engine',
    mode: 'lite',
    status: 'running',
    docs: '/api/docs',
    health: '/api/health',
}));

export { liteApp };
