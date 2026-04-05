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
import { manifestRoute } from '../routes/manifest.js';
import { deployRoute } from '../routes/deploy.js';
import { executeRoute } from '../routes/execute.js';
import { webhookRoute } from '../routes/webhook.js';
import { executionsRoute } from '../routes/executions.js';
import { updateRoute } from '../routes/update.js';
import { cacheRoute } from '../routes/cache.js';
import { edgeLogsRoute } from '../routes/edge-logs.js';
import { workflowsRoute } from '../routes/workflows.js';
import { queueRoute } from '../routes/queue.js';
import { configRoute } from '../routes/config.js';
// ai.ts still provides setAIBinding/setGPUModels/getGPUModels used by adapters + openai.ts
import { openaiRoute } from '../routes/openai.js';
import { agentRoute } from '../routes/agent.js';
import { systemKeyAuth, userApiKeyAuth, aiApiKeyAuth } from '../middleware/auth.js';

// =============================================================================
// Liquid Engine (shared singleton for template rendering)
// =============================================================================

export const liquidEngine = new Liquid({
    strictVariables: false,
    strictFilters: false,
});

// =============================================================================
// Engine Mode Profiles (drives OpenAPI docs, badges, descriptions)
// =============================================================================

export type EngineMode = 'lite' | 'full';

interface EngineProfile {
    description: string;
    techStack: string;
    badge: string;
    tags: Array<{ name: string; description: string }>;
}

const ENGINE_PROFILES: Record<EngineMode, EngineProfile> = {
    lite: {
        description: 'Self-sufficient edge runtime for workflow automation, webhooks, and AI inference.',
        techStack: 'Hono · Drizzle ORM · LiquidJS · Zod',
        badge: 'Lite Engine',
        tags: [
            { name: 'System', description: 'Health checks, manifest, and self-update' },
            { name: 'Workflows', description: 'Deploy, list, and manage published workflows' },
            { name: 'Execution', description: 'Execute workflows and inspect runs' },
            { name: 'Webhooks', description: 'Trigger workflows via incoming webhooks' },
            { name: 'Cache', description: 'Redis/Upstash cache management — test connection, invalidate keys, flush, and stats' },
            { name: 'Queue', description: 'Message queue management — stats and publishing (QStash/CF Queue)' },
            { name: 'AI', description: 'OpenAI-compatible inference (GPU models required)' },
        ],
    },
    full: {
        description: 'Self-sufficient edge runtime for SSR pages, workflow automation, data proxy, webhooks, and AI inference.',
        techStack: 'Hono · React · Drizzle ORM · LiquidJS · Zod',
        badge: 'Full Engine',
        tags: [
            { name: 'System', description: 'Health checks, manifest, and self-update' },
            { name: 'Pages', description: 'Published page SSR and homepage rendering' },
            { name: 'Data', description: 'Datasource proxy — fetches data from connected backends (Supabase, Neon, etc.)' },
            { name: 'Workflows', description: 'Deploy, list, and manage published workflows' },
            { name: 'Execution', description: 'Execute workflows and inspect runs' },
            { name: 'Webhooks', description: 'Trigger workflows via incoming webhooks' },
            { name: 'Cache', description: 'Redis/Upstash cache management — test connection, invalidate keys, flush, and stats' },
            { name: 'Queue', description: 'Message queue management — stats and publishing (QStash/CF Queue)' },
            { name: 'AI', description: 'OpenAI-compatible inference (GPU models required)' },
        ],
    },
};

// =============================================================================
// App Creation & Middleware (shared foundation for Lite + Full)
// =============================================================================

