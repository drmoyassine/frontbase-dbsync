import api from './api-service';

// =============================================================================
// MCP Servers
// =============================================================================

export interface McpServer {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    url: string;
    transport: string;
    authType: string | null;
    hasAuth: boolean;
    toolFilter: string[] | null;
    category: string | null;
    isPublic: boolean;
    isActive: boolean;
    tenantId: string | null;
    projectId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface McpServerCreate {
    name: string;
    slug: string;
    description?: string;
    url: string;
    transport?: string;
    authType?: string;
    token?: string;
    toolFilter?: string[];
    category?: string;
    isActive?: boolean;
}

export interface McpServerUpdate {
    name?: string;
    description?: string;
    url?: string;
    transport?: string;
    authType?: string;
    token?: string;
    toolFilter?: string[];
    category?: string;
    isActive?: boolean;
}

export interface McpTool {
    name: string;
    description?: string;
    inputSchema?: unknown;
}

export interface McpServerTestResult {
    reachable: boolean;
    serverId: string;
}

export interface McpServerToolsResult {
    tools: McpTool[];
    total: number;
}

export interface McpServersListResult {
    mcpServers: McpServer[];
    total: number;
}

// =============================================================================
// Skills
// =============================================================================

export interface AgentSkill {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    category: string | null;
    toolDefinitions: unknown[];
    version: string;
    isBuiltin: boolean;
    isActive: boolean;
    tenantId: string | null;
    projectId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SkillCreate {
    slug: string;
    name: string;
    description?: string;
    category?: string;
    toolDefinitions: unknown[];
    version?: string;
}

export interface SkillUpdate {
    name?: string;
    description?: string;
    category?: string;
    toolDefinitions?: unknown[];
    isActive?: boolean;
}

export interface SkillsListResult {
    skills: AgentSkill[];
    total: number;
}

// =============================================================================
// Profile → Skill Installation
// =============================================================================

export interface SkillInstall {
    skillId: string;
    configOverrides?: Record<string, unknown>;
}

export interface InstalledSkill extends AgentSkill {
    configOverrides: Record<string, unknown> | null;
    installedAt: string;
}

export interface ProfileSkillsResult {
    skills: InstalledSkill[];
    total: number;
}

export interface SkillInstallResult {
    installed: boolean;
    skillId: string;
    profileId: string;
}

// =============================================================================
// API Client
// =============================================================================

export const agentIntegrationsApi = {
    // -------------------------------------------------------------------------
    // MCP Servers
    // -------------------------------------------------------------------------

    listMcpServers: async (): Promise<McpServersListResult> => {
        const res = await api.get('/api/mcp-servers');
        return res.data;
    },

    createMcpServer: async (body: McpServerCreate): Promise<McpServer> => {
        const res = await api.post('/api/mcp-servers', body);
        return res.data;
    },

    getMcpServer: async (id: string): Promise<McpServer> => {
        const res = await api.get(`/api/mcp-servers/${id}`);
        return res.data;
    },

    updateMcpServer: async (id: string, body: McpServerUpdate): Promise<McpServer> => {
        const res = await api.put(`/api/mcp-servers/${id}`, body);
        return res.data;
    },

    deleteMcpServer: async (id: string): Promise<void> => {
        await api.delete(`/api/mcp-servers/${id}`);
    },

    listMcpServerTools: async (id: string): Promise<McpServerToolsResult> => {
        const res = await api.get(`/api/mcp-servers/${id}/tools`);
        return res.data;
    },

    testMcpServer: async (id: string): Promise<McpServerTestResult> => {
        const res = await api.post(`/api/mcp-servers/${id}/test`);
        return res.data;
    },

    // -------------------------------------------------------------------------
    // Skills
    // -------------------------------------------------------------------------

    listSkills: async (): Promise<SkillsListResult> => {
        const res = await api.get('/api/agent-skills');
        return res.data;
    },

    createSkill: async (body: SkillCreate): Promise<AgentSkill> => {
        const res = await api.post('/api/agent-skills', body);
        return res.data;
    },

    updateSkill: async (id: string, body: SkillUpdate): Promise<AgentSkill> => {
        const res = await api.put(`/api/agent-skills/${id}`, body);
        return res.data;
    },

    deleteSkill: async (id: string): Promise<void> => {
        await api.delete(`/api/agent-skills/${id}`);
    },

    // -------------------------------------------------------------------------
    // Profile → Skill Installation
    // -------------------------------------------------------------------------

    listProfileSkills: async (profileId: string): Promise<ProfileSkillsResult> => {
        const res = await api.get(`/api/agent-profiles/${profileId}/skills`);
        return res.data;
    },

    installSkill: async (profileId: string, body: SkillInstall): Promise<SkillInstallResult> => {
        const res = await api.post(`/api/agent-profiles/${profileId}/skills`, body);
        return res.data;
    },

    uninstallSkill: async (profileId: string, installId: string): Promise<void> => {
        await api.delete(`/api/agent-profiles/${profileId}/skills/${installId}`);
    },
};
