/**
 * User-Configured Tools Builder (Tier 4)
 * 
 * Reads agent_tools from the state DB and converts them into
 * Vercel AI SDK tools at runtime. Two tool types supported:
 * 
 *   - workflow: Wraps triggerWorkflow with typed parameters
 *   - mcp_server: Connects as MCP client, imports remote tools
 * 
 * AGENTS.md §2.1: Edge Self-Sufficiency — all data from local state DB.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { AgentProfile } from '../../../config/env.js';
import type {
    AgentToolData, WorkflowToolConfig, McpServerToolConfig, ToolParameter,
} from '../../../storage/IStateProvider.js';
import { liteApp } from '../../lite.js';

// =============================================================================
// Parameter → Zod Conversion
// =============================================================================

/**
 * Convert a ToolParameter[] definition to a Zod schema object.
 * This gives the LLM typed guidance for each parameter.
 */
function parametersToZod(params: ToolParameter[]): z.ZodObject<any> {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const param of params) {
        let zodType: z.ZodTypeAny;

        switch (param.type) {
            case 'number':
                zodType = z.number();
                break;
            case 'boolean':
                zodType = z.boolean();
                break;
            case 'array':
                zodType = z.array(z.any());
                break;
            case 'object':
                zodType = z.record(z.string(), z.any());
                break;
            case 'string':
            default:
                if (param.enum && param.enum.length > 0) {
                    zodType = z.enum(param.enum as [string, ...string[]]);
                } else {
                    zodType = z.string();
                }
                break;
        }

        // Add description
        if (param.description) {
            zodType = zodType.describe(param.description);
        }

        // Default value
        if (param.default !== undefined) {
            zodType = zodType.default(param.default);
        }

        // Required vs optional
        if (!param.required) {
            zodType = zodType.optional();
        }

        shape[param.name] = zodType;
    }

    return z.object(shape);
}

// =============================================================================
// Workflow Tool Builder
// =============================================================================

