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
// Build Bundle Endpoint (Docker-only — delegates CF bundle builds)
// =============================================================================
fullApp.post('/api/build-bundle', async (c) => {
    const { execSync } = await import('child_process');
    const fs = await import('fs');

    // Provider → tsup config map (mirrors backend bundle.py)
    const PROVIDER_CONFIGS: Record<string, { config: string; output: string }> = {
        'cloudflare': { config: 'tsup.cloudflare-lite.ts', output: 'cloudflare-lite.js' },
        'cloudflare-full': { config: 'tsup.cloudflare.ts', output: 'cloudflare.js' },
        'supabase': { config: 'tsup.supabase-edge-lite.ts', output: 'supabase-edge-lite.js' },
        'supabase-full': { config: 'tsup.supabase-edge.ts', output: 'supabase-edge.js' },
        'upstash': { config: 'tsup.upstash-workflow-lite.ts', output: 'upstash-workflow-lite.js' },
        'upstash-full': { config: 'tsup.upstash-workflow.ts', output: 'upstash-workflow.js' },
        'vercel': { config: 'tsup.vercel-edge-lite.ts', output: 'vercel-edge-lite.js' },
        'vercel-full': { config: 'tsup.vercel-edge.ts', output: 'vercel-edge.js' },
        'netlify': { config: 'tsup.netlify-edge-lite.ts', output: 'netlify-edge-lite.js' },
        'netlify-full': { config: 'tsup.netlify-edge.ts', output: 'netlify-edge.js' },
        'deno': { config: 'tsup.deno-deploy-lite.ts', output: 'deno-deploy-lite.js' },
        'deno-full': { config: 'tsup.deno-deploy.ts', output: 'deno-deploy.js' },
    };

    try {
        const body = await c.req.json().catch(() => ({}));
        const adapterType = (body as any).adapter_type || 'automations';
        const provider = (body as any).provider || 'cloudflare';
        const isFull = adapterType === 'full';

        const configKey = isFull ? `${provider}-full` : provider;
        const cfg = PROVIDER_CONFIGS[configKey];
        if (!cfg) {
            return c.json({ success: false, error: `Unknown provider/adapter: ${configKey}` }, 400);
        }

        const { config: configFile, output: outputFile } = cfg;
        const label = `${provider.charAt(0).toUpperCase() + provider.slice(1)} ${isFull ? 'Full' : 'Lite'}`;

        // Resolve edge root (one level up from dist/)
        const edgeRoot = path.resolve(__dirname, '..');
        const distFile = path.join(edgeRoot, 'dist', outputFile);

        // Clean previous build
        if (fs.existsSync(distFile)) fs.unlinkSync(distFile);

        console.log(`[Build] Building ${label} bundle in ${edgeRoot}...`);
        const result = execSync(`npx tsup --config ${configFile}`, {
            cwd: edgeRoot,
            encoding: 'utf-8',
            timeout: isFull ? 120_000 : 60_000,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        if (!fs.existsSync(distFile)) {
            return c.json({ success: false, error: `Build output not found: ${distFile}` }, 500);
        }

        const content = fs.readFileSync(distFile, 'utf-8');
        console.log(`[Build] ${label} bundle: ${content.length} bytes (${Math.round(content.length / 1024)} KB)`);

        return c.json({
            success: true,
            script_content: content,
            script_filename: outputFile,
            size_bytes: content.length,
            adapter_type: adapterType,
        });
    } catch (err: any) {
        console.error('[Build] Failed:', err.message);
        return c.json({
            success: false,
            error: err.stderr || err.message || 'Unknown build error',
        }, 500);
    }
});

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
