/**
 * OpenAI-Compatible Routes — Vercel AI SDK Edition
 * 
 * POST /v1/chat/completions        — text generation (LLM) via generateText/streamText
 * POST /v1/responses               — responses API with reasoning control via generateText
 * POST /v1/embeddings              — text embeddings via embed/embedMany
 * POST /v1/images/generations      — image generation via generateImage
 * POST /v1/audio/transcriptions    — speech-to-text via transcribe
 * POST /v1/audio/speech            — text-to-speech via speech
 * GET  /v1/models                  — list available models in OpenAI format
 * 
 * All endpoints use the Vercel AI SDK with the workers-ai-provider
 * instead of raw ai.run() calls. This fixes multimodal vision, enables
 * SSE streaming, and provides tool calling support.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { getGPUModels, getAIBinding } from './ai.js';
import {
    generateText,
    streamText,
    embed,
    embedMany,
    generateImage,
    experimental_transcribe as transcribe,
    experimental_generateSpeech as generateSpeech,
} from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { saveAITask, loadAITask, dispatchAITask, clearAITask } from '../engine/ai-tasks.js';
import { buildAgentSystemPrompt } from '../engine/agent/prompts.js';
import { buildAgentTools } from '../engine/agent/tools.js';

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

/**
 * Create a workers-ai-provider instance from the AI binding.
 * Called per-request since the binding may change between adapter setups.
 */
function getWorkersAI(ai: any) {
    return createWorkersAI({ binding: ai });
}

/**
 * Convert OpenAI-format messages to AI SDK format.
 * The key difference: OpenAI uses {type: "image_url", image_url: {url: "..."}}
 * while the SDK expects {type: "image", image: "..."} or {type: "file", data: "...", mimeType: "..."}.
 * This is critical for multimodal vision to work.
 */
