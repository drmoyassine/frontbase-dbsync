// @ts-nocheck
/**
 * Curated Engine Tools (Tier 2)
 * 
 * Engine introspection tools for the agent to understand its own
 * infrastructure status, configuration, deployed workflows, and logs.
 */

import { tool } from 'ai';
import { stateProvider } from '../../../storage/index.js';
import { liteApp } from '../../lite.js';
import { objectSchema, S } from './schema-helper.js';
import type { AgentProfile } from '../../../config/env.js';
import type { GpuModel } from '../../../config/env.js';

/**
 * Build engine introspection tools gated by the agent profile's permissions.
 */
export function buildEngineTools(profile: AgentProfile): Record<string, any> {
    const tools: Record<string, any> = {};
    const perms = profile.permissions?.['engine.all'] || [];
    const hasRead = perms.includes('read') || perms.includes('all');

    if (!hasRead) return tools;

    tools['engine_status'] = tool({
        description: 'Get the engine\'s current health status including state DB, cache, and queue binding status. Use this to understand what infrastructure is connected.',
        parameters: objectSchema({
            dummy: S.string('Not used, pass empty string'),
        }),
        execute: async ({ dummy }: any) => {
            try {
                const req = new Request('http://localhost/api/health', {
                    headers: { 'x-api-key': profile.apiKey || '' },
                });
                const res = await liteApp.request(req);
                const data = await res.json() as any;
                return {
                    status: data.status,
                    version: data.version,
                    provider: data.provider,
                    uptime_seconds: data.uptime_seconds,
                    bindings: data.bindings,
                };
            } catch (e: any) {
                return { error: `Failed to get engine status: ${e.message}` };
            }
        },
    });

    tools['engine_config'] = tool({
        description: 'Get a non-secret summary of the engine\'s configuration: which providers are configured for state DB, cache, queue, and how many GPU models are available.',
        parameters: objectSchema({
            dummy: S.string('Not used, pass empty string'),
        }),
        execute: async ({ dummy }: any) => {
            try {
                const { getStateDbConfig, getCacheConfig, getQueueConfig, getGpuModels, getAgentProfilesConfig } = await import('../../../config/env.js');
                const stateDb = getStateDbConfig();
                const cache = getCacheConfig();
                const queue = getQueueConfig();
                const models = getGpuModels();
                const profiles = getAgentProfilesConfig();

                return {
                    stateDb: { provider: stateDb.provider },
                    cache: { provider: cache.provider },
                    queue: { provider: queue.provider },
                    gpu: {
                        modelCount: models.length,
                        models: models.map((m: GpuModel) => ({
                            slug: m.slug,
                            modelId: m.modelId,
                            type: m.modelType,
                            provider: m.provider,
                        })),
                    },
                    agentProfiles: Object.keys(profiles),
                };
            } catch (e: any) {
                return { error: `Failed to get config: ${e.message}` };
            }
        },
    });

    tools['engine_workflows'] = tool({
        description: 'List all deployed workflows on this engine. Returns name, trigger type, active status, and version for each workflow.',
        parameters: objectSchema({
            dummy: S.string('Not used, pass empty string'),
        }),
        execute: async ({ dummy }: any) => {
            try {
                const workflows = await stateProvider.listWorkflows();
                return {
                    count: workflows.length,
                    workflows: workflows.map((w: any) => ({
                        id: w.id,
                        name: w.name,
                        description: w.description,
                        triggerType: w.triggerType,
                        isActive: w.isActive,
                        version: w.version,
                        updatedAt: w.updatedAt,
                    })),
                };
            } catch (e: any) {
                return { error: `Failed to list workflows: ${e.message}` };
            }
        },
    });

    tools['engine_logs'] = tool({
        description: 'Get recent edge engine logs. Useful for debugging issues or checking recent activity.',
        parameters: objectSchema({
            limit: S.number('Max number of log entries to return (default: 20, max: 100)'),
            level: S.string('Filter by log level: "info", "warn", "error"'),
        }, ['limit']),
        execute: async ({ limit, level }: any) => {
            try {
                const queryLimit = Math.min(limit || 20, 100);
                const url = new URL('http://localhost/api/edge-logs');
                url.searchParams.set('limit', String(queryLimit));
                if (level) url.searchParams.set('level', level);

                const req = new Request(url.toString(), {
                    headers: { 'x-api-key': profile.apiKey || '' },
                });
                const res = await liteApp.request(req);
                const data = await res.json();
                return data;
            } catch (e: any) {
                return { error: `Failed to get logs: ${e.message}` };
            }
        },
    });

    return tools;
}