function buildWorkflowTool(
    toolDef: AgentToolData,
    config: WorkflowToolConfig,
    profile: AgentProfile,
): Record<string, any> {
    const schema = config.parameters?.length > 0
        ? parametersToZod(config.parameters)
        : z.object({});

    return {
        [toolDef.name]: tool({
            description: toolDef.description || `Trigger workflow: ${toolDef.name}`,
            parameters: schema,
            execute: async (args: Record<string, any>) => {
                try {
                    const req = new Request(`http://localhost/api/execute/${config.workflowId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': profile.apiKey || '',
                        },
                        body: JSON.stringify({ parameters: args }),
                    });
                    const res = await liteApp.request(req);
                    const data = await res.json();

                    // Truncate large responses to prevent context bloat
                    const json = JSON.stringify(data);
                    if (json.length > 4096) {
                        return { result: JSON.parse(json.substring(0, 4096) + '...'), _truncated: true };
                    }
                    return data;
                } catch (e: any) {
                    return { error: `Workflow execution failed: ${e.message}` };
                }
            },
        } as any),
    };
}

// =============================================================================
// MCP Client Tool Builder (placeholder — requires @modelcontextprotocol/sdk)
// =============================================================================

/**
 * Connect to an external MCP server and import its tools.
 * 
 * Uses the SSEClientTransport to connect, fetch the list of tools,
 * and dynamically create Vercel AI SDK tool() instances that transparently
 * proxy the CallToolRequest format over the transport.
 */
async function buildMcpClientTools(
    toolDef: AgentToolData,
    config: McpServerToolConfig,
): Promise<Record<string, any>> {
    const tools: Record<string, any> = {};
    
    try {
        // Assume default SSE URL if not provided
        const sseUrl = new URL(config.url);
        const transport = new SSEClientTransport(sseUrl, {
            requestInit: { headers: config.headers || {} },
        });

        const client = new Client(
            { name: `frontbase-edge-client`, version: '1.0.0' },
            { capabilities: {} }
        );

        // Connect to the external MCP Server
        await client.connect(transport);

        // Fetch tool list
        const mcpToolsRes = await client.listTools();

        if (mcpToolsRes && Array.isArray(mcpToolsRes.tools)) {
            for (const mTool of mcpToolsRes.tools) {
                // Apply toolFilter if configured
                if (config.toolFilter && config.toolFilter.length > 0) {
                    if (!config.toolFilter.includes(mTool.name)) {
                        continue; // Skip filtered tools
                    }
                }

                // Create the proxy AI SDK tool
                // Using z.any() because the exact schema validation is offloaded to the MCP server
                // but providing the description helps the LLM
                tools[`mcp_${toolDef.name}_${mTool.name}`] = tool({
                    description: `[From ${toolDef.name} MCP]: ${mTool.description || `Tool ${mTool.name}`}`,
                    parameters: z.any(),
                    execute: async (args: any) => {
                        try {
                            const result = await client.callTool({
                                name: mTool.name,
                                arguments: args,
                            });
                            
                            // Transform MCP generic TextContent back to standard JSON
                            const resAny = result as any;
                            if (resAny.content && resAny.content.length > 0) {
                                // Extract first text block
                                const textBlock = resAny.content.find((c: any) => c.type === 'text');
                                if (textBlock) {
                                    try {
                                        return JSON.parse(textBlock.text);
                                    } catch {
                                        return textBlock.text;
                                    }
                                }
                            }
                            return result;
                        } catch (err: any) {
                            return { error: `MCP Tool Execution Failed: ${err.message}` };
                        }
                    }
                } as any);
            }
        }
    } catch (err: any) {
        console.error(`[UserTools] Failed to initialize MCP Client '${toolDef.name}':`, err.message);
        // Graceful degradation: return a status/error tool so the LLM knows it failed
        tools[`mcp_${toolDef.name}_status`] = tool({
            description: `MCP Server '${toolDef.name}' is currently unreachable.`,
            parameters: z.object({}),
            execute: async () => ({
                error: `MCP Connection failed`,
                message: err.message
            }),
        } as any);
    }
    
    return tools;
}

// =============================================================================
// Main Builder
// =============================================================================

/**
 * Build user-configured tools from the state DB for a given agent profile.
 * Returns tools keyed by their user-defined name.
 */
export async function buildUserTools(
    profile: AgentProfile,
    stateProvider: { listAgentTools: (slug: string) => Promise<AgentToolData[]> },
): Promise<Record<string, any>> {
    const tools: Record<string, any> = {};

    try {
        // Determine profile slug from name (normalize to lowercase kebab)
        const profileSlug = profile.name?.toLowerCase().replace(/\s+/g, '-') || 'default';
        const userTools = await stateProvider.listAgentTools(profileSlug);

        if (!userTools.length) return tools;

        for (const toolDef of userTools) {
            try {
                const config = JSON.parse(toolDef.config);

                switch (toolDef.type) {
                    case 'workflow': {
                        // Permission check: workflows must be allowed
                        const wfPerms = profile.permissions?.['workflows.all'] || [];
                        if (!wfPerms.includes('trigger') && !wfPerms.includes('all')) {
                            console.log(`[UserTools] Skipping '${toolDef.name}' — no workflow trigger permission`);
                            continue;
                        }
                        Object.assign(tools, buildWorkflowTool(toolDef, config as WorkflowToolConfig, profile));
                        break;
                    }

                    case 'mcp_server': {
                        // Permission check: engine access required for MCP
                        const enginePerms = profile.permissions?.['engine.all'] || [];
                        if (!enginePerms.includes('read') && !enginePerms.includes('all')) {
                            console.log(`[UserTools] Skipping MCP '${toolDef.name}' — no engine read permission`);
                            continue;
                        }
                        Object.assign(tools, await buildMcpClientTools(toolDef, config as McpServerToolConfig));
                        break;
                    }

                    default:
                        console.warn(`[UserTools] Unknown tool type '${toolDef.type}' for '${toolDef.name}'`);
                }
            } catch (parseErr: any) {
                console.error(`[UserTools] Failed to parse config for '${toolDef.name}': ${parseErr.message}`);
            }
        }

        if (Object.keys(tools).length > 0) {
            console.log(`[UserTools] Loaded ${Object.keys(tools).length} user-configured tools for profile '${profile.name}'`);
        }
    } catch (err: any) {
        // Graceful degradation — agent_tools table might not exist yet
        console.warn(`[UserTools] Could not load user tools: ${err.message}`);
    }

    return tools;
}