function convertOpenAIMessages(messages: any[]): any[] {
    if (!Array.isArray(messages)) return messages;
    return messages.map(msg => {
        if (!msg || typeof msg !== 'object') return msg;
        // Only user messages can have multimodal content arrays
        if (!Array.isArray(msg.content)) return msg;
        
        const convertedContent = msg.content.map((part: any) => {
            if (!part || typeof part !== 'object') return part;
            
            // OpenAI format: {type: "image_url", image_url: {url: "data:image/png;base64,..."}}
            // SDK format:    {type: "image", image: "data:image/png;base64,..."}
            if (part.type === 'image_url' && part.image_url) {
                const url = typeof part.image_url === 'string' ? part.image_url : part.image_url.url;
                if (!url) return part;
                return { type: 'image', image: url };
            }
            
            // OpenAI Responses API format: {type: "input_image", image_url: "data:..."}
            if (part.type === 'input_image' && part.image_url) {
                const url = typeof part.image_url === 'string' ? part.image_url : part.image_url.url;
                return { type: 'image', image: url };
            }
            
            // text parts: OpenAI uses {type: "text", text: "..."} — same as SDK, pass through
            return part;
        });
        
        return { ...msg, content: convertedContent };
    });
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
// Now uses Vercel AI SDK for proper multimodal support + streaming
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

    // Build SDK options from the OpenAI-format request
    const workersai = getWorkersAI(ai);
    const sdkModel = workersai(model.model_id);

    // Merge provider_config defaults into body for params the SDK doesn't directly support
    const mergedBody = { ...body };
    mergeDefaults(mergedBody, model);

    // Convert OpenAI tools format to AI SDK tools format if provided
    // The SDK accepts tools in its own format, but we can pass them via providerOptions
    // for models that support OpenAI-compatible tool calling natively
    const sdkOptions: any = {
        model: sdkModel,
        messages: convertOpenAIMessages(body.messages),
    };

    // ── Agent Profile Overlay ──
    // If this request was routed through /api/agents/:profileSlug, the context is hydrated here
    const profile = (c as any).get ? (c as any).get('agentProfile') : (c as any).var?.agentProfile;
    if (profile) {
        sdkOptions.system = buildAgentSystemPrompt(profile);
        sdkOptions.tools = await buildAgentTools(profile);
        // Vercel SDK places System prompt separate, drop them from message history to prevent conflicts
        sdkOptions.messages = sdkOptions.messages.filter((m: any) => m.role !== 'system');
        // Agents generally rely on recursive loop limits. If max_steps is unspecified by user, default to 5.
        if (mergedBody.max_steps == null && mergedBody.maxSteps == null) {
            mergedBody.max_steps = 5;
        }
    }

    if (mergedBody.max_tokens != null) sdkOptions.maxOutputTokens = mergedBody.max_tokens;
    if (mergedBody.temperature != null) sdkOptions.temperature = mergedBody.temperature;
    if (mergedBody.top_p != null) sdkOptions.topP = mergedBody.top_p;
    if (mergedBody.top_k != null) sdkOptions.topK = mergedBody.top_k;
    if (mergedBody.stop != null) sdkOptions.stopSequences = Array.isArray(mergedBody.stop) ? mergedBody.stop : [mergedBody.stop];
    if (mergedBody.seed != null) sdkOptions.seed = mergedBody.seed;
    if (mergedBody.frequency_penalty != null) sdkOptions.frequencyPenalty = mergedBody.frequency_penalty;
    if (mergedBody.presence_penalty != null) sdkOptions.presencePenalty = mergedBody.presence_penalty;

    // Pass Workers AI-specific params via providerOptions 
    const workerSpecific: Record<string, any> = {};
    if (mergedBody.repetition_penalty != null) workerSpecific.repetitionPenalty = mergedBody.repetition_penalty;
    if (mergedBody.raw != null) workerSpecific.raw = mergedBody.raw;
    if (mergedBody.lora != null) workerSpecific.lora = mergedBody.lora;
    if (mergedBody.response_format != null) workerSpecific.response_format = mergedBody.response_format;
    if (Object.keys(workerSpecific).length > 0) {
        sdkOptions.providerOptions = { 'workers-ai': workerSpecific };
    }

    // ── Durable Async Path (Background Agent/Loop) ──
    const maxSteps = mergedBody.max_steps || mergedBody.maxSteps || 1;
    if (maxSteps > 1 && !body.stream) {
        const taskId = `chatcmpl-${crypto.randomUUID().slice(0, 12)}`;
        const saved = await saveAITask({
            id: taskId,
            model: model.slug,
            messages: sdkOptions.messages,
            tools: sdkOptions.tools,
            maxSteps,
            currentStep: 0,
            status: 'pending',
            options: sdkOptions,
            result: null
        });

        const dispatched = saved ? await dispatchAITask(taskId) : false;
        
        if (saved && dispatched) {
            return c.json({
                id: taskId,
                object: 'chat.completion.async',
                status: 'pending',
                message: 'Task successfully queued for asynchronous processing. Poll /v1/chat/completions/{id} for result.'
            }, 202);
        } else {
            // Queue or Cache unavailable, gracefully fallback into sync execution using Vercel AI SDK 'maxSteps'
            sdkOptions.maxSteps = maxSteps;
        }
    }

    try {
        // ── Streaming path ──
        if (body.stream) {
            const result = streamText(sdkOptions);

            // Return SSE stream with proper headers for Cloudflare Workers
            return result.toTextStreamResponse({
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'content-encoding': 'identity',
                    'transfer-encoding': 'chunked',
                },
            });
        }

        // ── Synchronous path ──
        const result = await generateText(sdkOptions);

        // Build tool_calls array if the model returned tool calls
        const toolCalls = result.toolCalls && result.toolCalls.length > 0
            ? result.toolCalls.map((tc: any, i: number) => ({
                id: tc.toolCallId || `call_${crypto.randomUUID().slice(0, 12)}`,
                type: 'function',
                function: {
                    name: tc.toolName,
                    arguments: JSON.stringify(tc.args),
                },
            }))
            : undefined;

        const finishReason = result.finishReason === 'tool-calls' ? 'tool_calls'
            : result.finishReason === 'length' ? 'length'
            : result.finishReason === 'content-filter' ? 'content_filter'
            : 'stop';

        return c.json({
            id: `chatcmpl-${crypto.randomUUID().slice(0, 12)}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model.slug,
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: result.text || null,
                    ...(toolCalls ? { tool_calls: toolCalls } : {}),
                },
                finish_reason: finishReason,
            }],
            usage: {
                prompt_tokens: result.usage?.inputTokens ?? 0,
                completion_tokens: result.usage?.outputTokens ?? 0,
                total_tokens: result.usage?.totalTokens ?? 0,
            },
        });
    } catch (err: any) {
        console.error(`[OpenAI] Inference error for ${body.model}:`, err);
        return c.json({ error: { message: err.message || 'Inference failed', type: 'server_error', code: 'inference_error' } }, 500);
    }
});


// =============================================================================
// GET /v1/chat/completions/:taskId — Poll async completion status
// =============================================================================

openaiRoute.get('/chat/completions/:id', async (c) => {
    const id = c.req.param('id');
    const task = await loadAITask(id);
    
    if (!task) {
        return c.json({ error: { message: 'Task not found or expired', type: 'invalid_request_error', code: 'not_found' } }, 404);
    }
    
    if (task.status === 'pending') {
        return c.json({
            id: task.id,
            object: 'chat.completion.async',
            status: 'pending',
            current_step: task.currentStep,
            max_steps: task.maxSteps
        }, 202);
    }
    
    if (task.status === 'failed') {
        return c.json({
            id: task.id,
            object: 'chat.completion.async',
            status: 'failed',
            error: task.error || 'Unknown execution error'
        }, 500);
    }
    
    // Status is 'completed' - return exactly as standard OpenAI format dictates
    return c.json(task.result);
});


// =============================================================================
// POST /v1/chat/completions/continue — Internal queue trigger for async tasks
// =============================================================================

openaiRoute.post('/chat/completions/continue', async (c) => {
    let body: any;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: { message: 'Invalid JSON body' } }, 400);
    }
    
    // Support QStash / CF webhook structure where body.parameters contains taskId
    const taskId = body.taskId || body.parameters?.taskId;
    if (!taskId) {
        return c.json({ error: { message: 'Missing taskId' } }, 400);
    }

    const task = await loadAITask(taskId);
    if (!task || task.status !== 'pending') {
        return c.json({ status: 'ignored', message: 'Task not pending or not found' });
    }

    // Attempt the execution chunk. Right now we execute until completion or timeout.
    // In Frontbase Edge engine, Vercel AI SDK handles tool loops efficiently,
    // so we execute here asynchronously. Memory states are useful if we add wait-for-human loops later.
    try {
        const resolved = resolveModel(task.model, c);
        if ('error' in resolved) return resolved.error;
        const { model, ai } = resolved;
        
        const workersai = getWorkersAI(ai);
        const sdkModel = workersai(model.model_id);
        
        const sdkOptions: any = { ...task.options, model: sdkModel, messages: task.messages, maxSteps: task.maxSteps };
        
        // Always rebuild tools for the pending execution since functions do not serialize to task DB
        const profile = (c as any).get ? (c as any).get('agentProfile') : (c as any).var?.agentProfile;
        if (profile) {
            sdkOptions.tools = await buildAgentTools(profile);
        }
        
        const result = await generateText(sdkOptions);
        
        // Build final OpenAI-compatible result
        const toolCalls = result.toolCalls && result.toolCalls.length > 0
            ? result.toolCalls.map((tc: any, i: number) => ({
                id: tc.toolCallId || `call_${crypto.randomUUID().slice(0, 12)}`,
                type: 'function',
                function: { name: tc.toolName, arguments: JSON.stringify(tc.args) },
            })) : undefined;

        const finishReason = result.finishReason === 'tool-calls' ? 'tool_calls'
            : result.finishReason === 'length' ? 'length'
            : result.finishReason === 'content-filter' ? 'content_filter' : 'stop';

        const finalOutput = {
            id: task.id, // Reuse task ID so polling matches
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model.slug,
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: result.text || null,
                    ...(toolCalls ? { tool_calls: toolCalls } : {}),
                },
                finish_reason: finishReason,
            }],
            usage: {
                prompt_tokens: result.usage?.inputTokens ?? 0,
                completion_tokens: result.usage?.outputTokens ?? 0,
                total_tokens: result.usage?.totalTokens ?? 0,
            },
        };

        task.result = finalOutput;
        task.status = 'completed';
        
        // Save terminal state, wait for client to poll it
        await saveAITask(task);
        
        return c.json({ status: 'completed' });
    } catch (err: any) {
        console.error(`[Queue] Task ${taskId} failed:`, err);
        task.status = 'failed';
        task.error = err.message;
        await saveAITask(task);
        return c.json({ status: 'failed', error: err.message }, 500);
    }
});


// =============================================================================
// POST /v1/embeddings — Text embeddings (OpenAI format)
// Now uses Vercel AI SDK embed/embedMany
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

    const workersai = getWorkersAI(ai);
    const embeddingModel = workersai.textEmbedding(model.model_id);

    try {
        const inputs = Array.isArray(body.input) ? body.input : [body.input];

        const result = await embedMany({
            model: embeddingModel,
            values: inputs,
        });

        const data = result.embeddings.map((emb: number[], i: number) => ({
            object: 'embedding',
            embedding: emb,
            index: i,
        }));

        return c.json({
            object: 'list',
            data,
            model: model.slug,
            usage: {
                prompt_tokens: result.usage?.tokens ?? 0,
                total_tokens: result.usage?.tokens ?? 0,
            },
        });
    } catch (err: any) {
        console.error(`[OpenAI] Embedding error for ${body.model}:`, err);
        return c.json({ error: { message: err.message || 'Embedding failed', type: 'server_error', code: 'inference_error' } }, 500);
    }
});


// =============================================================================
// POST /v1/images/generations — Image generation (OpenAI format)
// Now uses Vercel AI SDK generateImage
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

    const workersai = getWorkersAI(ai);

    try {
        const imageOptions: any = {
            model: workersai.image(model.model_id),
            prompt: body.prompt,
            n: body.n || 1,
        };
        if (body.size) imageOptions.size = body.size;

        const result = await generateImage(imageOptions);

        const responseFormat = body.response_format || 'b64_json';

        // generateImage returns { images: [...] } with .base64 and .uint8Array accessors
        const imageData = result.images.map((img: any) => ({
            ...(responseFormat === 'b64_json'
                ? { b64_json: img.base64 }
                : { url: `data:image/png;base64,${img.base64}` }),
            revised_prompt: body.prompt,
        }));

        return c.json({
            created: Math.floor(Date.now() / 1000),
            data: imageData,
        });
    } catch (err: any) {
        console.error(`[OpenAI] Image generation error for ${body.model}:`, err);
        return c.json({ error: { message: err.message || 'Image generation failed', type: 'server_error', code: 'inference_error' } }, 500);
    }
});


// =============================================================================
// POST /v1/audio/transcriptions — Speech-to-text (OpenAI format)
// Now uses Vercel AI SDK transcribe
// =============================================================================

openaiRoute.post('/audio/transcriptions', async (c) => {
    // Accepts multipart/form-data (OpenAI standard) or JSON with base64 audio
    let modelSlug: string | undefined;
    let audioData: Uint8Array | null = null;
    let mimeType: string = 'audio/wav';

    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
        const formData = await c.req.formData();
        const file = formData.get('file') as File | null;
        modelSlug = formData.get('model') as string | undefined;
        if (!file) {
            return c.json({ error: { message: 'Missing required field: file', type: 'invalid_request_error', code: 'missing_field' } }, 400);
        }
        audioData = new Uint8Array(await file.arrayBuffer());
        mimeType = file.type || 'audio/wav';
    } else {
        let body: any;
        try { body = await c.req.json(); } catch {
            return c.json({ error: { message: 'Invalid request body', type: 'invalid_request_error', code: 'invalid_body' } }, 400);
        }
        modelSlug = body.model;
        if (body.file) {
            const raw = body.file.replace(/^data:audio\/[^;]+;base64,/, '');
            audioData = Uint8Array.from(atob(raw), ch => ch.charCodeAt(0));
            // Try to extract mime from data URI
            const mimeMatch = body.file.match(/^data:(audio\/[^;]+);base64,/);
            if (mimeMatch) mimeType = mimeMatch[1];
        }
    }

    const resolved = resolveModel(modelSlug, c);
    if ('error' in resolved) return resolved.error;
    const { model, ai } = resolved;

    if (!audioData) {
        return c.json({ error: { message: 'No audio data provided', type: 'invalid_request_error', code: 'missing_field' } }, 400);
    }

    // Check if SDK transcribe is available; fall back to raw ai.run() if not
    if (!transcribe) {
        try {
            const result = await ai.run(model.model_id, { audio: [...audioData] });
            return c.json({
                text: result?.text ?? result?.result ?? JSON.stringify(result),
            });
        } catch (err: any) {
            console.error(`[OpenAI] Transcription error for ${modelSlug}:`, err);
            return c.json({ error: { message: err.message || 'Transcription failed', type: 'server_error', code: 'inference_error' } }, 500);
        }
    }

    const workersai = getWorkersAI(ai);

    try {
        const transcript = await transcribe({
            model: workersai.transcription(model.model_id),
            audio: audioData,
        });

        return c.json({
            text: transcript.text,
            ...(transcript.segments ? { segments: transcript.segments } : {}),
            ...(transcript.language ? { language: transcript.language } : {}),
            ...(transcript.durationInSeconds ? { duration: transcript.durationInSeconds } : {}),
        });
    } catch (err: any) {
        console.error(`[OpenAI] Transcription error for ${modelSlug}:`, err);
        return c.json({ error: { message: err.message || 'Transcription failed', type: 'server_error', code: 'inference_error' } }, 500);
    }
});


// =============================================================================
// POST /v1/audio/speech — Text-to-speech (OpenAI format)
// Now uses Vercel AI SDK speech
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

    const mimeMap: Record<string, string> = {
        mp3: 'audio/mpeg', opus: 'audio/opus', aac: 'audio/aac',
        flac: 'audio/flac', wav: 'audio/wav', pcm: 'audio/pcm',
    };
    const format = body.response_format || 'mp3';

    // Check if SDK generateSpeech is available; fall back to raw ai.run() if not
    if (!generateSpeech) {
        const payload: any = { text: body.input };
        if (body.voice) payload.voice = body.voice;
        if (body.speed) payload.speed = body.speed;
        mergeDefaults(payload, model);

        try {
            const result = await ai.run(model.model_id, payload);
            if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
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
    }

    const workersai = getWorkersAI(ai);

    try {
        const result = await generateSpeech({
            model: workersai.speech(model.model_id),
            text: body.input,
            ...(body.voice ? { voice: body.voice } : {}),
        });

        // result.audio contains uint8Array and base64 accessors
        const audioBytes = result.audio.uint8Array;
        return new Response(audioBytes.buffer.slice(audioBytes.byteOffset, audioBytes.byteOffset + audioBytes.byteLength) as ArrayBuffer, {
            headers: { 'Content-Type': mimeMap[format] || 'audio/mpeg' },
        });
    } catch (err: any) {
        console.error(`[OpenAI] TTS error for ${body.model}:`, err);
        return c.json({ error: { message: err.message || 'Text-to-speech failed', type: 'server_error', code: 'inference_error' } }, 500);
    }
});


// =============================================================================
// POST /v1/responses — Responses API with reasoning control
// Now uses Vercel AI SDK generateText
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

    // Build messages from Responses API `input` format  
    // Handles multimodal content (images) by converting to SDK format
    const messages: Array<{ role: string; content: any }> = [];

    if (body.instructions) {
        messages.push({ role: 'system', content: body.instructions });
    }

    if (typeof body.input === 'string') {
        messages.push({ role: 'user', content: body.input });
    } else if (Array.isArray(body.input)) {
        for (const item of body.input) {
            if (typeof item === 'string') {
                messages.push({ role: 'user', content: item });
            } else if (item && typeof item === 'object') {
                if (item.type === 'message') {
                    const role = item.role || 'user';
                    if (typeof item.content === 'string') {
                        messages.push({ role, content: item.content });
                    } else if (Array.isArray(item.content)) {
                        // Convert Responses API content parts to SDK format
                        // Preserves images instead of flattening to text
                        const sdkParts = item.content.map((part: any) => {
                            if (part.type === 'input_text' || part.type === 'text') {
                                return { type: 'text', text: part.text || part.content || '' };
                            }
                            if (part.type === 'input_image' || part.type === 'image_url') {
                                const url = part.image_url
                                    ? (typeof part.image_url === 'string' ? part.image_url : part.image_url.url)
                                    : part.url;
                                return { type: 'image', image: url };
                            }
                            // Unknown part type — try to extract text
                            return { type: 'text', text: part.text || part.content || JSON.stringify(part) };
                        });
                        messages.push({ role, content: sdkParts });
                    } else {
                        messages.push({ role, content: JSON.stringify(item.content) });
                    }
                } else if (item.role && item.content) {
                    if (typeof item.content === 'string') {
                        messages.push({ role: item.role, content: item.content });
                    } else if (Array.isArray(item.content)) {
                        // Same multimodal handling for direct {role, content} objects
                        const sdkParts = item.content.map((part: any) => {
                            if (part.type === 'image_url') {
                                const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
                                return { type: 'image', image: url };
                            }
                            return part;
                        });
                        messages.push({ role: item.role, content: sdkParts });
                    } else {
                        messages.push({ role: item.role, content: JSON.stringify(item.content) });
                    }
                }
            }
        }
    }

    if (messages.length === 0) {
        return c.json({ error: { message: 'Could not extract messages from input', type: 'invalid_request_error', code: 'invalid_input' } }, 400);
    }

    const workersai = getWorkersAI(ai);
    const sdkModel = workersai(model.model_id);

    const sdkOptions: any = {
        model: sdkModel,
        messages,
    };

    if (body.max_tokens != null) sdkOptions.maxOutputTokens = body.max_tokens;
    if (body.temperature != null) sdkOptions.temperature = body.temperature;

    // Pass reasoning config via providerOptions
    const workerSpecific: Record<string, any> = {};
    if (body.reasoning) {
        workerSpecific.reasoning = {};
        if (body.reasoning.effort) workerSpecific.reasoning.effort = body.reasoning.effort;
        if (body.reasoning.summary) workerSpecific.reasoning.summary = body.reasoning.summary;
    }
    if (Object.keys(workerSpecific).length > 0) {
        sdkOptions.providerOptions = { 'workers-ai': workerSpecific };
    }

    try {
        const result = await generateText(sdkOptions);

        const responseText = result.text || '';
        const usage = result.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

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
            usage: {
                input_tokens: usage.inputTokens ?? 0,
                output_tokens: usage.outputTokens ?? 0,
                total_tokens: usage.totalTokens ?? 0,
            },
        });
    } catch (err: any) {
        console.error(`[OpenAI] Responses API error for ${body.model}:`, err);
        return c.json({ error: { message: err.message || 'Response generation failed', type: 'server_error', code: 'inference_error' } }, 500);
    }
});


export { openaiRoute };
