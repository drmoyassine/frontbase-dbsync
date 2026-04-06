import { tool } from 'ai';
import { z } from 'zod';
import type { AgentProfile } from '../../config/env.js';
import { liteApp } from '../lite.js'; // Used to dispatch local requests and get OpenAPI spec

export async function buildAutoTools(profile: AgentProfile) {
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
        const excluded = profile.excludedEndpoints || [];

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

                // Gather schema info for LLM to understand what to pass
                const reqBodySchema = op.requestBody?.content?.['application/json']?.schema;
                const queryParams = (op.parameters || []).filter((p: any) => p.in === 'query');
                const pathParams = (op.parameters || []).filter((p: any) => p.in === 'path');

                // We construct a dynamic Zod schema based on parameters and body
                const paramShape: Record<string, any> = {};

                // Map path parameters
                for (const p of pathParams) {
                    paramShape[p.name] = p.required ? z.string().describe(p.description || `Path param: ${p.name}`) : z.string().optional().describe(p.description);
                }

                // Map query parameters
                for (const p of queryParams) {
                    paramShape[p.name] = p.required ? z.string().describe(p.description || `Query param: ${p.name}`) : z.string().optional().describe(p.description);
                }

                // Map JSON body
                if (reqBodySchema) {
                    paramShape['body'] = z.record(z.any()).describe(`JSON Body payload. Schema: ${JSON.stringify(reqBodySchema)}`);
                }

                // Detailed description for the agent
                let desc = op.summary || `Execute ${method.toUpperCase()} ${path}`;
                if (op.description) desc += `\n${op.description}`;

                try {
                    tools[operationId] = tool({
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
                                if (args[p.name]) {
                                    urlObj.searchParams.append(p.name, args[p.name]);
                                }
                            }

                            // Create internal request
                            const init: RequestInit = {
                                method: method.toUpperCase(),
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-api-key': profile.apiKey || '', // Inject Agent's assigned API key
                                }
                            };
                            
                            if (reqBodySchema && args.body) {
                                init.body = JSON.stringify(args.body);
                            }

                            const req = new Request(urlObj.toString(), init);
                            try {
                                const result = await liteApp.request(req);
                                const text = await result.text();
                                try {
                                    return JSON.parse(text); // Try return as JSON object
                                } catch {
                                    return { text }; // Return as text if not JSON
                                }
                            } catch (e: any) {
                                return { error: `Internal execution failed: ${e.message}` };
                            }
                        }
                    } as any);
                } catch { /* ignore typing */ }
            }
        }
    } catch (e: any) {
        console.error('[AutoTools] Error building tools:', e.message);
    }

    return tools;
}
