/**
 * Shared Edge Engine Wiring
 * 
 * Contains route registration and middleware setup shared across all adapters.
 * Platform-specific adapters import these helpers and add their own
 * static file serving and server startup logic.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';

// Middleware imports (platform-agnostic only)
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { requestId } from 'hono/request-id';
import { timeout } from 'hono/timeout';
import { bodyLimit } from 'hono/body-limit';

// Route imports
import { healthRoute } from '../routes/health.js';
import { deployRoute } from '../routes/deploy.js';
import { executeRoute } from '../routes/execute.js';
import { webhookRoute } from '../routes/webhook.js';
import { executionsRoute } from '../routes/executions.js';
import { pagesRoute } from '../routes/pages.js';
import { importRoute } from '../routes/import.js';
import { dataRoute } from '../routes/data.js';
import { cacheRoute } from '../routes/cache.js';

// Auth middleware
import { apiKeyAuth } from '../middleware/auth.js';

import type { HonoApp } from './IEdgeAdapter.js';

// =============================================================================
// App Factory
// =============================================================================

/**
 * Create a new OpenAPIHono app with standard error handling.
 */
export function createApp(): HonoApp {
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success) {
                console.error('[Zod Validation Error] Request body validation failed:');
                console.error(JSON.stringify(result.error.issues, null, 2));
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
            console.error('[Zod Validation Error] Details:');
            console.error(JSON.stringify((err as any).issues || err, null, 2));
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

    return app;
}

// =============================================================================
// Middleware Wiring
// =============================================================================

export interface MiddlewareOptions {
    /** Whether to enable response compression (disable on Workers — platform handles it) */
    compress?: boolean;
    /** Additional allowed CORS origins */
    corsOrigins?: string[];
    /** Injected compress middleware (Node.js only — import from 'hono/compress') */
    compressMiddleware?: () => any;
}

/**
 * Wire cross-platform middleware onto the app.
 * Platform-specific middleware (e.g. compress) is controlled via options.
 */
export function wireMiddleware(app: HonoApp, options: MiddlewareOptions = {}): void {
    const { corsOrigins = [] } = options;

    // Request tracking & logging
    app.use('*', requestId());
    app.use('*', logger());

    // Security
    app.use('*', secureHeaders());

    // Performance — compress only on platforms that don't handle it natively
    if (options.compress && options.compressMiddleware) {
        app.use('*', options.compressMiddleware());
    }
    app.use('*', timeout(29000)); // 29s (Cloudflare Workers limit)
    app.use('*', bodyLimit({ maxSize: 50 * 1024 * 1024 })); // 50MB

    // CORS
    const origins = ['http://localhost:5173', 'http://localhost:8000', ...corsOrigins];
    app.use('/api/*', cors({ origin: origins, credentials: true }));
    app.use('*', cors({ origin: origins, credentials: true }));

    // Webhook routes require API key authentication
    app.use('/api/webhook/*', apiKeyAuth);
}

// =============================================================================
// Route Wiring
// =============================================================================

export type RouteScope = 'pages' | 'automations' | 'full';

/**
 * Wire API routes onto the app based on scope.
 */
export function wireRoutes(app: HonoApp, scope: RouteScope = 'full'): void {
    // Health is always available
    app.route('/api/health', healthRoute);

    // OpenAPI docs
    app.doc('/api/openapi.json', {
        openapi: '3.1.0',
        info: {
            title: 'Frontbase Edge Engine API',
            version: '0.1.0',
            description: 'Edge runtime API for SSR pages, workflows, and triggers.',
        },
        servers: [
            { url: 'http://localhost:3002', description: 'Local development' },
        ],
    });
    app.get('/api/docs', swaggerUI({ url: '/api/openapi.json' }));

    // Pages scope: SSR + data routes
    if (scope === 'pages' || scope === 'full') {
        app.route('/api/import', importRoute);
        app.route('/api/data', dataRoute);
        app.route('/api/cache', cacheRoute);
        app.route('', pagesRoute); // SSR pages at /{slug}
    }

    // Automations scope: workflow execution routes
    if (scope === 'automations' || scope === 'full') {
        app.route('/api/deploy', deployRoute);
        app.route('/api/execute', executeRoute);
        app.route('/api/webhook', webhookRoute);
        app.route('/api/executions', executionsRoute);
    }
}
