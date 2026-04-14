import { OpenAPIHono } from '@hono/zod-openapi';
import { verify } from 'hono/jwt';
import { generateText, streamText } from 'ai';
import { createModelInstance } from '../engine/model-factory.js';
import { getAgentProfilesConfig } from '../config/env.js';
import { getGPUModels, getAIBinding } from './ai.js';
import { buildAgentSystemPrompt } from '../engine/agent/prompts.js';
import { buildAgentTools } from '../engine/agent/tools.js';
import { getStateProvider } from '../storage/index.js';
import { cacheProvider } from '../cache/index.js';

export const agentRoute = new OpenAPIHono();

/**
 * Convert OpenAI-format messages to AI SDK format for multimodal vision.
 * (Identical to openai.ts conversion helper)
 */
function convertOpenAIMessages(messages: any[]): any[] {
    if (!Array.isArray(messages)) return messages;
    return messages.map(msg => {
        if (!msg || typeof msg !== 'object') return msg;
        if (!Array.isArray(msg.content)) return msg;
        
        const convertedContent = msg.content.map((part: any) => {
            if (!part || typeof part !== 'object') return part;
            
            if (part.type === 'image_url' && part.image_url) {
                const url = typeof part.image_url === 'string' ? part.image_url : part.image_url.url;
                if (!url) return part;
                return { type: 'image', image: url };
            }
            
            if (part.type === 'input_image' && part.image_url) {
                const url = typeof part.image_url === 'string' ? part.image_url : part.image_url.url;
                return { type: 'image', image: url };
            }
            return part; // keep text parts untouched
        });
        
        return { ...msg, content: convertedContent };
    });
}


// GET /api/agent/chat/:profileSlug
// Fetch session history
agentRoute.get('/chat/:profileSlug', async (c) => {
    const profileSlug = c.req.param('profileSlug');
    try {
        const history = await cacheProvider.get<any[]>(`agent:session:${profileSlug}`);
        return c.json(history || []);
    } catch (e: any) {
        console.error('[Agent Chat] Failed to fetch history:', e);
        return c.json([]);
    }
});

// Helper to auto-vivify the master admin workspace agent
function getOrSynthesizeProfile(profileSlug: string, profilesConfig: any) {
    let profile = profilesConfig[profileSlug];
    if (!profile && profileSlug === 'workspace-agent') {
        profile = {
            name: 'Workspace Master Agent',
            systemPrompt: 'You are the Master Admin\'s Workspace Agent. You have full, unrestricted access to the Frontbase Edge Engine and all its connected workloads, datasources, and runtime variables. You act as an expert developer assistant.',
            permissions: {
                'pages.all': ['all'],
                'datasources.all': ['all'],
                'workflows.all': ['all'],
                'engine.all': ['all'],
                'stateDb': ['all']
            }
        };
    }
    return profile;
}

// GET /api/agent/status/:profileSlug
// Check if edge engine is configured correctly with models
agentRoute.get('/status/:profileSlug', async (c) => {
    const profileSlug = c.req.param('profileSlug');
    const profilesConfig = getAgentProfilesConfig();
    const profile = getOrSynthesizeProfile(profileSlug, profilesConfig);
    if (!profile) return c.json({ hasProfile: false, hasModels: false });
    
    try {
        const models = getGPUModels();
        return c.json({ hasProfile: true, hasModels: models.length > 0 });
    } catch {
        return c.json({ hasProfile: true, hasModels: false });
    }
});

