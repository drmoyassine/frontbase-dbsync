/**
 * MCP Server Transport Endpoint
 * 
 * Exposes the Edge Engine's tool surface (pages, styles, schemas, datasources)
 * via the standard Model Context Protocol (MCP) using Server-Sent Events (SSE).
 * 
 * This allows external agents (e.g., Claude Desktop, Cursor) to connect to Frontbase
 * and use its native capabilities exactly as the built-in Edge Agents do.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPTransport } from '@hono/mcp';
import { getAgentProfilesConfig } from '../config/env.js';
import { buildAgentTools } from '../engine/agent/tools.js';
import { getStateProvider } from '../storage/index.js';

export const mcpServerRoute = new OpenAPIHono();

// Global cache for MCP servers to persist transport connection across standard HTTP requests
const serverCache = new Map<string, { mcpServer: McpServer; transport: StreamableHTTPTransport }>();

// ── MCP Protocol Endpoints ──
// `@hono/mcp` StreamableHTTPTransport handles both /mcp and /mcp/messages via a single router intercept

mcpServerRoute.all('/:profileSlug/*', async (c) => {
    // Check auth
    const profileSlug = c.req.param('profileSlug');
    const profilesConfig = getAgentProfilesConfig();
    const profile = profilesConfig[profileSlug];

    if (!profile) {
        return c.json({ error: { message: `Agent Profile '${profileSlug}' not found.` } }, 404);
    }

    // Verify API Key matches the profile
    const apiKeyHeader = c.req.header('x-api-key') || c.req.header('authorization')?.replace('Bearer ', '');
    if (profile.apiKey && apiKeyHeader !== profile.apiKey) {
        return c.text('Unauthorized API Key', 401);
    }

    // Load or initialize MCP Server
    let instance = serverCache.get(profileSlug);

    if (!instance) {
        const mcpServer = new McpServer({
            name: `frontbase-${profileSlug}`,
            version: '1.0.0',
        });

        // Pull the internal AI Edge Tools
        const aiTools = await buildAgentTools(profile, getStateProvider());

        // Map AI Tools -> MCP Tools
        for (const [name, toolObj] of Object.entries(aiTools)) {
            let shape = {};
            // Extract Zod raw shape from object schema, fallback to empty for simple args
            if (toolObj.parameters && toolObj.parameters._def && typeof toolObj.parameters.shape === 'object') {
                shape = toolObj.parameters.shape;
            }

            // Bind the tool with MCP syntax
            mcpServer.tool(
                name,
                toolObj.description || `Execute ${name}`,
                shape,
                async (args: any) => {
                    try {
                        const result = await toolObj.execute(args);
                        return {
                            content: [{ type: "text", text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }]
                        };
                    } catch (e: any) {
                        return {
                            isError: true,
                            content: [{ type: "text", text: `Tool execution failed: ${e.message}` }]
                        };
                    }
                }
            );
        }

        // Map MCP Resources
        mcpServer.resource(
            'pages',
            'engine://pages',
            async (uri: any) => {
                const pages = await getStateProvider().listPages();
                return {
                    contents: [{
                        uri: uri.href,
                        text: JSON.stringify(pages, null, 2)
                    }]
                };
            }
        );

        mcpServer.resource(
            'workflows',
            'engine://workflows',
            async (uri: any) => {
                const workflows = await getStateProvider().listWorkflows();
                return {
                    contents: [{
                        uri: uri.href,
                        text: JSON.stringify(workflows, null, 2)
                    }]
                };
            }
        );

        mcpServer.resource(
            'config',
            'engine://config',
            async (uri: any) => {
                // Return sanitized profile config, omits API key
                const sanitizedProfile = { ...profile };
                delete sanitizedProfile.apiKey;
                return {
                    contents: [{
                        uri: uri.href,
                        text: JSON.stringify(sanitizedProfile, null, 2)
                    }]
                };
            }
        );

        const transport = new StreamableHTTPTransport();
        instance = { mcpServer, transport };
        serverCache.set(profileSlug, instance);
    }

    if (!instance.mcpServer.isConnected()) {
        await instance.mcpServer.connect(instance.transport);
    }

    // @hono/mcp will handle GET (SSE) and POST (RPC) appropriately
    return instance.transport.handleRequest(c as any);
});
