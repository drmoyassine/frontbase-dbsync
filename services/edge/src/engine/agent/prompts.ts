/**
 * Agent System Prompt Builder
 * 
 * Generates a context-aware system prompt based on the agent profile's
 * permissions. Dynamically injects available tool families so the LLM
 * knows exactly what it can and cannot do.
 */

import type { AgentProfile } from '../../config/env.js';

export const buildAgentSystemPrompt = (profile: AgentProfile): string => {
    let prompt = `You are a helpful AI Agent named ${profile.name} running autonomously on a Frontbase Edge Engine. `;
    
    if (profile.systemPrompt) {
        prompt += `\n\n=== SYSTEM INSTRUCTIONS ===\n${profile.systemPrompt}\n===========================\n`;
    }

    const perms = Object.keys(profile.permissions || {});

    // ── Capability Discovery ────────────────────────────────────────

    const permittedDatasources = perms.filter(k => k.startsWith('datasources.') && (profile.permissions[k].includes('read') || profile.permissions[k].includes('all')));
    const hasStateDb = perms.includes('stateDb') && (profile.permissions['stateDb'].includes('read') || profile.permissions['stateDb'].includes('all'));
    const hasWorkflows = perms.includes('workflows.all') && (profile.permissions['workflows.all'].includes('trigger') || profile.permissions['workflows.all'].includes('all'));
    
    // New permission scopes for Tier 2 tools
    const pagePerms = profile.permissions?.['pages.all'] || [];
    const hasPageRead = pagePerms.includes('read') || pagePerms.includes('all');
    const hasPageWrite = pagePerms.includes('write') || pagePerms.includes('all');
    
    const enginePerms = profile.permissions?.['engine.all'] || [];
    const hasEngine = enginePerms.includes('read') || enginePerms.includes('all');

    // ── Build Capabilities Section ──────────────────────────────────

    prompt += `\n\n=== CAPABILITIES & AVAILABLE TOOLS ===\n`;
    
    // Datasources
    if (permittedDatasources.length > 0) {
        prompt += `\n📊 **Data Access**\n`;
        prompt += `- You have READ access to connected datasources: ${permittedDatasources.map(d => d.replace('datasources.', '')).join(', ')}.\n`;
        prompt += `- Use the \`queryDatasource\` tool when you need live data.\n`;
    } else {
        prompt += `\n📊 **Data Access**: None — you do not have access to any external datasources.\n`;
    }

    // Pages
    if (hasPageRead || hasPageWrite) {
        prompt += `\n📄 **Page Management**\n`;
        if (hasPageRead) {
            prompt += `- Use \`pages_list\` to see all published pages.\n`;
            prompt += `- Use \`pages_get\` to inspect a page's component tree.\n`;
        }
        if (hasPageWrite) {
            prompt += `- Use \`pages_updateAndPublish\` for one-shot visible edits (recommended).\n`;
            prompt += `- Use \`pages_updateComponent\` to change props without publishing.\n`;
        }
        if (hasPageRead) {
            prompt += `- Use \`styles_get\` to inspect component styles.\n`;
        }
        if (hasPageWrite) {
            prompt += `- Use \`styles_update\` or \`styles_batchUpdate\` for visual changes.\n`;
        }
    }

    // Engine
    if (hasEngine) {
        prompt += `\n⚙️ **Engine Introspection**\n`;
        prompt += `- Use \`engine_status\` to check health and binding status.\n`;
        prompt += `- Use \`engine_config\` to see provider configuration.\n`;
        prompt += `- Use \`engine_workflows\` to list deployed workflows.\n`;
        prompt += `- Use \`engine_logs\` to view recent logs.\n`;
    }

    // State DB
    if (hasStateDb) {
        prompt += `\n🗄️ **State DB**\n`;
        prompt += `- You have READ access to the Edge Engine's internal State DB (configuration and pages).\n`;
    }

    // Workflows
    if (hasWorkflows) {
        prompt += `\n🔧 **Workflow Automation**\n`;
        prompt += `- Use \`triggerWorkflow\` to start Action Workflows by ID (generic, for any workflow).\n`;
        prompt += `- Named workflow tools (e.g., \`send_welcome_email\`) are easier to use — they have typed parameters.\n`;
    }

    // User-configured tools hint
    prompt += `\n🛠️ **Custom Tools**\n`;
    prompt += `- You may also have access to user-configured tools: named workflow tools with typed parameters, or tools imported from external MCP servers.\n`;
    prompt += `- These tools have descriptive names and parameter schemas — prefer them over the generic \`triggerWorkflow\` when available.\n`;

    // Auto-registered tools
    prompt += `\n🔌 **API Endpoints**\n`;
    prompt += `- You also have access to auto-registered tools prefixed with their API category (e.g., \`execution_*\`, \`cache_*\`, \`system_*\`). These correspond to the engine's internal API endpoints.\n`;

    prompt += `\n=== END CAPABILITIES ===\n`;

    // ── Guidelines ──────────────────────────────────────────────────

    prompt += `\n**Guidelines:**\n`;
    prompt += `- Prefer curated tools (pages_*, styles_*, engine_*) over raw API tools when both are available.\n`;
    prompt += `- When making visual changes, use \`pages_updateAndPublish\` for atomic edits.\n`;
    prompt += `- For coordinated style changes across multiple components, use \`styles_batchUpdate\`.\n`;
    prompt += `- Always verify your changes took effect by using inspection tools after modifications.\n`;

    return prompt;
};
