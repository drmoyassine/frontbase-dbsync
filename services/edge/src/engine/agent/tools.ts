/**
 * Agent Tool Builder
 * 
 * Assembles the complete tool set for a given Agent Profile by combining:
 *   - Tier 1: Auto-registered tools from OpenAPI spec
 *   - Tier 2: Curated high-level tools (pages, styles, engine)
 *   - Tier 3: queryDatasource, triggerWorkflow (generic)
 *   - Tier 4: User-configured tools from state DB (workflows-as-tools, MCP clients)
 * 
 * All tools are permission-gated via the profile's permissions matrix.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { executeDataRequest } from '../../routes/data.js';
import type { AgentProfile } from '../../config/env.js';
import type { DataRequest } from '../../schemas/publish.js';

import { buildAutoTools } from './auto-register.js';
import { buildPageTools } from './tools/pages.js';
import { buildStyleTools } from './tools/styles.js';
import { buildEngineTools } from './tools/engine.js';
import { buildUserTools } from './tools/user-tools.js';
import { liteApp } from '../lite.js';

/**
 * Builds the complete set of active SDK Tools for a given Agent Profile.
 * Tools are rigorously guarded by the `permissions` JSON matrix injected 
 * into the environment variable FRONTBASE_AGENT_PROFILES.
 */
export const buildAgentTools = async (
    profile: AgentProfile,
    stateProvider?: { listAgentTools: (slug: string) => Promise<any[]> },
) => {
    const tools: Record<string, any> = {};

    // ── Tier 1: Dynamic Auto-Registered Tools ───────────────────────
    // These reflect the engine's entire exposed OpenAPI surface
    Object.assign(tools, await buildAutoTools(profile));

    // ── Tier 2: Curated High-Level Tools ────────────────────────────
    // Pages (list, get, updateComponent, updateAndPublish)
    Object.assign(tools, buildPageTools(profile));

    // Styles (get, update, batchUpdate)
    Object.assign(tools, buildStyleTools(profile));

    // Engine introspection (status, config, workflows, logs)
    Object.assign(tools, buildEngineTools(profile));

    // ── Tier 3: Generic Data + Workflow Tools ───────────────────────

    // Data query tool (read-only SQL against connected datasources)
    tools.queryDatasource = tool({
        description: "Execute a read-only SQL SELECT query against a connected external Datasource. Use this to query live app data.",
        parameters: z.object({
            datasourceId: z.string().describe("The UUID of the connected datasource to query."),
            sql: z.string().describe("The raw SQL SELECT query to execute. Do not execute destructive commands like DROP or DELETE.")
        }),
        // @ts-ignore
        execute: async ({ datasourceId, sql }) => {
            // Permission Guard Matrix 
            const dsPerms = profile.permissions?.[`datasources.${datasourceId}`] 
                         || profile.permissions?.['datasources.all'] || [];
            
            if (!dsPerms.includes('read') && !dsPerms.includes('all')) {
                return { 
                    error: `Security Violation: Your Agent Profile '${profile.name}' does not have 'read' permissions configured for datasource '${datasourceId}'. Have the administrator grant access through the Edge Inspector UI.` 
                };
            }

            try {
                const dataReq: any = {
                    fetchStrategy: 'proxy',
                    datasourceId,
                    method: 'POST',
                    url: '',
                    body: { query: sql, params: [] },
                    queryConfig: { sql }
                };
                
                const result = await executeDataRequest(dataReq as DataRequest);
                return result.data;
            } catch (e: any) {
                return { error: `Query failed: ${e.message || 'Unknown query error'}` };
            }
        }
    });
    
    // Action Workflow trigger tool
    const workflowPerms = profile.permissions?.['workflows.all'] || [];
    if (workflowPerms.includes('trigger') || workflowPerms.includes('all')) {
        tools.triggerWorkflow = tool({
            description: "Trigger an Action Workflow deployed on this Edge Engine.",
            parameters: z.object({
                workflowId: z.string().describe("The ID of the workflow to trigger."),
                payload: z.record(z.any()).optional().describe("Optional JSON payload to send to the workflow.")
            }),
            execute: async ({ workflowId, payload }: { workflowId: string, payload?: Record<string, any> }) => {
                try {
                    const req = new Request(`http://localhost/api/execute/${workflowId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': profile.apiKey || '',
                        },
                        body: JSON.stringify({ parameters: payload || {} })
                    });
                    const res = await liteApp.request(req);
                    const data = await res.json();
                    return data;
                } catch (e: any) {
                    return { error: `Failed to trigger workflow: ${e.message}` };
                }
            }
        } as any);
    }

    // ── Tier 4: User-Configured Tools (State DB) ────────────────────
    if (stateProvider) {
        Object.assign(tools, await buildUserTools(profile, stateProvider));
    }

    return tools;
};
