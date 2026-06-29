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

export interface VectorConfig {
    provider: string;
    url?: string;
    token?: string;
    cfApiToken?: string;
    cfAccountId?: string;
}

export interface StorageConfig {
    /** Provider: 'supabase' | 'cloudflare_r2' | 's3' */
    provider: string;
    /** Supabase project URL */
    url?: string;
    /** Supabase anon key */
    anonKey?: string;
    /** Supabase project ID (for path construction) */
    projectId?: string;
    /** Cloudflare account ID (for R2) */
    accountId?: string;
    /** Cloudflare API token (for R2) */
    apiToken?: string;
    /** Default bucket name (for R2) */
    bucket?: string;
    /** Public URL base (for R2) */
    publicUrl?: string;
}

export interface GpuModel {
    slug: string;
    modelId: string;
    modelType: string;
    provider: string;
    apiKey?: string;
    baseUrl?: string;
}

export interface AgentProfile {
    name: string;
    systemPrompt: string | null;
    permissions: Record<string, string[]>;
    apiKey?: string;
    excludedEndpoints?: string[];
    maxAutoTools?: number;  // Cap on Tier 1 auto-registered tools (default: 50)
    slug?: string;
    tenantSlug?: string;
}

export interface OcrConfig {
    /** Engine selection: 'ocrspace' (default HTTP), 'tesseract' (Docker local), 'gnu_ocrad' (Docker local), 'workers_ai' (Cloudflare) */
    engine: string;
    /** API key for OCR.space or Workers AI (not needed for local engines) */
    apiKey?: string;
    /** Custom HTTP endpoint for blanket HTTP-request based OCR (UI override) */
    endpoint?: string;
    /** Base URL for OCR.space (default: https://api.ocr.space/parse/image) */
    ocrspaceBaseUrl?: string;
    /** Cloudflare Account ID for Workers AI Vision */
    cfAccountId?: string;
    /** Cloudflare API Token for Workers AI Vision */
    cfApiToken?: string;
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
let _authMap = new Map<string, AuthConfig>();
let _authSingle: AuthConfig | null = null;
let _apiKeys: ApiKeysConfig | null = null;
let _cache: CacheConfig | null = null;
let _queue: QueueConfig | null = null;
let _vector: VectorConfig | null = null;
let _storage: StorageConfig | null = null;
let _ocr: OcrConfig | null = null;
let _gpu: GpuModel[] | null = null;
let _agentProfiles: AgentProfilesConfig | null = null;

/** State DB config (turso | supabase | cloudflare | neon | local) */
export function getStateDbConfig(): StateDbConfig {
    return (_stateDb ??= parseEnv<StateDbConfig>('FRONTBASE_STATE_DB', { provider: 'local' }));
}

/** Auth + users config (supabase | none) */
export function getAuthConfig(tenantSlug?: string): AuthConfig {
    const key = tenantSlug || '_default';
    if (_authMap.has(key)) {
        return _authMap.get(key)!;
    }
    if (_authSingle) {
        return _authSingle;
    }

    const parsed = parseEnv<any>('FRONTBASE_AUTH', { provider: 'none' });
    if (parsed && typeof parsed === 'object' && !('provider' in parsed)) {
        // Multi-tenant map format
        for (const [slug, cfg] of Object.entries(parsed)) {
            _authMap.set(slug, cfg as AuthConfig);
        }
        const res = _authMap.get(key) || _authMap.get('_default') || { provider: 'none' };
        return res;
    } else {
        // Single-tenant format
        _authSingle = parsed as AuthConfig;
        return _authSingle;
    }
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

/**
 * Synchronous snapshot of the cached API-keys config (hot-path fallback).
 *
 * Phase 3 background-prewarms Tier-2 secrets instead of blocking boot on them,
 * so `FRONTBASE_API_KEYS` may not yet be in process.env for the first few
 * milliseconds after boot. Auth middleware uses this to take the fast path when
 * the config is already materialized, and falls back to `getApiKeysConfigAsync()`
 * (an explicit vault load) only when this returns null. Returns null — never a
 * default — so callers can distinguish "not loaded yet" from "configured empty".
 */
export function getApiKeysConfigSync(): ApiKeysConfig | null {
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

/** Vector config (pgvector | cloudflare | turso | lancedb | none) */
export function getVectorConfig(): VectorConfig {
    return (_vector ??= parseEnv<VectorConfig>('FRONTBASE_VECTOR', { provider: 'none' }));
}

/** GPU models array */
export function getGpuModels(): GpuModel[] {
    return (_gpu ??= parseEnv<GpuModel[]>('FRONTBASE_GPU', []));
}

/** OCR config (ocrspace | tesseract | gnu_ocrad | workers_ai | custom) */
export function getOcrConfig(): OcrConfig {
    if (_ocr) return _ocr;
    
    const config = parseEnv<OcrConfig>('FRONTBASE_OCR', { engine: 'ocrspace' });
    
    // Priority 1: UI HTTP override (Custom endpoint from settings UI)
    if (config.endpoint) {
        return (_ocr = config);
    }
    
    // Priority 2: Docker local env var override (OCR_ENGINE)
    const dockerEngine = process.env.OCR_ENGINE?.toLowerCase();
    if (dockerEngine === 'tesseract' || dockerEngine === 'gnu_ocrad') {
        return (_ocr = { ...config, engine: dockerEngine });
    }
    
    // Priority 3: Default (JSON config or OCR.space)
    return (_ocr = config);
}

/** Storage config (supabase | cloudflare_r2 | s3) */
export function getStorageConfig(): StorageConfig {
    return (_storage ??= parseEnv<StorageConfig>('FRONTBASE_STORAGE', { provider: 'supabase' }));
}

/** Agent Profiles mapping */
export function getAgentProfilesConfig(): AgentProfilesConfig {
    return (_agentProfiles ??= parseEnv<AgentProfilesConfig>('FRONTBASE_AGENT_PROFILES', {}));
}

// =============================================================================
// Hot-Reload Support (for config.ts POST /api/config)
// =============================================================================

/** Reset a specific config singleton (forces re-parse on next access) */
export function resetConfig(key: 'stateDb' | 'auth' | 'apiKeys' | 'cache' | 'queue' | 'vector' | 'storage' | 'ocr' | 'gpu' | 'agentProfiles' | 'all'): void {
    if (key === 'stateDb' || key === 'all') _stateDb = null;
    if (key === 'auth' || key === 'all') {
        _authSingle = null;
        _authMap.clear();
    }
    if (key === 'apiKeys' || key === 'all') _apiKeys = null;
    if (key === 'cache' || key === 'all') _cache = null;
    if (key === 'queue' || key === 'all') _queue = null;
    if (key === 'vector' || key === 'all') _vector = null;
    if (key === 'storage' || key === 'all') _storage = null;
    if (key === 'ocr' || key === 'all') _ocr = null;
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

export function overrideVectorConfig(config: VectorConfig): void {
    _vector = config;
}

export function overrideApiKeysConfig(config: ApiKeysConfig): void {
    _apiKeys = config;
}

export function overrideOcrConfig(config: OcrConfig): void {
    _ocr = config;
}

export function overrideStorageConfig(config: StorageConfig): void {
    _storage = config;
}

// =============================================================================
// Secret Tiers (Phase 2) — classification + on-demand vault loading
// =============================================================================
//
//   Tier 1 (Critical)    — required to boot; always loaded from the vault at
//                          startup (datasources, storage, cache, queue, …).
//   Tier 2 (Operational) — important but read through lazy singletons; loaded
//                          at boot today, with an on-demand `loadLazySecret`
//                          primitive for recovery/explicit materialization.
//   Tier 3 (Config)      — bootstrap or non-sensitive; never sourced from the
//                          vault (e.g. FRONTBASE_STATE_DB selects the provider
//                          before the vault can even be read).
//
// The full async "scoped accessor" refactor (making every getter vault-aware)
// is deferred to Phase 3 per docs/edge-local-vault-phase2-spec.md §2.8; this
// delivers the classification + on-demand primitive + cache invalidation now.

/** Tier 1 — loaded eagerly at boot (engine cannot function without these). */
export const TIER_1_SECRETS = new Set<string>([
    'FRONTBASE_DATASOURCES',
    'FRONTBASE_STORAGE',
    'FRONTBASE_CACHE',
    'FRONTBASE_QUEUE',
    'FRONTBASE_SECRETS_KEY',
    'FRONTBASE_SECRETS_KEY_OLD',
]);

/** Tier 2 — operational; on-demand loadable. */
export const TIER_2_SECRETS = new Set<string>([
    'FRONTBASE_AUTH',
    'FRONTBASE_API_KEYS',
    'FRONTBASE_SECURITY',
    'FRONTBASE_AGENT_PROFILES',
    'FRONTBASE_VECTOR',
    'FRONTBASE_GPU',
    'FRONTBASE_OCR',
]);

/** Tier 3 — bootstrap / non-sensitive; never loaded from the vault. */
export const TIER_3_SECRETS = new Set<string>([
    'FRONTBASE_STATE_DB',
]);

/** Resolve the tier for a vault secret name (unknown names default to Tier 2). */
export function getSecretTier(name: string): 1 | 2 | 3 {
    if (TIER_1_SECRETS.has(name)) return 1;
    if (TIER_3_SECRETS.has(name)) return 3;
    return 2; // TIER_2_SECRETS + any unclassified FRONTBASE_* var
}

/**
 * In-memory cache of secrets materialized on demand from the vault, so repeated
 * access does not re-hit the state DB / re-run crypto. Cleared by
 * `clearLazySecretCache()` whenever the vault is mutated.
 */
const _lazySecretCache = new Map<string, string>();

/** Drop the on-demand cache (call after any vault write/rollback/rotate). */
export function clearLazySecretCache(): void {
    _lazySecretCache.clear();
}

/**
 * Materialize a single secret on demand, honoring the same precedence as the
 * boot loader: a value already in process.env ALWAYS wins, then the cache,
 * then the vault. Decrypts + caches on first access. Returns null when the
 * secret is absent, the vault is disabled/unsupported, or decryption fails.
 *
 * Dynamic imports keep this foundational module free of top-level cycles with
 * `edgeSecrets.ts` and `storage/index.ts` (both of which import this module).
 */
export async function loadLazySecret(name: string): Promise<string | null> {
    // 1. Manual override always wins.
    if (process.env[name] !== undefined && process.env[name] !== '') {
        return process.env[name] as string;
    }
    // 2. Cache.
    if (_lazySecretCache.has(name)) {
        return _lazySecretCache.get(name)!;
    }
    // 3. Vault.
    try {
        const { stateProvider } = await import('../storage/index.js');
        const { getVaultSystemKey, decryptSecret } = await import('./edgeSecrets.js');
        const systemKey = getVaultSystemKey();
        if (!systemKey || typeof stateProvider.getEdgeSecret !== 'function') {
            return null;
        }
        const row = await stateProvider.getEdgeSecret(name);
        if (!row) return null;
        const plaintext = await decryptSecret(row.value, systemKey);
        _lazySecretCache.set(name, plaintext);
        return plaintext;
    } catch (err) {
        console.error(`[LazySecret] Failed to load '${name}' from vault:`, err);
        return null;
    }
}

// =============================================================================
// Phase 3 — Async Scoped Accessors + Background Tier-2 Prewarm
// =============================================================================
//
// The synchronous getters above read from process.env, which is populated at
// boot. Phase 3 changes the boot loader to block on Tier-1 only and prewarm
// Tier-2 in the background (see startup/loadSecrets.ts). These async accessors
// are the explicit, vault-aware entry points: they guarantee the underlying
// secret is materialized into process.env (from the vault, on demand) before
// the cached singleton is (re)built. Callers that already run in an async
// context and want a guaranteed-fresh value can await these; existing sync
// call sites keep working unchanged because the background prewarm (or an
// earlier boot load) has already populated the env.

/**
 * Ensure a single FRONTBASE_* secret is in process.env, materializing it from
 * the vault on demand if missing. No-op when already set or when the vault is
 * disabled/empty. Honors manual env precedence via loadLazySecret().
 */
async function materializeSecret(name: string): Promise<void> {
    if (process.env[name] !== undefined && process.env[name] !== '') return;
    const loaded = await loadLazySecret(name);
    if (loaded) process.env[name] = loaded;
}

/** Auth config — vault-aware async accessor (also refreshes the singleton). */
export async function getAuthConfigAsync(tenantSlug?: string): Promise<AuthConfig> {
    await materializeSecret('FRONTBASE_AUTH');
    // Drop the cached singleton so it re-parses from the (now populated) env.
    _authSingle = null;
    _authMap.clear();
    return getAuthConfig(tenantSlug);
}

/** API-keys config — vault-aware async accessor (also refreshes the singleton). */
export async function getApiKeysConfigAsync(): Promise<ApiKeysConfig> {
    await materializeSecret('FRONTBASE_API_KEYS');
    await materializeSecret('FRONTBASE_AUTH'); // legacy fallback source
    _apiKeys = null;
    return getApiKeysConfig();
}

/** Cache config — vault-aware async accessor (also refreshes the singleton). */
export async function getCacheConfigAsync(): Promise<CacheConfig> {
    await materializeSecret('FRONTBASE_CACHE');
    _cache = null;
    return getCacheConfig();
}

/** Queue config — vault-aware async accessor (also refreshes the singleton). */
export async function getQueueConfigAsync(): Promise<QueueConfig> {
    await materializeSecret('FRONTBASE_QUEUE');
    _queue = null;
    return getQueueConfig();
}

/** Vector config — vault-aware async accessor (also refreshes the singleton). */
export async function getVectorConfigAsync(): Promise<VectorConfig> {
    await materializeSecret('FRONTBASE_VECTOR');
    _vector = null;
    return getVectorConfig();
}

/** GPU models — vault-aware async accessor (also refreshes the singleton). */
export async function getGpuModelsAsync(): Promise<GpuModel[]> {
    await materializeSecret('FRONTBASE_GPU');
    _gpu = null;
    return getGpuModels();
}

/** Agent profiles — vault-aware async accessor (also refreshes the singleton). */
export async function getAgentProfilesConfigAsync(): Promise<AgentProfilesConfig> {
    await materializeSecret('FRONTBASE_AGENT_PROFILES');
    _agentProfiles = null;
    return getAgentProfilesConfig();
}

/** OCR config — vault-aware async accessor (also refreshes the singleton). */
export async function getOcrConfigAsync(): Promise<OcrConfig> {
    await materializeSecret('FRONTBASE_OCR');
    _ocr = null;
    return getOcrConfig();
}

/** Storage config — vault-aware async accessor (also refreshes the singleton). */
export async function getStorageConfigAsync(): Promise<StorageConfig> {
    await materializeSecret('FRONTBASE_STORAGE');
    _storage = null;
    return getStorageConfig();
}

/**
 * Materialize every Tier-2 secret from the vault into process.env in the
 * background, then force all lazy config singletons to re-parse.
 *
 * Called fire-and-forget right after the Tier-1 boot load so the engine serves
 * traffic without blocking on Tier-2 decrypts. Idempotent and best-effort: a
 * failure to load one secret is logged and skipped (the getter falls back to
 * its default, exactly as it would today if the env var were unset).
 *
 * @returns a small summary { loaded, failed } for logging/testing.
 */
export async function prewarmTier2(): Promise<{ loaded: number; failed: string[] }> {
    const names = [...TIER_2_SECRETS];
    let loaded = 0;
    const failed: string[] = [];
    for (const name of names) {
        try {
            await materializeSecret(name);
            if (process.env[name] !== undefined && process.env[name] !== '') {
                loaded++;
            }
        } catch (err) {
            failed.push(name);
            console.error(`[Prewarm] Failed to materialize '${name}':`, err);
        }
    }
    // Force every lazy config singleton to re-parse from the now-populated env.
    resetConfig('all');
    console.log(
        `[Prewarm] Tier-2 background load complete: ${loaded}/${names.length} materialized` +
            (failed.length ? `, failed: ${failed.join(', ')}` : ''),
    );
    return { loaded, failed };
}
