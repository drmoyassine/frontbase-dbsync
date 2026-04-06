import { tool } from 'ai';
import { z, type ZodTypeAny } from 'zod';
import type { AgentProfile } from '../../config/env.js';
import { liteApp } from '../lite.js';

// =============================================================================
// Module-level tool cache (invalidated on config hot-reload)
// =============================================================================

let _cachedTools: Record<string, any> | null = null;
let _cachedExcluded: string[] = [];

/** Reset the auto-tool cache (called from config.ts on hot-reload) */
export function invalidateAutoToolCache(): void {
    _cachedTools = null;
    _cachedExcluded = [];
}

// =============================================================================
// JSON Schema → Zod conversion (produces typed schemas for LLM guidance)
// =============================================================================

/**
 * Convert a JSON Schema property to a Zod type.
 * Handles: string, number/integer, boolean, array, object, enum.
 * Falls back to z.any() for unknown/complex types.
 */
function jsonSchemaToZod(schema: any): ZodTypeAny {
    if (!schema || typeof schema !== 'object') return z.any();

    // Enum
    if (schema.enum && Array.isArray(schema.enum)) {
        if (schema.enum.length === 0) return z.string();
        if (schema.enum.every((v: any) => typeof v === 'string')) {
            return z.enum(schema.enum as [string, ...string[]]);
        }
        return z.any();
    }

    // Handle oneOf / anyOf by taking the first variant
    if (schema.oneOf || schema.anyOf) {
        const variants = schema.oneOf || schema.anyOf;
        if (Array.isArray(variants) && variants.length > 0) {
            return jsonSchemaToZod(variants[0]).optional();
        }
    }

    const type = schema.type;

    switch (type) {
        case 'string': {
            let s = z.string();
            if (schema.description) s = s.describe(schema.description);
            return s;
        }
        case 'number':
        case 'integer': {
            let n = z.number();
            if (schema.description) n = n.describe(schema.description);
            return n;
        }
        case 'boolean': {
            let b = z.boolean();
            if (schema.description) b = b.describe(schema.description);
            return b;
        }
        case 'array': {
            const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.any();
            let a = z.array(itemSchema);
            if (schema.description) a = a.describe(schema.description);
            return a;
        }
        case 'object': {
            if (schema.properties && typeof schema.properties === 'object') {
                const shape: Record<string, ZodTypeAny> = {};
                const required = new Set<string>(schema.required || []);
                for (const [key, propSchema] of Object.entries(schema.properties)) {
                    let zodProp = jsonSchemaToZod(propSchema as any);
                    if (!required.has(key)) {
                        zodProp = zodProp.optional();
                    }
                    shape[key] = zodProp;
                }
                return z.object(shape);
            }
            // Object without properties → record
            return z.record(z.any());
        }
        default:
            return z.any();
    }
}

// =============================================================================
// Response truncation (prevents context window bloat)
// =============================================================================

const MAX_RESPONSE_CHARS = 4096;

function truncateResponse(data: any): any {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    if (str.length <= MAX_RESPONSE_CHARS) return data;

    // Return truncated version with flag
    const truncated = str.slice(0, MAX_RESPONSE_CHARS);
    try {
        return { _truncated: true, _originalLength: str.length, data: JSON.parse(truncated + '"}') };
    } catch {
        return { _truncated: true, _originalLength: str.length, preview: truncated + '...' };
    }
}

// =============================================================================
// Auto-registration from OpenAPI spec
// =============================================================================