// POST /api/agent/chat/:profileSlug
// Core Inference Loop
agentRoute.post('/chat/:profileSlug', async (c) => {
    const profileSlug = c.req.param('profileSlug');
    const profilesConfig = getAgentProfilesConfig();
    
    // 1. Hydrate the Identity target
    const profile = getOrSynthesizeProfile(profileSlug, profilesConfig);
    if (!profile) {
        return c.json({ error: { message: `Agent Profile '${profileSlug}' not deployed on this engine. Check your Edge Inspector.` } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const messages = body.messages || [];
    
    if (!Array.isArray(messages) || messages.length === 0) {
        return c.json({ error: { message: "Missing or invalid 'messages' array" } }, 400);
    }

    // 2. Hardware Allocation (GPU)
    let targetModelSlug = body.model;
    let modelRecord: any = null;
    let ai: any = null;

    // Check for Stateless JWT Injection (Multi-tenant Mega-Shared approach)
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const secret = (c.env as any)?.FRONTBASE_JWT_SECRET || 'supersecret';
            const payload = await verify(token, secret, 'HS256');
            const providerStr = String(payload.provider || 'openai');
            
            modelRecord = {
                 slug: 'workspace-injected-model',
                 provider: providerStr,
                 model_type: 'chat-completion',
                 model_id: providerStr === 'anthropic' ? 'claude-3-5-sonnet-latest' 
                         : providerStr === 'workers_ai' ? '@cf/meta/llama-3.1-8b-instruct'
                         : 'gpt-4o',
                 api_key: ((payload.credentials || {}) as any).api_key || ((payload.credentials || {}) as any).apiKey,
                 base_url: ((payload.credentials || {}) as any).base_url || ((payload.credentials || {}) as any).baseUrl,
                 provider_config: payload.credentials || {},
                 endpoint_url: providerStr === 'openai' ? 'https://api.openai.com/v1/chat/completions' : undefined
            };
        } catch (e) {
            console.error('[Agent Chat] JWT verification failed:', e);
        }
    }

    // Fallback to legacy static engine `.env` models if no JWT is provided or valid
    if (!modelRecord) {
        const models = getGPUModels();
        
        if (!targetModelSlug && models.length > 0) {
            // Fallback to highest priority chat model
            const chatModels = models.filter(m => m.model_type === 'chat-completion' || m.model_type === 'text-generation');
            targetModelSlug = chatModels.length > 0 ? chatModels[0].slug : models[0].slug;
        }

        modelRecord = models.find(m => m.slug === targetModelSlug);
        if (!modelRecord) {
            return c.json({ error: { message: `GPU Model '${targetModelSlug}' not assigned to this engine.` } }, 404);
        }
        
        ai = getAIBinding();
        if (!ai && modelRecord.provider === 'workers_ai') {
            return c.json({ error: { message: 'AI binding not available for workers_ai provider.' } }, 503);
        }
    }

    const sdkModel = createModelInstance(modelRecord, ai);
    
    // 3. Assemble sandbox and tooling
    const tools = await buildAgentTools(profile, getStateProvider());
    const systemPrompt = buildAgentSystemPrompt(profile, tools);

    // Vercel SDK assumes System is provided via `system:` param.
    // Ensure we handle user 'system' injection safely, or bypass them.
    const userMessages = convertOpenAIMessages(messages.filter(m => m.role !== 'system'));

    try {
        if (body.stream) {
            console.log('[DEBUG] Tools:', Object.keys(tools));
            const result = await streamText({
                model: sdkModel,
                system: systemPrompt,
                messages: userMessages,
                tools,
                onFinish: async (event) => {
                    const responseMsgs = event.response?.messages || [];
                    await cacheProvider.setex(`agent:session:${profileSlug}`, 86400 * 7, JSON.stringify([...messages, ...responseMsgs]));
                }
            });
            return result.toTextStreamResponse();
        } else {
            const result = await generateText({
                model: sdkModel,
                system: systemPrompt,
                messages: userMessages,
                tools,
            });

            const responseMsgs = result.response?.messages || [];
            await cacheProvider.setex(`agent:session:${profileSlug}`, 86400 * 7, JSON.stringify([...messages, ...responseMsgs]));

            return c.json({
                success: true,
                message: result.text,
                steps: result.steps
            });
        }
    } catch (e: any) {
        console.error("[Agent Chat] Exception:", e);
        return c.json({ error: { message: e.message || "Failed to generate agent response" } }, 500);
    }
});
