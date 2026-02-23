/**
 * Frontbase Edge Engine - Docker/Node.js Adapter
 * 
 * Entry point for Docker and local development deployments.
 * Uses @hono/node-server for HTTP serving and filesystem-based static files.
 * 
 * This is the "full" adapter — serves both SSR pages and automation routes.
 */

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { compress } from 'hono/compress';
import path from 'path';
import { fileURLToPath } from 'url';

import { createApp, wireMiddleware, wireRoutes } from './adapters/shared.js';
import type { IEdgeAdapter } from './adapters/IEdgeAdapter.js';
import { runStartupSync } from './startup/sync.js';

// =============================================================================
// Docker Adapter
// =============================================================================

const adapter: IEdgeAdapter = {
    platform: 'docker',
    scope: 'full',
};

// Create and configure the Hono app
const app = createApp();

// Wire middleware — with compression (Node.js doesn't handle it natively)
wireMiddleware(app, { compress: true, compressMiddleware: compress });

// Wire routes — full scope (pages + automations)
wireRoutes(app, adapter.scope);

// =============================================================================
// Static Files (for hydrate.js and other client assets)
// =============================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.resolve(__dirname, '../public');

app.use('/static/*', serveStatic({
    root: publicPath,
    rewriteRequestPath: (p) => p.replace(/^\/static/, '')
}));

// =============================================================================
// Start Server
// =============================================================================
const port = parseInt(process.env.PORT || '3002');

serve({
    fetch: app.fetch,
    port,
}, (info) => {
    console.log(`🚀 Edge Engine running on http://localhost:${info.port}`);
    console.log(`📍 PUBLIC_URL: ${process.env.PUBLIC_URL || '(not set - using request headers)'}`);
    console.log(`🔌 Adapter: ${adapter.platform} (scope: ${adapter.scope})`);

    // Run startup sync in background (non-blocking)
    runStartupSync().catch(err => {
        console.error('[Startup Sync] Error:', err);
    });
});

export default app;
