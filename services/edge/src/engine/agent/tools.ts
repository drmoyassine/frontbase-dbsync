// @ts-nocheck
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
import { executeDataRequest } from '../../routes/data.js';
import type { AgentProfile } from '../../config/env.js';
import type { DataRequest } from '../../schemas/publish.js';
import { objectSchema, S } from './tools/schema-helper.js';

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
 * 
 * Build order: Tier 2/3/4 first (curated), then Tier 1 (auto-registered).
 * Curated tool names are passed to buildAutoTools for dedup — curated always wins.
 */
export const buildAgentTools = async (
    profile: AgentProfile,
    stateProvider?: { listAgentTools: (slug: string) => Promise<any[]> },
) => {
    const tools: Record<string, any> = {};

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
        parameters: objectSchema({
            datasourceId: S.string("The UUID of the connected datasource to query."),
            sql: S.string("The raw SQL SELECT query to execute. Do not execute destructive commands like DROP or DELETE."),
        }),
        // @ts-ignore
        execute: async ({ datasourceId, sql }: any) => {
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
            parameters: objectSchema({
                workflowId: S.string("The ID of the workflow to trigger."),
                payload: S.record("Optional JSON payload to send to the workflow."),
            }, ['workflowId']),
            execute: async ({ workflowId, payload }: any) => {
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
        });
    }

    // ── Tier 4: User-Configured Tools (State DB) ────────────────────
    if (stateProvider) {
        Object.assign(tools, await buildUserTools(profile, stateProvider));
    }

    // ── Tier 1: Dynamic Auto-Registered Tools ───────────────────────
    // Built LAST so we can pass curated names for dedup.
    // Curated tools always take precedence over auto-generated ones.
    const curatedNames = new Set(Object.keys(tools));
    Object.assign(tools, await buildAutoTools(profile, curatedNames));

    return tools;
};
