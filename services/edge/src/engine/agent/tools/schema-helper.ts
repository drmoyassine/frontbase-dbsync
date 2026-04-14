/**
 * Raw JSON Schema helper for AI SDK tools.
 * 
 * Works around the Zod dual-package hazard where @ai-sdk/openai's
 * internal Zod instance doesn't recognize our Zod objects, causing
 * tool parameter schemas to be serialized as empty `{properties: {}}`.
 * 
 * By providing raw JSON schemas via `jsonSchema()`, we bypass Zod
 * entirely and guarantee correct serialization.
 */

import { jsonSchema } from 'ai';

/**
 * Create a JSON schema object for use with AI SDK `tool()`.
 * These are passed directly to the provider without Zod translation.
 */
export function objectSchema(properties: Record<string, any>, required?: string[]) {
    return jsonSchema({
        type: 'object' as const,
        properties,
        required: required || Object.keys(properties),
        additionalProperties: false,
    });
}

/** Common property schemas */
export const S = {
    string: (desc: string) => ({ type: 'string' as const, description: desc }),
    number: (desc: string) => ({ type: 'number' as const, description: desc }),
    boolean: (desc: string) => ({ type: 'boolean' as const, description: desc }),
    record: (desc: string) => ({ type: 'object' as const, description: desc, additionalProperties: true }),
    array: (desc: string, items?: any) => ({ type: 'array' as const, description: desc, ...(items ? { items } : {}) }),
    optional: {
        string: (desc: string) => ({ type: 'string' as const, description: desc }),
        number: (desc: string) => ({ type: 'number' as const, description: desc }),
    }
};
