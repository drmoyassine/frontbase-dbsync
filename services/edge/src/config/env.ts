/**
 * Centralized FRONTBASE Environment Configuration
 * 
 * All edge runtime config flows through this module.
 * JSON env vars are parsed once on first access (lazy singletons).
 * 
 * Env vars:
 *   FRONTBASE_STATE_DB  — State DB config (provider-discriminated)
 *   FRONTBASE_AUTH      — Auth + users config (provider + contacts)
 *   FRONTBASE_CACHE     — Cache config (provider-discriminated)
 *   FRONTBASE_QUEUE     — Queue config (provider-discriminated)
 *   FRONTBASE_GPU       — AI model registry (array)
 *   FRONTBASE_AGENT_PROFILES — Agent personas & permissions mappings
 */

// =============================================================================
// Types
// =============================================================================

export interface StateDbConfig {
    provider: string;
    url?: string;
    token?: string;
    anonKey?: string;
    jwt?: string;
    schema?: string;
    cfApiToken?: string;
    cfAccountId?: string;
}

export interface ContactsDatasource {
    type: string;
    url: string;
    anonKey?: string;
}

export interface ContactsConfig {
    table: string;
    datasource?: ContactsDatasource;
    columnMapping?: Record<string, string>;
    contactTypes?: Record<string, string>;
    contactTypeHomePages?: Record<string, string>;
    permissionLevels?: Record<string, string>;
}

export interface AuthConfig {
    provider: string;
    url?: string;
    anonKey?: string;
    jwtSecret?: string;
    contacts?: ContactsConfig;
    enabled?: boolean;
    // Legacy fields (pre-migration) — read via getApiKeysConfig() fallback
    systemKey?: string;
    apiKeyHashes?: Array<{ prefix?: string; hash: string; scope?: string; expires_at?: string | null }>;
}

export interface ApiKeysConfig {
    systemKey?: string;
    apiKeyHashes?: Array<{ prefix?: string; hash: string; scope?: string; expires_at?: string | null }>;
}

export interface CacheConfig {
    provider: string;
    url?: string;
    token?: string;
    cfApiToken?: string;
    cfAccountId?: string;
}

export interface QueueConfig {
    provider: string;
    url?: string;
    token?: string;
    signingKey?: string;
    nextSigningKey?: string;
    cfApiToken?: string;
    cfAccountId?: string;
}

export interface GpuModel {
    slug: string;
    modelId: string;
    modelType: string;
    provider: string;
}

export interface AgentProfile {
    name: string;
    systemPrompt: string | null;
    permissions: Record<string, string[]>;
    apiKey?: string;
    excludedEndpoints?: string[];
    maxAutoTools?: number;  // Cap on Tier 1 auto-registered tools (default: 50)
}

export type AgentProfilesConfig = Record<string, AgentProfile>;

// =============================================================================
// Parser
// =============================================================================

function parseEnv<T>(key: string, fallback: T): T {
    try {
        const raw = process.env[key];
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch (e) {
        console.warn(`[Config] Failed to parse ${key}:`, (e as Error).message);
        return fallback;
    }
}

// =============================================================================
// Lazy Singletons
// =============================================================================

let _stateDb: StateDbConfig | null = null;
let _auth: AuthConfig | null = null;
let _apiKeys: ApiKeysConfig | null = null;
let _cache: CacheConfig | null = null;
let _queue: QueueConfig | null = null;
let _gpu: GpuModel[] | null = null;
let _agentProfiles: AgentProfilesConfig | null = null;

/** State DB config (turso | supabase | cloudflare | neon | local) */
export function getStateDbConfig(): StateDbConfig {
    return (_stateDb ??= parseEnv<StateDbConfig>('FRONTBASE_STATE_DB', { provider: 'local' }));
}

/** Auth + users config (supabase | none) */
export function getAuthConfig(): AuthConfig {
    return (_auth ??= parseEnv<AuthConfig>('FRONTBASE_AUTH', { provider: 'none' }));
}

/** Engine access control — system key + API key hashes */
export function getApiKeysConfig(): ApiKeysConfig {
    if (!_apiKeys) {
        const fresh = parseEnv<ApiKeysConfig>('FRONTBASE_API_KEYS', {});
        // Backward compat: also check FRONTBASE_AUTH for pre-migration engines
        const legacyAuth = getAuthConfig();
        _apiKeys = {
            systemKey: fresh.systemKey || legacyAuth.systemKey,
            apiKeyHashes: fresh.apiKeyHashes || legacyAuth.apiKeyHashes,
        };
    }
    return _apiKeys;
}

/** Cache config (upstash | cloudflare | deno_kv | none) */
export function getCacheConfig(): CacheConfig {
    return (_cache ??= parseEnv<CacheConfig>('FRONTBASE_CACHE', { provider: 'none' }));
}

/** Queue config (qstash | cloudflare | none) */
export function getQueueConfig(): QueueConfig {
    return (_queue ??= parseEnv<QueueConfig>('FRONTBASE_QUEUE', { provider: 'none' }));
}

/** GPU models array */
export function getGpuModels(): GpuModel[] {
    return (_gpu ??= parseEnv<GpuModel[]>('FRONTBASE_GPU', []));
}

/** Agent Profiles mapping */
export function getAgentProfilesConfig(): AgentProfilesConfig {
    return (_agentProfiles ??= parseEnv<AgentProfilesConfig>('FRONTBASE_AGENT_PROFILES', {}));
}

// =============================================================================
// Hot-Reload Support (for config.ts POST /api/config)
// =============================================================================

/** Reset a specific config singleton (forces re-parse on next access) */
export function resetConfig(key: 'stateDb' | 'auth' | 'apiKeys' | 'cache' | 'queue' | 'gpu' | 'agentProfiles' | 'all'): void {
    if (key === 'stateDb' || key === 'all') _stateDb = null;
    if (key === 'auth' || key === 'all') _auth = null;
    if (key === 'apiKeys' || key === 'all') _apiKeys = null;
    if (key === 'cache' || key === 'all') _cache = null;
    if (key === 'queue' || key === 'all') _queue = null;
    if (key === 'gpu' || key === 'all') _gpu = null;
    if (key === 'agentProfiles' || key === 'all') _agentProfiles = null;
}

/** Override a config singleton directly (for runtime hot-swap without env var mutation) */
export function overrideCacheConfig(config: CacheConfig): void {
    _cache = config;
}

export function overrideQueueConfig(config: QueueConfig): void {
    _queue = config;
}

export function overrideApiKeysConfig(config: ApiKeysConfig): void {
    _apiKeys = config;
}
