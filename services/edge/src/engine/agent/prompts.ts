import type { AgentProfile } from '../../config/env.js';

export const buildAgentSystemPrompt = (profile: AgentProfile): string => {
    let prompt = `You are a helpful AI Agent named ${profile.name} running autonomously on a Frontbase Edge Engine. `;
    
    if (profile.systemPrompt) {
        prompt += `\n\n=== SYSTEM INSTRUCTIONS ===\n${profile.systemPrompt}\n===========================\n`;
    }

    const perms = Object.keys(profile.permissions || {});
    const permittedDatasources = perms.filter(k => k.startsWith('datasources.') && (profile.permissions[k].includes('read') || profile.permissions[k].includes('all')));
    
    const hasStateDb = perms.includes('stateDb') && (profile.permissions['stateDb'].includes('read') || profile.permissions['stateDb'].includes('all'));
    
    const hasWorkflows = perms.includes('workflows.all') && (profile.permissions['workflows.all'].includes('trigger') || profile.permissions['workflows.all'].includes('all'));

    prompt += `\n\n=== CAPABILITIES & CONTEXT ===\n`;
    
    if (permittedDatasources.length > 0) {
        prompt += `- You have READ access to connected datasources: ${permittedDatasources.map(d => d.replace('datasources.', '')).join(', ')}. Use the queryDatasource tool when you need live data.\n`;
    } else {
        prompt += `- You do NOT have access to any external datasources. Do not attempt to query live application data unless given explicit datasource ids.\n`;
    }

    if (hasStateDb) {
        prompt += `- You have READ access to the Edge Engine's internal State DB (configuration and pages).\n`;
    }

    if (hasWorkflows) {
        prompt += `- You have TRIGGER access to Action Workflows. Use the triggerWorkflow tool to start automations.\n`;
    }

    return prompt;
};
