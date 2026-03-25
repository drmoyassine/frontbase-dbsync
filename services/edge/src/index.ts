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
// Source Snapshot Endpoint (Docker-only — backend delegates here)
// =============================================================================
fullApp.get('/api/source-snapshot', async (c) => {
    const fs = await import('fs');
    const crypto = await import('crypto');

    const provider = c.req.query('provider') || '';
    const adapterType = c.req.query('adapter_type') || 'full';
    const isLite = ['automations', 'lite', ''].includes(adapterType);

    const edgeRoot = path.resolve(__dirname, '..');
    const srcDir = path.join(edgeRoot, 'src');

    if (!fs.existsSync(srcDir)) {
        return c.json({ success: false, error: 'Source directory not found' }, 404);
    }

    const CORE_PREFIX = 'frontbase-core';
    const allProviders = new Set(['cloudflare', 'supabase', 'vercel', 'netlify', 'deno', 'docker']);
    const otherProviders = provider ? new Set([...allProviders].filter(p => p !== provider)) : new Set<string>();
    const fullOnlyDirs = ['ssr/', 'components/', 'db/_archived/'];

    const files: Record<string, string> = {};
    let totalSize = 0;

    function walkDir(dir: string, prefix: string = '') {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries.sort((a: any, b: any) => a.name.localeCompare(b.name))) {
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
                walkDir(path.join(dir, entry.name), rel);
            } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
                // Skip backups
                if (rel.includes('.bak')) continue;
                // Skip other providers' adapter files
                if (rel.startsWith('adapters/') && otherProviders.size > 0) {
                    const baseName = entry.name.replace(/\.[^.]+$/, '').toLowerCase();
                    if ([...otherProviders].some(p => baseName.includes(p))) continue;
                }
                // Skip SSR-only folders for lite bundles
                if (isLite && fullOnlyDirs.some(d => rel.startsWith(d))) continue;

                try {
                    const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
                    files[`${CORE_PREFIX}/${rel}`] = content;
                    totalSize += content.length;
                } catch { /* skip unreadable */ }
            }
        }
    }

    walkDir(srcDir);

    if (Object.keys(files).length === 0) {
        return c.json({ success: false, error: 'No source files found' }, 404);
    }

    // Inject README.md
    const bundleMode = isLite ? 'Lite (Automations only)' : 'Full (SSR + Automations)';
    const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Unknown';
    files[`${CORE_PREFIX}/README.md`] = `# Frontbase Edge Engine

**Provider**: ${providerLabel}
**Bundle**: ${bundleMode}
**Adapter**: ${adapterType || 'automations'}

## Folder Structure

| Folder | Description |
|:-------|:------------|
| \`adapters/\` | Platform entry point — wires the Hono app to the runtime |
| \`engine/\` | Core Hono app creation, middleware, route registration |
| \`routes/\` | API routes: health, deploy, execute, webhook, executions |
| \`cache/\` | Redis/Upstash cache adapter with ICacheProvider interface |
| \`middleware/\` | Auth (API key, JWT), rate limiting |
| \`db/\` | State provider (SQLite/Turso), datasource adapters |
| \`schemas/\` | Zod validation schemas for API payloads |
| \`startup/\` | Backend sync on boot (Redis, Turso, JWT settings) |
| \`lib/\` | Shared utilities |
${!isLite ? '| `ssr/` | Server-side page rendering (React/Hono) |' : ''}
## Data vs Code

This Inspector shows the **engine source code** — how the runtime works.

Published **pages and workflows** are stored in the attached state database
(SQLite or Turso), not in these source files. They are deployed via the
\`/api/deploy\` endpoint and served by the routes defined here.
`;

    return c.json({
        success: true,
        files,
        file_count: Object.keys(files).length,
        total_size: totalSize,
    });
});

// =============================================================================
// Source Hash Endpoint (Docker-only — backend delegates for drift detection)
// =============================================================================
fullApp.get('/api/source-hash', async (c) => {
    const fs = await import('fs');
    const crypto = await import('crypto');

    const edgeRoot = path.resolve(__dirname, '..');
    const srcDir = path.join(edgeRoot, 'src');

    if (!fs.existsSync(srcDir)) {
        return c.json({ success: false, hash: null }, 404);
    }

    const hasher = crypto.createHash('sha256');
    let fileCount = 0;

    function walkDir(dir: string, prefix: string = '') {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries.sort((a: any, b: any) => a.name.localeCompare(b.name))) {
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
                walkDir(path.join(dir, entry.name), rel);
            } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
                try {
                    hasher.update(rel);
                    hasher.update(fs.readFileSync(path.join(dir, entry.name)));
                    fileCount++;
                } catch { /* skip */ }
            }
        }
    }

    walkDir(srcDir);

    if (fileCount === 0) {
        return c.json({ success: false, hash: null }, 404);
    }

    const hash = hasher.digest('hex').substring(0, 12);
    return c.json({ success: true, hash, file_count: fileCount });
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
