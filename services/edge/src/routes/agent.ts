import { OpenAPIHono } from '@hono/zod-openapi';
import { generateText, streamText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { getAgentProfilesConfig } from '../config/env.js';
import { getGPUModels, getAIBinding } from './ai.js';
import { buildAgentSystemPrompt } from '../engine/agent/prompts.js';
import { buildAgentTools } from '../engine/agent/tools.js';

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

// POST /api/agent/chat/:profileSlug
// Core Inference Loop
agentRoute.post('/chat/:profileSlug', async (c) => {
    const profileSlug = c.req.param('profileSlug');
    const profilesConfig = getAgentProfilesConfig();
    
    // 1. Hydrate the Identity target
    const profile = profilesConfig[profileSlug];
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
    const models = getGPUModels();
    
    if (!targetModelSlug && models.length > 0) {
        // Fallback to highest priority chat model
        const chatModels = models.filter(m => m.model_type === 'chat-completion' || m.model_type === 'text-generation');
        targetModelSlug = chatModels.length > 0 ? chatModels[0].slug : models[0].slug;
    }

    const modelRecord = models.find(m => m.slug === targetModelSlug);
    if (!modelRecord) {
        return c.json({ error: { message: `GPU Model '${targetModelSlug}' not assigned to this engine.` } }, 404);
    }

    const ai = getAIBinding();
    if (!ai) {
        return c.json({ error: { message: 'AI binding not available on this engine.' } }, 503);
    }

    const workersai = createWorkersAI({ binding: ai });
    
    // 3. Assemble sandbox and tooling
    const systemPrompt = buildAgentSystemPrompt(profile);
    const tools = buildAgentTools(profile);

    // Vercel SDK assumes System is provided via `system:` param.
    // Ensure we handle user 'system' injection safely, or bypass them.
    const userMessages = convertOpenAIMessages(messages.filter(m => m.role !== 'system'));

    try {
        if (body.stream) {
            const result = await streamText({
                model: workersai(modelRecord.model_id),
                system: systemPrompt,
                messages: userMessages,
                tools,
            });
            
            return result.toTextStreamResponse();
        } else {
            const result = await generateText({
                model: workersai(modelRecord.model_id),
                system: systemPrompt,
                messages: userMessages,
                tools,
            });

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