export function createLiteApp(mode: EngineMode = 'lite') {
    const profile = ENGINE_PROFILES[mode];
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

    // Maintenance mode: if FRONTBASE_DISABLED is set, return 503 for all
    // requests except /api/health (so monitoring still works).
    // Toggled via the dashboard Enable/Disable switch → pushes env var.
    app.use('*', async (c, next) => {
        const disabled = process.env.FRONTBASE_DISABLED;
        if (disabled === 'true' || disabled === '1') {
            const path = new URL(c.req.url).pathname;
            if (path.startsWith('/api/health')) return next();
            return c.html(
                `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Engine Paused</title>` +
                `<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;` +
                `background:#0f1117;color:#e4e4e7;font-family:Inter,system-ui,sans-serif;text-align:center}` +
                `.c{max-width:420px;padding:2rem}h1{font-size:1.5rem;margin:0 0 .5rem;color:#6366f1}` +
                `p{color:#a1a1aa;margin:0;font-size:.9rem}</style></head>` +
                `<body><div class="c"><h1>⏸ Engine Paused</h1>` +
                `<p>This Frontbase Edge Engine has been paused by the administrator. ` +
                `It will resume when re-enabled from the dashboard.</p></div></body></html>`,
                503,
            );
        }
        return next();
    });

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

    // ── Automation Routes ──────────────────────────────────────────────

    // System key auth — management endpoints (M2M from FastAPI + management-scoped user keys)
    app.use('/api/deploy/*', systemKeyAuth);
    app.use('/api/execute/*', systemKeyAuth);
    app.use('/api/update/*', systemKeyAuth);
    app.use('/api/cache/*', systemKeyAuth);
    app.use('/api/edge-logs/*', systemKeyAuth);
    app.use('/api/manifest/*', systemKeyAuth);
    app.use('/api/executions/*', systemKeyAuth);
    app.use('/api/workflows/*', systemKeyAuth);
    app.use('/api/queue/*', systemKeyAuth);
    app.use('/api/config/*', systemKeyAuth);

    // User API key auth — webhooks (unified with AI key system)
    app.use('/api/webhook/*', userApiKeyAuth);

    app.route('/api/health', healthRoute);
    app.route('/api/manifest', manifestRoute);
    app.route('/api/deploy', deployRoute);
    app.route('/api/execute', executeRoute);
    app.route('/api/webhook', webhookRoute);
    app.route('/api/executions', executionsRoute);
    app.route('/api/update', updateRoute);
    app.route('/api/cache', cacheRoute);
    app.route('/api/edge-logs', edgeLogsRoute);
    app.route('/api/workflows', workflowsRoute);
    app.route('/api/queue', queueRoute);
    app.route('/api/config', configRoute);

    // OpenAI-compatible and Agent AI routes (secured by AI API key auth)
    app.use('/v1/*', aiApiKeyAuth);
    app.route('/v1', openaiRoute);
    app.route('/v1/agent', agentRoute);

    // ── OpenAPI Docs ───────────────────────────────────────────────────
    // Dynamic server URL, mode-aware tags/description, API key auth, Frontbase branding.

    const EDGE_VERSION = '0.1.0';

    app.doc('/api/openapi.json', (c) => ({
        openapi: '3.1.0',
        info: {
            title: 'Frontbase Edge Engine',
            version: EDGE_VERSION,
            description: [
                profile.description,
                '',
                `**Tech Stack:** ${profile.techStack}`,
                '',
                '**Authentication:** Protected routes require an API key via the `x-api-key` header.',
            ].join('\n'),
        },
        servers: [
            {
                url: new URL(c.req.url).origin,
                description: 'Current server',
            },
        ],
        tags: profile.tags,
        security: [{ ApiKeyAuth: [] }],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey' as const,
                    in: 'header' as const,
                    name: 'x-api-key',
                    description: 'API key created in the Frontbase dashboard → Edge → API Keys',
                },
            },
        },
    }));

    // Custom branded Swagger UI with dark theme
    app.get('/api/docs', (c) => {
        return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Frontbase Edge API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
    <style>
        /* ── Frontbase Dark Theme ─────────────────────────────────── */
        :root {
            --fb-bg: #0f1117;
            --fb-surface: #1a1d27;
            --fb-border: #2a2d3a;
            --fb-text: #e4e4e7;
            --fb-text-muted: #a1a1aa;
            --fb-primary: #6366f1;
            --fb-primary-hover: #818cf8;
            --fb-success: #22c55e;
            --fb-warning: #eab308;
            --fb-danger: #ef4444;
            --fb-info: #3b82f6;
        }
        body {
            margin: 0;
            background: var(--fb-bg);
            color: var(--fb-text);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        /* Header bar */
        .fb-header {
            background: var(--fb-surface);
            border-bottom: 1px solid var(--fb-border);
            padding: 16px 24px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .fb-header h1 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: var(--fb-text);
        }
        .fb-header .badge {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 9999px;
            font-weight: 600;
            letter-spacing: 0.03em;
        }
        .fb-header .badge-version {
            background: rgba(99, 102, 241, 0.15);
            color: var(--fb-primary-hover);
        }
        .fb-header .badge-engine {
            background: rgba(34, 197, 94, 0.15);
            color: var(--fb-success);
        }

        /* Swagger UI dark overrides */
        .swagger-ui { background: var(--fb-bg) !important; }
        .swagger-ui .topbar { display: none !important; }
        .swagger-ui .info { margin: 24px 0 !important; }
        .swagger-ui .info .title { color: var(--fb-text) !important; font-family: 'Inter', sans-serif !important; }
        .swagger-ui .info .description p { color: var(--fb-text-muted) !important; }
        .swagger-ui .info .description code { background: var(--fb-surface) !important; color: var(--fb-primary-hover) !important; }
        .swagger-ui .scheme-container { background: var(--fb-surface) !important; border: 1px solid var(--fb-border) !important; border-radius: 8px; box-shadow: none !important; }
        .swagger-ui .opblock-tag { color: var(--fb-text) !important; border-bottom: 1px solid var(--fb-border) !important; font-family: 'Inter', sans-serif !important; }
        .swagger-ui .opblock-tag small { color: var(--fb-text-muted) !important; }
        .swagger-ui .opblock { border-radius: 8px !important; border: 1px solid var(--fb-border) !important; background: var(--fb-surface) !important; margin-bottom: 8px !important; }
        .swagger-ui .opblock .opblock-summary { border: none !important; }
        .swagger-ui .opblock .opblock-summary-description { color: var(--fb-text-muted) !important; }
        .swagger-ui .opblock .opblock-summary-path { color: var(--fb-text) !important; }
        .swagger-ui .opblock.opblock-get { border-color: rgba(34, 197, 94, 0.3) !important; }
        .swagger-ui .opblock.opblock-post { border-color: rgba(59, 130, 246, 0.3) !important; }
        .swagger-ui .opblock.opblock-put { border-color: rgba(234, 179, 8, 0.3) !important; }
        .swagger-ui .opblock.opblock-delete { border-color: rgba(239, 68, 68, 0.3) !important; }
        .swagger-ui .opblock.opblock-patch { border-color: rgba(168, 85, 247, 0.3) !important; }
        .swagger-ui .opblock-body { background: var(--fb-bg) !important; }
        .swagger-ui .opblock-section-header { background: var(--fb-surface) !important; border-bottom: 1px solid var(--fb-border) !important; }
        .swagger-ui .opblock-section-header h4 { color: var(--fb-text) !important; }
        .swagger-ui table thead tr th { color: var(--fb-text-muted) !important; border-bottom: 1px solid var(--fb-border) !important; }
        .swagger-ui table tbody tr td { color: var(--fb-text) !important; border-bottom: 1px solid var(--fb-border) !important; }
        .swagger-ui .parameter__name { color: var(--fb-text) !important; }
        .swagger-ui .parameter__type { color: var(--fb-text-muted) !important; }
        .swagger-ui .response-col_status { color: var(--fb-text) !important; }
        .swagger-ui .response-col_description { color: var(--fb-text-muted) !important; }
        .swagger-ui .model-box { background: var(--fb-surface) !important; }
        .swagger-ui .model { color: var(--fb-text) !important; }
        .swagger-ui .model-title { color: var(--fb-text) !important; }
        .swagger-ui section.models { border: 1px solid var(--fb-border) !important; border-radius: 8px !important; }
        .swagger-ui section.models h4 { color: var(--fb-text) !important; }
        .swagger-ui .btn { border-radius: 6px !important; }
        .swagger-ui .btn.authorize { background: var(--fb-primary) !important; color: white !important; border-color: var(--fb-primary) !important; }
        .swagger-ui .btn.authorize svg { fill: white !important; }
        .swagger-ui .btn.execute { background: var(--fb-primary) !important; border-color: var(--fb-primary) !important; }
        .swagger-ui select { background: var(--fb-surface) !important; color: var(--fb-text) !important; border: 1px solid var(--fb-border) !important; border-radius: 6px !important; }
        .swagger-ui input[type=text] { background: var(--fb-surface) !important; color: var(--fb-text) !important; border: 1px solid var(--fb-border) !important; border-radius: 6px !important; }
        .swagger-ui textarea { background: var(--fb-surface) !important; color: var(--fb-text) !important; border: 1px solid var(--fb-border) !important; border-radius: 6px !important; }
        .swagger-ui .highlight-code { background: var(--fb-surface) !important; }
        .swagger-ui .highlight-code pre { color: var(--fb-text) !important; }
        .swagger-ui .responses-inner { background: transparent !important; }
        .swagger-ui .auth-wrapper { color: var(--fb-text) !important; }
        .swagger-ui .dialog-ux .modal-ux { background: var(--fb-surface) !important; border: 1px solid var(--fb-border) !important; }
        .swagger-ui .dialog-ux .modal-ux-header h3 { color: var(--fb-text) !important; }
        .swagger-ui .dialog-ux .modal-ux-content p { color: var(--fb-text-muted) !important; }
        .swagger-ui .wrapper { max-width: 1200px !important; padding: 0 24px !important; }
        .swagger-ui .servers > label { color: var(--fb-text) !important; }
        .swagger-ui .servers > label select { min-width: 320px; }
        .swagger-ui a { color: var(--fb-primary-hover) !important; }
    </style>
</head>
<body>
    <div class="fb-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="6" fill="#6366f1"/>
            <g transform="scale(0.7) translate(5.1 5.1)" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/>
                <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/>
                <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>
            </g>
        </svg>
        <h1>Frontbase Edge API</h1>
        <span class="badge badge-version">v${EDGE_VERSION}</span>
        <span class="badge badge-engine">${profile.badge}</span>
    </div>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        SwaggerUIBundle({
            url: '/api/openapi.json',
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIBundle.SwaggerUIStandalonePreset,
            ],
            layout: 'BaseLayout',
            defaultModelsExpandDepth: -1,
            docExpansion: 'list',
            filter: true,
            persistAuthorization: true,
        });
    </script>
</body>
</html>`);
    });

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
