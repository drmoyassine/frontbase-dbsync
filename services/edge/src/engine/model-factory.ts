/**
 * Universal Model Factory — Provider-agnostic AI SDK model creation.
 * 
 * Creates a Vercel AI SDK LanguageModel instance for any supported provider.
 * The model factory reads the provider, api_key, and base_url from the
 * GPU model registry entry and returns the correct SDK model.
 * 
 * Supported providers:
 *   - workers_ai    → CF Workers AI binding (existing)
 *   - openai        → OpenAI API (@ai-sdk/openai)
 *   - anthropic     → Anthropic API (@ai-sdk/anthropic)
 *   - google        → Google Gemini (@ai-sdk/google)
 *   - ollama        → Local Ollama (via @ai-sdk/openai with custom baseURL)
 *   - openai_compatible → Any OpenAI-compatible API (vLLM, Together, etc.)
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createWorkersAI } from 'workers-ai-provider';
import type { LanguageModel } from 'ai';

interface ModelEntry {
    model_id: string;
    provider: string;
    api_key?: string;
    base_url?: string;
}

/**
 * Create a Vercel AI SDK model instance from a GPU model registry entry.
 * 
 * @param model - The GPU model entry from the registry
 * @param aiBinding - CF Workers AI binding (only needed for workers_ai provider)
 * @returns A Vercel AI SDK LanguageModel ready for generateText/streamText
 */
export function createModelInstance(model: ModelEntry, aiBinding?: any): LanguageModel {
    switch (model.provider) {
        case 'workers_ai': {
            if (!aiBinding) {
                throw new Error('AI binding required for workers_ai provider');
            }
            const workersai = createWorkersAI({ binding: aiBinding });
            return workersai(model.model_id) as LanguageModel;
        }

        case 'openai': {
            if (!model.api_key) {
                throw new Error('API key required for openai provider');
            }
            const openai = createOpenAI({
                apiKey: model.api_key,
                ...(model.base_url ? { baseURL: model.base_url } : {}),
            });
            return openai(model.model_id) as LanguageModel;
        }

        case 'anthropic': {
            if (!model.api_key) {
                throw new Error('API key required for anthropic provider');
            }
            const anthropic = createAnthropic({
                apiKey: model.api_key,
                ...(model.base_url ? { baseURL: model.base_url } : {}),
            });
            return anthropic(model.model_id) as LanguageModel;
        }

        case 'google': {
            if (!model.api_key) {
                throw new Error('API key required for google provider');
            }
            const google = createGoogleGenerativeAI({
                apiKey: model.api_key,
                ...(model.base_url ? { baseURL: model.base_url } : {}),
            });
            return google(model.model_id) as LanguageModel;
        }

        case 'ollama': {
            // Ollama exposes an OpenAI-compatible API
            const ollama = createOpenAI({
                apiKey: model.api_key || 'ollama',  // Ollama doesn't need a real key
                baseURL: model.base_url || 'http://localhost:11434/v1',
            });
            return ollama(model.model_id) as LanguageModel;
        }

        case 'openai_compatible': {
            // Any OpenAI-compatible endpoint (vLLM, Together, LM Studio, etc.)
            if (!model.base_url) {
                throw new Error('base_url required for openai_compatible provider');
            }
            const compatible = createOpenAI({
                apiKey: model.api_key || 'no-key',
                baseURL: model.base_url,
            });
            return compatible(model.model_id) as LanguageModel;
        }

        default:
            throw new Error(`Unsupported AI provider: '${model.provider}'. Supported: workers_ai, openai, anthropic, google, ollama, openai_compatible`);
    }
}
