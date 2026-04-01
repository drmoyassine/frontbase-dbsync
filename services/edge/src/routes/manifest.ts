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
import { getStateDbConfig, getCacheConfig, getQueueConfig } from '../config/env.js';

const manifestRoute = new OpenAPIHono();

/**
 * Derive adapter_type from FRONTBASE_ADAPTER_PLATFORM env var.
 * Any platform ending in '-lite' = lite, otherwise = full
 */
function getAdapterType(): string {
    const platform = process.env.FRONTBASE_ADAPTER_PLATFORM || 'docker';
    if (platform.endsWith('-lite')) return 'lite';
    return 'full';
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
 * Derive binding types from config (types only, never credentials).
 */
function getBindings(): Record<string, string> {
    const bindings: Record<string, string> = {};

    // Database
    const dbCfg = getStateDbConfig();
    if (dbCfg.provider && dbCfg.provider !== 'local') {
        bindings.db = dbCfg.provider;
    } else if (dbCfg.url) {
        bindings.db = 'custom';
    } else {
        bindings.db = 'none';
    }

    // Cache
    const cacheCfg = getCacheConfig();
    bindings.cache = cacheCfg.provider !== 'none' ? cacheCfg.provider : 'none';

    // Queue
    const queueCfg = getQueueConfig();
    bindings.queue = queueCfg.provider !== 'none' ? queueCfg.provider : 'none';

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
