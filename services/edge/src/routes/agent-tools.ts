/**
 * Agent Tools CRUD Route
 * 
 * Manages user-configured tools (workflows-as-tools, MCP servers)
 * stored in the state DB's agent_tools table.
 * 
 * Protected by systemKeyAuth — only the builder/admin can manage tools.
 * 
 * POST   /api/agent-tools           → upsert tool
 * GET    /api/agent-tools/:slug     → list tools for a profile
 * DELETE /api/agent-tools/:id       → delete a tool
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { getStateProvider } from '../storage/index.js';

export const agentToolsRoute = new OpenAPIHono();

// List tools for a profile
agentToolsRoute.get('/:profileSlug', async (c) => {
    const profileSlug = c.req.param('profileSlug');
    const includeInactive = c.req.query('includeInactive') === 'true';

    try {
        const provider = getStateProvider();
        const tools = await provider.listAgentTools(profileSlug, includeInactive);
        return c.json({ tools });
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

// Upsert a tool
agentToolsRoute.post('/', async (c) => {
    const body = await c.req.json();

    // Validate required fields
    if (!body.id || !body.profileSlug || !body.type || !body.name || !body.config) {
        return c.json({
            error: 'Missing required fields: id, profileSlug, type, name, config',
        }, 400);
    }

    // Validate type
    if (!['workflow', 'mcp_server'].includes(body.type)) {
        return c.json({ error: 'Invalid type. Must be "workflow" or "mcp_server".' }, 400);
    }

    // Validate config is valid JSON
    try {
        if (typeof body.config === 'string') {
            JSON.parse(body.config);
        } else {
            // If config is provided as object, stringify it
            body.config = JSON.stringify(body.config);
        }
    } catch {
        return c.json({ error: 'config must be valid JSON' }, 400);
    }

    try {
        const provider = getStateProvider();
        await provider.upsertAgentTool({
            id: body.id,
            profileSlug: body.profileSlug,
            type: body.type,
            name: body.name,
            description: body.description || null,
            config: typeof body.config === 'string' ? body.config : JSON.stringify(body.config),
            isActive: body.isActive !== false,
            createdAt: body.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        return c.json({ success: true, id: body.id });
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

// Delete a tool
agentToolsRoute.delete('/:id', async (c) => {
    const id = c.req.param('id');

    try {
        const provider = getStateProvider();
        await provider.deleteAgentTool(id);
        return c.json({ success: true });
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});
