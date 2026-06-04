import { getCacheConfig } from './env.js';

export interface SecurityConfig {
    ipBlocklist: Record<string, string[]>;  // tenant_slug → [ip strings]
    botProtection?: BotProtectionConfig;
}

export interface BotProtectionConfig {
    enabled: boolean;
    provider: 'cloudflare' | 'recaptcha_v2' | 'recaptcha_v3';
    siteKey: string;
    secretKey: string;
    protectLogin: boolean;
    protectForgotPassword: boolean;
}

// Module-level caches (L1)
let _securityConfig: SecurityConfig | null = null;
let _hasLoadedFromRedis = false;

function parseEnvSecurity(): SecurityConfig {
    try {
        const raw = process.env.FRONTBASE_SECURITY;
        if (!raw) return { ipBlocklist: {} };
        return JSON.parse(raw) as SecurityConfig;
    } catch (e) {
        console.warn(`[Config] Failed to parse FRONTBASE_SECURITY:`, (e as Error).message);
        return { ipBlocklist: {} };
    }
}

/** Get current security config with L1 (memory) and L3 (env) fallback */
export function getSecurityConfig(): SecurityConfig {
    if (_securityConfig) {
        return _securityConfig;
    }
    _securityConfig = parseEnvSecurity();
    return _securityConfig;
}

/** Get security config with optional async Redis loading (L2) */
export async function getSecurityConfigAsync(): Promise<SecurityConfig> {
    if (_securityConfig && _hasLoadedFromRedis) {
        return _securityConfig;
    }
    
    // Load from memory/env first
    const localConfig = getSecurityConfig();
    
    // Try to load from Redis L2 if Cache is configured
    const cacheCfg = getCacheConfig();
    if (cacheCfg && cacheCfg.provider !== 'none') {
        try {
            // Import redis client dynamically to avoid startup cycles
            const { get: redisGet } = await import('../cache/redis.js');
            const cached = await redisGet<SecurityConfig>('security:config');
            if (cached) {
                _securityConfig = cached;
                _hasLoadedFromRedis = true;
                return _securityConfig;
            }
        } catch (e) {
            console.warn('[SecurityConfig] Failed to load config from Redis:', (e as Error).message);
        }
    }
    
    _securityConfig = localConfig;
    return _securityConfig;
}

/** Update security config in memory and optionally persist to Redis */
export function updateSecurityConfig(config: SecurityConfig): void {
    _securityConfig = config;
    _hasLoadedFromRedis = false;
    
    // Non-blocking save to Redis if configured
    const cacheCfg = getCacheConfig();
    if (cacheCfg && cacheCfg.provider !== 'none') {
        import('../cache/redis.js').then(async ({ set: redisSet }) => {
            try {
                await redisSet('security:config', config);
                _hasLoadedFromRedis = true;
            } catch (e) {
                console.warn('[SecurityConfig] Failed to save config to Redis:', (e as Error).message);
            }
        }).catch(err => {
            console.warn('[SecurityConfig] Failed to import redis module:', err);
        });
    }
}

/** Get blocked IPs for a specific tenant */
export function getBlockedIps(tenantSlug?: string): string[] {
    const config = getSecurityConfig();
    const slug = tenantSlug || '_default';
    return config.ipBlocklist[slug] || [];
}

/** Get blocked IPs asynchronously with Redis lookup */
export async function getBlockedIpsAsync(tenantSlug?: string): Promise<string[]> {
    const config = await getSecurityConfigAsync();
    const slug = tenantSlug || '_default';
    return config.ipBlocklist[slug] || [];
}

/** Get bot protection configuration */
export function getBotProtection(): BotProtectionConfig | null {
    const config = getSecurityConfig();
    return config.botProtection || null;
}

/** Get bot protection configuration asynchronously */
export async function getBotProtectionAsync(): Promise<BotProtectionConfig | null> {
    const config = await getSecurityConfigAsync();
    return config.botProtection || null;
}
