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
