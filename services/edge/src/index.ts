/**
 * Frontbase Edge Engine - Runtime Service
 * 
 * Hono-based SSR and no-code execution platform for edge deployment.
 * Handles published pages, workflows, webhooks, and execution monitoring.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

// Middleware imports
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import { requestId } from 'hono/request-id';
import { timeout } from 'hono/timeout';
import { bodyLimit } from 'hono/body-limit';
import { every } from 'hono/combine';

import { healthRoute } from './routes/health';
import { deployRoute } from './routes/deploy';
import { executeRoute } from './routes/execute';
import { webhookRoute } from './routes/webhook';
import { executionsRoute } from './routes/executions';
import { pagesRoute } from './routes/pages';
import { importRoute } from './routes/import';
import { dataRoute } from './routes/data';
import { runStartupSync } from './startup/sync.js';

// Auth middleware (Sprint 2)
import { apiKeyAuth } from './middleware/auth';

// Create OpenAPI-enabled Hono app with validation error logging
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

// =============================================================================
// Global Error Handler - Log Zod validation errors
// =============================================================================
app.onError((err, c) => {
    console.error('[Global Error]', err);

    // Check if it's a Zod validation error
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

// =============================================================================
// Global Middleware Stack (Sprint 0: Foundation)
// =============================================================================

// Request tracking & logging
app.use('*', requestId());
app.use('*', logger());

// Security
app.use('*', secureHeaders());

// Performance
app.use('*', compress());
app.use('*', timeout(29000)); // 29s (Cloudflare Workers limit)
app.use('*', bodyLimit({ maxSize: 1024 * 1024 })); // 1MB

// CORS for API routes
app.use('/api/*', cors({
    origin: ['http://localhost:5173', 'http://localhost:8000'],
    credentials: true,
}));

// Legacy CORS for existing routes (backward compatibility)
app.use('*', cors({
    origin: ['http://localhost:5173', 'http://localhost:8000'],
    credentials: true,
}));

// =============================================================================
// Route-Specific Middleware (Sprint 2: Security)
// =============================================================================

// Webhook routes require API key authentication
app.use('/api/webhook/*', apiKeyAuth);

// OpenAPI Info
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

// Swagger UI
app.get('/api/docs', swaggerUI({ url: '/api/openapi.json' }));

// =============================================================================
// API Routes (under /api/ prefix)
// =============================================================================
app.route('/api/health', healthRoute);
app.route('/api/deploy', deployRoute);
app.route('/api/execute', executeRoute);
app.route('/api/webhook', webhookRoute);
app.route('/api/executions', executionsRoute);
app.route('/api/import', importRoute); // Publish contract import endpoint
app.route('/api/data', dataRoute); // Data API for client hydration

// =============================================================================
// Static Files (for hydrate.js and other client assets)
// =============================================================================
app.use('/static/*', serveStatic({ root: './public', rewriteRequestPath: (path) => path.replace('/static', '') }));

// =============================================================================
// SSR Pages (Sprint 3) - Clean URLs at root level
// =============================================================================
app.route('', pagesRoute); // Pages at /{slug}

// Root shows docs (or could show homepage)

// Start server with Node.js adapter
const port = parseInt(process.env.PORT || '3002');

serve({
    fetch: app.fetch,
    port,
}, (info) => {
    console.log(`🚀 Edge Engine running on http://localhost:${info.port}`);
    console.log(`📍 PUBLIC_URL: ${process.env.PUBLIC_URL || '(not set - using request headers)'}`);

    // Run startup sync in background (non-blocking)
    runStartupSync().catch(err => {
        console.error('[Startup Sync] Error:', err);
    });
});


export default app;
