import {
  getCacheConfig,
  init_env
} from "./chunk-5Y7X2AYA.js";

// src/config/securityConfig.ts
init_env();
var _securityConfig = null;
var _hasLoadedFromRedis = false;
function parseEnvSecurity() {
  try {
    const raw = process.env.FRONTBASE_SECURITY;
    if (!raw) return { ipBlocklist: {} };
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[Config] Failed to parse FRONTBASE_SECURITY:`, e.message);
    return { ipBlocklist: {} };
  }
}
function getSecurityConfig() {
  if (_securityConfig) {
    return _securityConfig;
  }
  _securityConfig = parseEnvSecurity();
  return _securityConfig;
}
async function getSecurityConfigAsync() {
  if (_securityConfig && _hasLoadedFromRedis) {
    return _securityConfig;
  }
  const localConfig = getSecurityConfig();
  const cacheCfg = getCacheConfig();
  if (cacheCfg && cacheCfg.provider !== "none") {
    try {
      const { get: redisGet } = await import("./redis-ISXX7Q6Q.js");
      const cached = await redisGet("security:config");
      if (cached) {
        _securityConfig = cached;
        _hasLoadedFromRedis = true;
        return _securityConfig;
      }
    } catch (e) {
      console.warn("[SecurityConfig] Failed to load config from Redis:", e.message);
    }
  }
  _securityConfig = localConfig;
  return _securityConfig;
}
function updateSecurityConfig(config) {
  _securityConfig = config;
  _hasLoadedFromRedis = false;
  const cacheCfg = getCacheConfig();
  if (cacheCfg && cacheCfg.provider !== "none") {
    import("./redis-ISXX7Q6Q.js").then(async ({ set: redisSet }) => {
      try {
        await redisSet("security:config", config);
        _hasLoadedFromRedis = true;
      } catch (e) {
        console.warn("[SecurityConfig] Failed to save config to Redis:", e.message);
      }
    }).catch((err) => {
      console.warn("[SecurityConfig] Failed to import redis module:", err);
    });
  }
}
function getBlockedIps(tenantSlug) {
  const config = getSecurityConfig();
  const slug = tenantSlug || "_default";
  return config.ipBlocklist[slug] || [];
}
async function getBlockedIpsAsync(tenantSlug) {
  const config = await getSecurityConfigAsync();
  const slug = tenantSlug || "_default";
  return config.ipBlocklist[slug] || [];
}
function getBotProtection() {
  const config = getSecurityConfig();
  return config.botProtection || null;
}
async function getBotProtectionAsync() {
  const config = await getSecurityConfigAsync();
  return config.botProtection || null;
}

export {
  getSecurityConfig,
  getSecurityConfigAsync,
  updateSecurityConfig,
  getBlockedIps,
  getBlockedIpsAsync,
  getBotProtection,
  getBotProtectionAsync
};
