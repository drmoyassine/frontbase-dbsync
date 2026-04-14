import { tool } from 'ai';
import { z, type ZodTypeAny } from 'zod';
import type { AgentProfile } from '../../config/env.js';
import { liteApp } from '../lite.js';
import { objectSchema } from './tools/schema-helper.js';

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

/**
 * Build auto-registered tools from the engine's OpenAPI spec.
 * 
 * Hardening features:
 *   - Tag-based permission gating: checks profile.permissions['api.<tag>'].
 *     Falls back to 'api.all'. Deny-by-default if neither exists.
 *   - Tool count cap: maxAutoTools (default 50) prevents context window bloat.
 *   - Dedup guard: skips tools whose name collides with curated Tier 2/3/4 tools.
 */
export async function buildAutoTools(
    profile: AgentProfile,
    curatedNames?: Set<string>,
) {
    // Return cached tools if available and exclusion list matches
    const excluded = profile.excludedEndpoints || [];
    const excludedKey = excluded.sort().join(',');
    if (_cachedTools && excludedKey === _cachedExcluded.join(',')) {
        // Still apply dedup filter against curated names (they may change per-call)
        if (curatedNames && curatedNames.size > 0) {
            const filtered: Record<string, any> = {};
            for (const [name, t] of Object.entries(_cachedTools)) {
                if (!curatedNames.has(name)) filtered[name] = t;
            }
            return filtered;
        }
        return { ..._cachedTools };
    }

    const maxAutoTools = profile.maxAutoTools ?? 50;
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
            // Bail early if we've hit the cap
            if (Object.keys(tools).length >= maxAutoTools) {
                console.warn(`[AutoTools] Tool cap reached (${maxAutoTools}). Skipping remaining endpoints.`);
                break;
            }

            for (const [method, operation] of Object.entries(methods as any)) {
                if (Object.keys(tools).length >= maxAutoTools) break;

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

                // ── Dedup guard: curated tools always win ──
                if (curatedNames && curatedNames.has(toolName)) {
                    continue;
                }

                // ── Tag-based permission gating (deny-by-default) ──
                const tagPerms = profile.permissions?.[`api.${tag}`]
                              || profile.permissions?.['api.all']
                              || [];
                if (!tagPerms.includes('execute') && !tagPerms.includes('all')) {
                    continue;
                }

                // Gather schema info
                const reqBodySchema = op.requestBody?.content?.['application/json']?.schema;
                const queryParams = (op.parameters || []).filter((p: any) => p.in === 'query');
                const pathParams = (op.parameters || []).filter((p: any) => p.in === 'path');

                // Build raw JSON Schema for tool parameters
                const properties: Record<string, any> = {};
                const required: string[] = [];

                // Map path parameters
                for (const p of pathParams) {
                    properties[p.name] = { 
                        type: 'string', 
                        description: p.description || `Path param: ${p.name}` 
                    };
                    if (p.required) required.push(p.name);
                }

                // Map query parameters
                for (const p of queryParams) {
                    let pType = p.schema ? { ...p.schema } : { type: 'string' };
                    if (p.description) pType.description = p.description;
                    properties[p.name] = pType;
                    if (p.required) required.push(p.name);
                }

                // Map JSON body
                if (reqBodySchema) {
                    properties['body'] = {
                        ...reqBodySchema,
                        description: 'JSON request body'
                    };
                    // Body is typically required if schema is provided
                    required.push('body');
                }

                // Detailed description
                let desc = op.summary || `Execute ${method.toUpperCase()} ${path}`;
                if (op.description) desc += `\n${op.description}`;

                try {
                    if (Object.keys(properties).length === 0) {
                        properties['_request'] = { type: 'string', description: 'Not used, pass empty string' };
                    }
                    
                    tools[toolName] = tool({
                        description: desc,
                        parameters: objectSchema(properties, required.length > 0 ? required : undefined),
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
