/**
 * AI Module — shared GPU model registry and AI binding management.
 * 
 * Provides:
 *   - setAIBinding / getAIBinding — CF Workers AI binding singleton
 *   - setGPUModels / getGPUModels — in-memory model registry
 * 
 * Used by:
 *   - openai.ts (route handlers for /v1/*)
 *   - cloudflare-lite.ts / cloudflare.ts (adapters that inject the AI binding)
 * 
 * The old /api/ai/:slug route has been removed in favour of
 * the OpenAI-compatible /v1/chat/completions endpoint (openai.ts).
 */

import { getGpuModels as getGpuModelsFromEnv } from '../config/env.js';

// Global reference to CF Workers AI binding (set by adapter)
let _aiBinding: any = null;

export function setAIBinding(ai: any) {
    _aiBinding = ai;
}

export function getAIBinding(): any {
    return _aiBinding;
}

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
    // Auto-init from FRONTBASE_GPU env var on first access
    if (_gpuModels.length === 0) {
        try {
            const envModels = getGpuModelsFromEnv();

            if (Array.isArray(envModels) && envModels.length > 0) {
                // Map camelCase env fields → snake_case GPUModelEntry
                _gpuModels = envModels.map((m: any) => ({
                    slug: m.slug,
                    model_id: m.modelId || m.model_id,
                    model_type: m.modelType || m.model_type,
                    provider: m.provider,
                    provider_config: m.providerConfig || m.provider_config,
                }));
                console.log(`[AI] Auto-loaded ${_gpuModels.length} GPU model(s) from env:`, _gpuModels.map(m => m.slug).join(', '));
            }
        } catch (e) {
            console.error('[AI] Failed to load GPU models from env:', e);
        }
    }
    return _gpuModels;
}