export async function buildAutoTools(profile: AgentProfile) {
    // Return cached tools if available and exclusion list matches
    const excluded = profile.excludedEndpoints || [];
    const excludedKey = excluded.sort().join(',');
    if (_cachedTools && excludedKey === _cachedExcluded.join(',')) {
        return { ..._cachedTools };
    }

    const tools: Record<string, any> = {};

    try {
        // Fetch the OpenAPI spec via local app request (no network)
        const req = new Request('http://localhost/api/openapi.json');
        const res = await liteApp.request(req);
        if (!res.ok) {
            console.warn('[AutoTools] Failed to fetch openapi.json');
            return tools;
        }

        const spec: any = await res.json();

        for (const [path, methods] of Object.entries(spec.paths || {})) {
            for (const [method, operation] of Object.entries(methods as any)) {
                const op = operation as any;
                let operationId = op.operationId;
                if (!operationId) {
                    operationId = `${method}_${path.replace(/[^a-zA-Z0-9_]/g, '_')}`.replace(/_+/g, '_').replace(/^_|_$/g, '');
                }
                
                // Skip if it's explicitly excluded
                if (excluded.includes(operationId)) {
                    continue;
                }

                // Category prefix from OpenAPI tags
                const tag = (op.tags && op.tags[0]) ? op.tags[0].toLowerCase().replace(/\s+/g, '_') : 'api';
                const toolName = `${tag}_${operationId}`;

                // Gather schema info
                const reqBodySchema = op.requestBody?.content?.['application/json']?.schema;
                const queryParams = (op.parameters || []).filter((p: any) => p.in === 'query');
                const pathParams = (op.parameters || []).filter((p: any) => p.in === 'path');

                // Build typed Zod schema from parameters and body
                const paramShape: Record<string, ZodTypeAny> = {};

                // Map path parameters
                for (const p of pathParams) {
                    paramShape[p.name] = p.required
                        ? z.string().describe(p.description || `Path param: ${p.name}`)
                        : z.string().optional().describe(p.description || p.name);
                }

                // Map query parameters with proper types
                for (const p of queryParams) {
                    let paramZod: ZodTypeAny;
                    if (p.schema) {
                        paramZod = jsonSchemaToZod(p.schema);
                    } else {
                        paramZod = z.string();
                    }
                    if (p.description) paramZod = paramZod.describe(p.description);
                    paramShape[p.name] = p.required ? paramZod : paramZod.optional();
                }

                // Map JSON body with typed schema
                if (reqBodySchema) {
                    const bodyZod = jsonSchemaToZod(reqBodySchema);
                    paramShape['body'] = bodyZod.describe('JSON request body');
                }

                // Detailed description
                let desc = op.summary || `Execute ${method.toUpperCase()} ${path}`;
                if (op.description) desc += `\n${op.description}`;

                try {
                    tools[toolName] = tool({
                        description: desc,
                        parameters: z.object(paramShape),
                        execute: async (args: any) => {
                            let actualPath = path;
                            
                            // Replace path params
                            for (const p of pathParams) {
                                if (args[p.name]) {
                                    actualPath = actualPath.replace(`{${p.name}}`, encodeURIComponent(args[p.name]));
                                }
                            }

                            // Build query string
                            const urlObj = new URL(`http://localhost${actualPath}`);
                            for (const p of queryParams) {
                                if (args[p.name] != null) {
                                    urlObj.searchParams.append(p.name, String(args[p.name]));
                                }
                            }

                            // Create internal request
                            const init: RequestInit = {
                                method: method.toUpperCase(),
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-api-key': profile.apiKey || '',
                                },
                            };
                            
                            if (reqBodySchema && args.body) {
                                init.body = JSON.stringify(args.body);
                            }

                            const internalReq = new Request(urlObj.toString(), init);
                            try {
                                const result = await liteApp.request(internalReq);
                                const text = await result.text();
                                try {
                                    return truncateResponse(JSON.parse(text));
                                } catch {
                                    return truncateResponse({ text });
                                }
                            } catch (e: any) {
                                return { error: `Internal execution failed: ${e.message}` };
                            }
                        }
                    } as any);
                } catch { /* ignore schema build errors */ }
            }
        }

        // Cache the tools
        _cachedTools = { ...tools };
        _cachedExcluded = [...excluded].sort();

    } catch (e: any) {
        console.error('[AutoTools] Error building tools:', e.message);
    }

    return tools;
}
