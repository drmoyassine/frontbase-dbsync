/**
 * AI Inference Route
 * 
 * POST /api/ai/:slug — calls the GPU model mapped to this slug.
 * 
 * For Cloudflare Workers AI, uses the `AI` binding injected by the platform.
 * Each slug maps to a model_id and model_type from the `edge_gpu_models` table,
 * synced to the engine via startup sync.
 * 
 * The response includes the model type and raw result from the provider.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

// Global reference to CF Workers AI binding (set by adapter)
let _aiBinding: any = null;

export function setAIBinding(ai: any) {
    _aiBinding = ai;
}

const aiRoute = new OpenAPIHono();

// =============================================================================
// GPU Models registry — populated by startup sync or deploy route
// =============================================================================

interface GPUModelEntry {
    slug: string;
    model_id: string;      // "@cf/meta/llama-3.1-8b-instruct"
    model_type: string;    // "llm", "embedder", "stt", etc.
    provider: string;      // "workers_ai"
    provider_config?: any; // Default params (temperature, etc.)
}

// In-memory model registry — populated on startup/deploy
let _gpuModels: GPUModelEntry[] = [];

export function setGPUModels(models: GPUModelEntry[]) {
    _gpuModels = models;
    console.log(`[AI] Registered ${models.length} GPU model(s):`, models.map(m => m.slug).join(', '));
}

export function getGPUModels(): GPUModelEntry[] {
    // Auto-init from env var on first access (set during deploy)
    if (_gpuModels.length === 0) {
        const envModels = (globalThis as any).process?.env?.FRONTBASE_GPU_MODELS;
        if (envModels) {
            try {
                const parsed = JSON.parse(envModels);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    _gpuModels = parsed;
                    console.log(`[AI] Auto-loaded ${parsed.length} GPU model(s) from env:`, parsed.map((m: any) => m.slug).join(', '));
                }
            } catch (e) {
                console.error('[AI] Failed to parse FRONTBASE_GPU_MODELS:', e);
            }
        }
    }
    return _gpuModels;
}

// =============================================================================
// List available AI models
// =============================================================================

aiRoute.get('/', (c) => {
    const models = getGPUModels();
    return c.json({
        models: models.map(m => ({
            slug: m.slug,
            model_id: m.model_id,
            model_type: m.model_type,
            provider: m.provider,
            endpoint: `/api/ai/${m.slug}`,
        })),
        total: models.length,
    });
});

// =============================================================================
// Inference endpoint — POST /api/ai/:slug
// =============================================================================

aiRoute.post('/:slug', async (c) => {
    const slug = c.req.param('slug');
    const models = getGPUModels();

    // Find the model
    const model = models.find(m => m.slug === slug);
    if (!model) {
        return c.json({
            success: false,
            error: `No GPU model found for slug '${slug}'`,
            available: models.map(m => m.slug),
        }, 404);
    }

    // Parse the request body
    let payload: any;
    try {
        payload = await c.req.json();
    } catch {
        return c.json({ success: false, error: 'Invalid JSON body' }, 400);
    }

    // Merge provider_config defaults
    if (model.provider_config) {
        const defaults = typeof model.provider_config === 'string'
            ? JSON.parse(model.provider_config)
            : model.provider_config;
        payload = { ...defaults, ...payload };
    }

    // Route to the correct provider
    try {
        let result: any;

        if (model.provider === 'workers_ai') {
            if (!_aiBinding) {
                return c.json({
                    success: false,
                    error: 'AI binding not available. Ensure the Worker has an AI binding configured.',
                }, 503);
            }
            result = await _aiBinding.run(model.model_id, payload);
        } else {
            return c.json({
                success: false,
                error: `Provider '${model.provider}' not yet supported on edge. Available: workers_ai`,
            }, 400);
        }

        return c.json({
            success: true,
            model_type: model.model_type,
            model_id: model.model_id,
            slug: model.slug,
            result,
        });
    } catch (err: any) {
        console.error(`[AI] Inference error for ${slug}:`, err);
        return c.json({
            success: false,
            error: err.message || 'Inference failed',
            model_id: model.model_id,
        }, 500);
    }
});

export { aiRoute };
