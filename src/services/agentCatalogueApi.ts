/**
 * Agent Catalogue API client.
 *
 * Fetches the global catalogue of MCP servers, skills, and core tools for
 * the settings modal. Used to populate the exclusion toggles.
 */
import api from './api-service';
import type { CatalogueResponse } from '../types/agentSettings';

export const agentCatalogueApi = {
  /** Global catalogue of available MCP servers, skills, and core tools. */
  get: async (): Promise<CatalogueResponse> => {
    const res = await api.get<CatalogueResponse>('/api/agent-catalogue');
    return res.data;
  },
};
