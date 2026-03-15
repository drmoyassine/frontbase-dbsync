/**
 * OpenAI-Compatible Routes
 * 
 * POST /v1/chat/completions        — text generation (LLM) in OpenAI format
 * POST /v1/responses               — responses API with reasoning control
 * POST /v1/embeddings              — text embeddings in OpenAI format
 * POST /v1/images/generations      — image generation in OpenAI format
 * POST /v1/audio/transcriptions    — speech-to-text in OpenAI format
 * POST /v1/audio/speech            — text-to-speech in OpenAI format
 * GET  /v1/models                  — list available models in OpenAI format
 * 
 * These endpoints replace the old /api/ai/:slug route.
 * They map OpenAI request format → Workers AI binding → OpenAI response format.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { getGPUModels, getAIBinding } from './ai.js';

const openaiRoute = new OpenAPIHono();


// =============================================================================
// Shared: model + AI binding resolution (DRY helper)
// =============================================================================

function resolveModel(modelSlug: string | undefined, c: any) {
    if (!modelSlug) {
        return { error: c.json({ error: { message: 'Missing required field: model', type: 'invalid_request_error', code: 'missing_field' } }, 400) };
    }
    const models = getGPUModels();
    const model = models.find(m => m.slug === modelSlug);
    if (!model) {
        return { error: c.json({ error: { message: `Model '${modelSlug}' not found. Available: ${models.map(m => m.slug).join(', ')}`, type: 'invalid_request_error', code: 'model_not_found' } }, 404) };
    }
    const ai = getAIBinding();
    if (!ai) {
        return { error: c.json({ error: { message: 'AI binding not available.', type: 'server_error', code: 'ai_binding_missing' } }, 503) };
    }
    return { model, ai };
}

function mergeDefaults(payload: any, model: any) {
    if (model.provider_config) {
        const defaults = typeof model.provider_config === 'string' ? JSON.parse(model.provider_config) : model.provider_config;
        for (const [k, v] of Object.entries(defaults)) {
            if (!(k in payload)) payload[k] = v;
        }
    }
}


// =============================================================================
// GET /v1/models — List available models (OpenAI format)
// =============================================================================

openaiRoute.get('/models', (c) => {
    const models = getGPUModels();
    return c.json({
        object: 'list',
        data: models.map(m => ({
            id: m.slug,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: m.provider,
            permission: [],
            root: m.model_id,
            parent: null,
        })),
    });
});


// =============================================================================
// POST /v1/chat/completions — Text generation (OpenAI format)
// =============================================================================

openaiRoute.post('/chat/completions', async (c) => {
    let body: any;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: { message: 'Invalid JSON body', type: 'invalid_request_error', code: 'invalid_json' } }, 400);
    }

    const resolved = resolveModel(body.model, c);
    if ('error' in resolved) return resolved.error;
    const { model, ai } = resolved;

    const payload: any = {};
    if (body.messages) payload.messages = body.messages;
    if (body.max_tokens != null) payload.max_tokens = body.max_tokens;
    if (body.temperature != null) payload.temperature = body.temperature;
    if (body.top_p != null) payload.top_p = body.top_p;
    if (body.top_k != null) payload.top_k = body.top_k;
    if (body.stream != null) payload.stream = body.stream;
    if (body.stop != null) payload.stop = body.stop;
    if (body.seed != null) payload.seed = body.seed;
    if (body.frequency_penalty != null) payload.frequency_penalty = body.frequency_penalty;
    if (body.presence_penalty != null) payload.presence_penalty = body.presence_penalty;
    if (body.repetition_penalty != null) payload.repetition_penalty = body.repetition_penalty;
    if (body.tools != null) payload.tools = body.tools;
    if (body.response_format != null) payload.response_format = body.response_format;
    if (body.raw != null) payload.raw = body.raw;
    if (body.lora != null) payload.lora = body.lora;
    mergeDefaults(payload, model);

    try {
        const result = await ai.run(model.model_id, payload);

        // If Workers AI already returned a full OpenAI chat completion object, pass it through
        if (result && typeof result === 'object' && Array.isArray(result.choices)) {
            result.model = result.model || model.slug;
            result.id = result.id || `chatcmpl-${crypto.randomUUID().slice(0, 12)}`;
            return c.json(result);
        }

        // Legacy Workers AI response shapes (plain string or {response: "..."})
        const responseContent = typeof result === 'string'
            ? result
            : result?.response ?? result?.result ?? JSON.stringify(result);

        return c.json({
            id: `chatcmpl-${crypto.randomUUID().slice(0, 12)}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model.slug,
            choices: [{
                index: 0,
                message: { role: 'assistant', content: responseContent },
                finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
    } catch (err: any) {
        console.error(`[OpenAI] Inference error for ${body.model}:`, err);
        return c.json({ error: { message: err.message || 'Inference failed', type: 'server_error', code: 'inference_error' } }, 500);
    }
});


// =============================================================================
// POST /v1/embeddings — Text embeddings (OpenAI format)
// =============================================================================

openaiRoute.post('/embeddings', async (c) => {
    let body: any;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: { message: 'Invalid JSON body', type: 'invalid_request_error', code: 'invalid_json' } }, 400);
    }

    const resolved = resolveModel(body.model, c);
    if ('error' in resolved) return resolved.error;
    const { model, ai } = resolved;

    const input = body.input;
    const payload = Array.isArray(input) ? { text: input } : { text: [input] };

    try {
        const result = await ai.run(model.model_id, payload);
        const data = Array.isArray(result?.data)
            ? result.data.map((emb: any, i: number) => ({
                object: 'embedding',
                embedding: emb.values ?? emb,
                index: i,
            }))
            : [{ object: 'embedding', embedding: result?.data ?? result, index: 0 }];

        return c.json({
            object: 'list',
            data,
            model: model.slug,
            usage: { prompt_tokens: 0, total_tokens: 0 },
        });
    } catch (err: any) {
        console.error(`[OpenAI] Embedding error for ${body.model}:`, err);
        return c.json({ error: { message: err.message || 'Embedding failed', type: 'server_error', code: 'inference_error' } }, 500);
    }
});


// =============================================================================
// POST /v1/images/generations — Image generation (OpenAI format)
// =============================================================================

openaiRoute.post('/images/generations', async (c) => {
    let body: any;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: { message: 'Invalid JSON body', type: 'invalid_request_error', code: 'invalid_json' } }, 400);
    }

    const resolved = resolveModel(body.model, c);
    if ('error' in resolved) return resolved.error;
    const { model, ai } = resolved;

    if (!body.prompt) {
        return c.json({ error: { message: 'Missing required field: prompt', type: 'invalid_request_error', code: 'missing_field' } }, 400);
    }

    const payload: any = { prompt: body.prompt };
    if (body.size) {
        const [w, h] = body.size.split('x').map(Number);
        if (w && h) { payload.width = w; payload.height = h; }
    }
    if (body.n != null) payload.num_steps = body.n;
    mergeDefaults(payload, model);

    try {
        const result = await ai.run(model.model_id, payload);

        // Workers AI text-to-image returns raw image bytes
        let b64Data: string;
        if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
            const bytes = result instanceof ArrayBuffer ? new Uint8Array(result) : result;
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            b64Data = btoa(binary);
        } else if (typeof result === 'string') {
            b64Data = result;
        } else {
            b64Data = JSON.stringify(result);
        }

        const responseFormat = body.response_format || 'b64_json';

        return c.json({
            created: Math.floor(Date.now() / 1000),
            data: [{
                ...(responseFormat === 'b64_json'
                    ? { b64_json: b64Data }
                    : { url: `data:image/png;base64,${b64Data}` }),
                revised_prompt: body.prompt,
            }],
        });
    } catch (err: any) {
        console.error(`[OpenAI] Image generation error for ${body.model}:`, err);
        return c.json({ error: { message: err.message || 'Image generation failed', type: 'server_error', code: 'inference_error' } }, 500);
    }
});


// =============================================================================
// POST /v1/audio/transcriptions — Speech-to-text (OpenAI format)
// =============================================================================

openaiRoute.post('/audio/transcriptions', async (c) => {
    // Accepts multipart/form-data (OpenAI standard) or JSON with base64 audio
    let modelSlug: string | undefined;
    let audioData: ArrayBuffer | null = null;

    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
        const formData = await c.req.formData();
        const file = formData.get('file') as File | null;
        modelSlug = formData.get('model') as string | undefined;
        if (!file) {
            return c.json({ error: { message: 'Missing required field: file', type: 'invalid_request_error', code: 'missing_field' } }, 400);
        }
        audioData = await file.arrayBuffer();
    } else {
        let body: any;
        try { body = await c.req.json(); } catch {
            return c.json({ error: { message: 'Invalid request body', type: 'invalid_request_error', code: 'invalid_body' } }, 400);
        }
        modelSlug = body.model;
        if (body.file) {
            const raw = body.file.replace(/^data:audio\/[^;]+;base64,/, '');
            audioData = Uint8Array.from(atob(raw), ch => ch.charCodeAt(0)).buffer;
        }
    }

    const resolved = resolveModel(modelSlug, c);
    if ('error' in resolved) return resolved.error;
    const { model, ai } = resolved;

    if (!audioData) {
        return c.json({ error: { message: 'No audio data provided', type: 'invalid_request_error', code: 'missing_field' } }, 400);
    }

    try {
        const result = await ai.run(model.model_id, { audio: [...new Uint8Array(audioData)] });
        return c.json({
            text: result?.text ?? result?.result ?? JSON.stringify(result),
        });
    } catch (err: any) {
        console.error(`[OpenAI] Transcription error for ${modelSlug}:`, err);
        return c.json({ error: { message: err.message || 'Transcription failed', type: 'server_error', code: 'inference_error' } }, 500);
    }
});


// =============================================================================
// POST /v1/audio/speech — Text-to-speech (OpenAI format)
// =============================================================================

openaiRoute.post('/audio/speech', async (c) => {
    let body: any;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: { message: 'Invalid JSON body', type: 'invalid_request_error', code: 'invalid_json' } }, 400);
    }

    const resolved = resolveModel(body.model, c);
    if ('error' in resolved) return resolved.error;
    const { model, ai } = resolved;

    if (!body.input) {
        return c.json({ error: { message: 'Missing required field: input', type: 'invalid_request_error', code: 'missing_field' } }, 400);
    }

    const payload: any = { text: body.input };
    if (body.voice) payload.voice = body.voice;
    if (body.speed) payload.speed = body.speed;
    mergeDefaults(payload, model);

    try {
        const result = await ai.run(model.model_id, payload);

        // Workers AI TTS returns audio bytes
        if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
            const format = body.response_format || 'mp3';
            const mimeMap: Record<string, string> = {
                mp3: 'audio/mpeg', opus: 'audio/opus', aac: 'audio/aac',
                flac: 'audio/flac', wav: 'audio/wav', pcm: 'audio/pcm',
            };
            const audioBuffer = result instanceof Uint8Array ? result.buffer : result;
            return new Response(audioBuffer as ArrayBuffer, {
                headers: { 'Content-Type': mimeMap[format] || 'audio/mpeg' },
            });
        }
        return c.json(result);
    } catch (err: any) {
        console.error(`[OpenAI] TTS error for ${body.model}:`, err);
        return c.json({ error: { message: err.message || 'Text-to-speech failed', type: 'server_error', code: 'inference_error' } }, 500);
    }
});


// =============================================================================
// POST /v1/responses — Responses API with reasoning control
// =============================================================================

openaiRoute.post('/responses', async (c) => {
    let body: any;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: { message: 'Invalid JSON body', type: 'invalid_request_error', code: 'invalid_json' } }, 400);
    }

    const resolved = resolveModel(body.model, c);
    if ('error' in resolved) return resolved.error;
    const { model, ai } = resolved;

    if (!body.input) {
        return c.json({ error: { message: 'Missing required field: input', type: 'invalid_request_error', code: 'missing_field' } }, 400);
    }

    // Build CF Workers AI payload — convert Responses API `input` → `messages`
    // CF Workers AI text-generation models expect { messages: [...] }, not { input: ... }
    const messages: Array<{ role: string; content: string }> = [];

    // Add system message from instructions
    if (body.instructions) {
        messages.push({ role: 'system', content: body.instructions });
    }

    // Convert `input` to messages
    if (typeof body.input === 'string') {
        // Simple string input → single user message
        messages.push({ role: 'user', content: body.input });
    } else if (Array.isArray(body.input)) {
        // Array of input items (OpenAI Responses API format)
        for (const item of body.input) {
            if (typeof item === 'string') {
                messages.push({ role: 'user', content: item });
            } else if (item && typeof item === 'object') {
                if (item.type === 'message') {
                    // { type: 'message', role: '...', content: '...' | [...] }
                    const role = item.role || 'user';
                    const content = typeof item.content === 'string'
                        ? item.content
                        : Array.isArray(item.content)
                            ? item.content.map((c: any) => c?.text || c?.content || '').join('')
                            : JSON.stringify(item.content);
                    messages.push({ role, content });
                } else if (item.role && item.content) {
                    // Direct { role, content } objects (n8n often sends this)
                    messages.push({
                        role: item.role,
                        content: typeof item.content === 'string'
                            ? item.content
                            : JSON.stringify(item.content),
                    });
                }
            }
        }
    }

    if (messages.length === 0) {
        return c.json({ error: { message: 'Could not extract messages from input', type: 'invalid_request_error', code: 'invalid_input' } }, 400);
    }

    const payload: any = { messages };
    if (body.reasoning) {
        payload.reasoning = {};
        if (body.reasoning.effort) payload.reasoning.effort = body.reasoning.effort;
        if (body.reasoning.summary) payload.reasoning.summary = body.reasoning.summary;
    }
    if (body.max_tokens != null) payload.max_tokens = body.max_tokens;
    if (body.temperature != null) payload.temperature = body.temperature;
    if (body.tools != null) payload.tools = body.tools;
    mergeDefaults(payload, model);

    try {
        const result = await ai.run(model.model_id, payload);

        // If Workers AI returned a Responses API-shaped object, pass it through
        if (result && typeof result === 'object' && Array.isArray(result.output)) {
            result.model = result.model || model.slug;
            result.id = result.id || `resp-${crypto.randomUUID().slice(0, 12)}`;
            return c.json(result);
        }

        // If Workers AI returned a chat completion object (e.g. Nemotron), transform → Responses API
        if (result && typeof result === 'object' && Array.isArray(result.choices)) {
            const msg = result.choices[0]?.message;
            const content = msg?.content || '';
            const usage = result.usage || {};

            return c.json({
                id: `resp-${(result.id || crypto.randomUUID()).slice(0, 16)}`,
                object: 'response',
                created_at: result.created || Math.floor(Date.now() / 1000),
                model: result.model || model.slug,
                output: [{
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: content }],
                }],
                usage: {
                    input_tokens: usage.prompt_tokens || 0,
                    output_tokens: usage.completion_tokens || 0,
                    total_tokens: usage.total_tokens || 0,
                },
            });
        }

        // Transform Workers AI result → OpenAI Responses API format
        const responseText = typeof result === 'string'
            ? result
            : result?.response ?? result?.output?.[0]?.content?.[0]?.text ?? result?.result ?? JSON.stringify(result);

        return c.json({
            id: `resp-${crypto.randomUUID().slice(0, 12)}`,
            object: 'response',
            created_at: Math.floor(Date.now() / 1000),
            model: model.slug,
            output: [{
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: responseText }],
            }],
            usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        });
    } catch (err: any) {
        console.error(`[OpenAI] Responses API error for ${body.model}:`, err);
        return c.json({ error: { message: err.message || 'Response generation failed', type: 'server_error', code: 'inference_error' } }, 500);
    }
});


export { openaiRoute };
