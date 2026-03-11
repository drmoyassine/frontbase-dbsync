/**
 * Manifest Route — Self-Describing Engine Metadata
 * 
 * Public (no auth) endpoint that returns what this engine is, what it can do,
 * and what's deployed. Any Frontbase instance that imports this engine can
 * read the manifest to auto-populate GPU models, capabilities, and bindings.
 * 
 * The manifest is dynamically generated from live state, so it's always
 * current after a deploy/redeploy — no static config needed.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { getGPUModels } from './ai.js';

const manifestRoute = new OpenAPIHono();

/**
 * Derive adapter_type from FRONTBASE_ADAPTER_PLATFORM env var.
 * cloudflare = full, cloudflare-lite = lite, docker = full (default)
 */
function getAdapterType(): string {
    const platform = process.env.FRONTBASE_ADAPTER_PLATFORM || 'docker';
    if (platform === 'cloudflare-lite') return 'lite';
    return 'full'; // cloudflare, docker, etc.
}

/**
 * Derive active capabilities from env + adapter type.
 */
function getCapabilities(): string[] {
    const caps: string[] = ['workflows']; // All engines support workflows
    const adapterType = getAdapterType();
    if (adapterType === 'full') caps.push('ssr');
    if (getGPUModels().length > 0) caps.push('ai');
    return caps;
}

/**
 * Derive binding types from env vars (types only, never credentials).
 */
function getBindings(): Record<string, string> {
    const bindings: Record<string, string> = {};

    // Database
    const dbUrl = process.env.FRONTBASE_STATE_DB_URL || '';
    if (dbUrl.startsWith('libsql://') || dbUrl.startsWith('https://')) {
        bindings.db = 'turso';
    } else if (dbUrl.includes('sqlite') || dbUrl.endsWith('.db')) {
        bindings.db = 'sqlite';
    } else if (dbUrl) {
        bindings.db = 'custom';
    } else {
        bindings.db = 'none';
    }

    // Cache
    const cacheUrl = process.env.FRONTBASE_CACHE_URL || '';
    if (cacheUrl.includes('upstash')) {
        bindings.cache = 'upstash';
    } else if (cacheUrl.includes('redis')) {
        bindings.cache = 'redis';
    } else if (cacheUrl) {
        bindings.cache = 'custom';
    } else {
        bindings.cache = 'none';
    }

    // Queue
    const qstashToken = process.env.QSTASH_TOKEN || '';
    bindings.queue = qstashToken ? 'qstash' : 'none';

    return bindings;
}


// =============================================================================
// GET /api/manifest — Public, no auth
// =============================================================================

manifestRoute.get('/', (c) => {
    const gpuModels = getGPUModels();

    return c.json({
        engine_name: process.env.FRONTBASE_ENGINE_NAME || 'frontbase-edge',
        frontbase_version: '0.1.0',
        adapter_type: getAdapterType(),
        platform: process.env.FRONTBASE_ADAPTER_PLATFORM || 'docker',
        deployed_at: process.env.FRONTBASE_DEPLOYED_AT || null,
        bundle_checksum: process.env.FRONTBASE_BUNDLE_CHECKSUM || null,
        capabilities: getCapabilities(),
        tech_stack: {
            runtime: process.env.FRONTBASE_ADAPTER_PLATFORM === 'cloudflare' || process.env.FRONTBASE_ADAPTER_PLATFORM === 'cloudflare-lite'
                ? 'Cloudflare Workers' : 'Node.js',
            framework: 'Hono',
            orm: 'Drizzle ORM',
            templating: 'LiquidJS',
            validation: 'Zod + OpenAPI 3.1',
        },
        gpu_models: gpuModels.map(m => ({
            slug: m.slug,
            model_id: m.model_id,
            model_type: m.model_type,
            provider: m.provider,
        })),
        bindings: getBindings(),
    });
});


export { manifestRoute };
