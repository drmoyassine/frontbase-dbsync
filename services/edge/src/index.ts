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

import { fullApp } from './engine/full.js';
import { runStartupSync } from './startup/sync.js';

// =============================================================================
// Docker-Specific Middleware
// =============================================================================

// Compression (Node.js doesn't handle it natively, unlike Cloudflare)
fullApp.use('*', compress());

// =============================================================================
// Static Files (for hydrate.js and other client assets)
// =============================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.resolve(__dirname, '../public');

fullApp.use('/static/*', serveStatic({
    root: publicPath,
    rewriteRequestPath: (p) => p.replace(/^\/static/, '')
}));

// =============================================================================
// Start Server
// =============================================================================
const port = parseInt(process.env.PORT || '3002');

serve({
    fetch: fullApp.fetch,
    port,
}, (info) => {
    console.log(`🚀 Edge Engine running on http://localhost:${info.port}`);
    console.log(`📍 PUBLIC_URL: ${process.env.PUBLIC_URL || '(not set - using request headers)'}`);
    console.log(`🔌 Adapter: docker (scope: full)`);

    // Run startup sync in background (non-blocking)
    runStartupSync().catch(err => {
        console.error('[Startup Sync] Error:', err);
    });
});

export default fullApp;
