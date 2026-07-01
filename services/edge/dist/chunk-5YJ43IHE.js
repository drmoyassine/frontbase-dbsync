import {
  __esm,
  __export
} from "./chunk-KFQGP6VL.js";

// src/config/env.ts
var env_exports = {};
__export(env_exports, {
  TIER_1_SECRETS: () => TIER_1_SECRETS,
  TIER_2_SECRETS: () => TIER_2_SECRETS,
  TIER_3_SECRETS: () => TIER_3_SECRETS,
  clearLazySecretCache: () => clearLazySecretCache,
  getAgentProfilesConfig: () => getAgentProfilesConfig,
  getAgentProfilesConfigAsync: () => getAgentProfilesConfigAsync,
  getApiKeysConfig: () => getApiKeysConfig,
  getApiKeysConfigAsync: () => getApiKeysConfigAsync,
  getApiKeysConfigSync: () => getApiKeysConfigSync,
  getAuthConfig: () => getAuthConfig,
  getAuthConfigAsync: () => getAuthConfigAsync,
  getCacheConfig: () => getCacheConfig,
  getCacheConfigAsync: () => getCacheConfigAsync,
  getGpuModels: () => getGpuModels,
  getGpuModelsAsync: () => getGpuModelsAsync,
  getOcrConfig: () => getOcrConfig,
  getOcrConfigAsync: () => getOcrConfigAsync,
  getQueueConfig: () => getQueueConfig,
  getQueueConfigAsync: () => getQueueConfigAsync,
  getSecretTier: () => getSecretTier,
  getStateDbConfig: () => getStateDbConfig,
  getStorageConfig: () => getStorageConfig,
  getStorageConfigAsync: () => getStorageConfigAsync,
  getVectorConfig: () => getVectorConfig,
  getVectorConfigAsync: () => getVectorConfigAsync,
  loadLazySecret: () => loadLazySecret,
  overrideApiKeysConfig: () => overrideApiKeysConfig,
  overrideCacheConfig: () => overrideCacheConfig,
  overrideOcrConfig: () => overrideOcrConfig,
  overrideQueueConfig: () => overrideQueueConfig,
  overrideStorageConfig: () => overrideStorageConfig,
  overrideVectorConfig: () => overrideVectorConfig,
  prewarmTier2: () => prewarmTier2,
  resetConfig: () => resetConfig
});
function parseEnv(key, fallback) {
  try {
    const raw = process.env[key];
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[Config] Failed to parse ${key}:`, e.message);
    return fallback;
  }
}
function getStateDbConfig() {
  return _stateDb ??= parseEnv("FRONTBASE_STATE_DB", { provider: "local" });
}
function getAuthConfig(tenantSlug) {
  const key = tenantSlug || "_default";
  if (_authMap.has(key)) {
    return _authMap.get(key);
  }
  if (_authSingle) {
    return _authSingle;
  }
  const parsed = parseEnv("FRONTBASE_AUTH", { provider: "none" });
  if (parsed && typeof parsed === "object" && !("provider" in parsed)) {
    for (const [slug, cfg] of Object.entries(parsed)) {
      _authMap.set(slug, cfg);
    }
    const res = _authMap.get(key) || _authMap.get("_default") || { provider: "none" };
    return res;
  } else {
    _authSingle = parsed;
    return _authSingle;
  }
}
function getApiKeysConfig() {
  if (!_apiKeys) {
    const fresh = parseEnv("FRONTBASE_API_KEYS", {});
    const legacyAuth = getAuthConfig();
    _apiKeys = {
      systemKey: fresh.systemKey || legacyAuth.systemKey,
      apiKeyHashes: fresh.apiKeyHashes || legacyAuth.apiKeyHashes
    };
  }
  return _apiKeys;
}
function getApiKeysConfigSync() {
  return _apiKeys;
}
function getCacheConfig() {
  return _cache ??= parseEnv("FRONTBASE_CACHE", { provider: "none" });
}
function getQueueConfig() {
  return _queue ??= parseEnv("FRONTBASE_QUEUE", { provider: "none" });
}
function getVectorConfig() {
  return _vector ??= parseEnv("FRONTBASE_VECTOR", { provider: "none" });
}
function getGpuModels() {
  return _gpu ??= parseEnv("FRONTBASE_GPU", []);
}
function getOcrConfig() {
  if (_ocr) return _ocr;
  const config = parseEnv("FRONTBASE_OCR", { engine: "ocrspace" });
  if (config.endpoint) {
    return _ocr = config;
  }
  const dockerEngine = process.env.OCR_ENGINE?.toLowerCase();
  if (dockerEngine === "tesseract" || dockerEngine === "gnu_ocrad") {
    return _ocr = { ...config, engine: dockerEngine };
  }
  return _ocr = config;
}
function getStorageConfig() {
  return _storage ??= parseEnv("FRONTBASE_STORAGE", { provider: "supabase" });
}
function getAgentProfilesConfig() {
  return _agentProfiles ??= parseEnv("FRONTBASE_AGENT_PROFILES", {});
}
function resetConfig(key) {
  if (key === "stateDb" || key === "all") _stateDb = null;
  if (key === "auth" || key === "all") {
    _authSingle = null;
    _authMap.clear();
  }
  if (key === "apiKeys" || key === "all") _apiKeys = null;
  if (key === "cache" || key === "all") _cache = null;
  if (key === "queue" || key === "all") _queue = null;
  if (key === "vector" || key === "all") _vector = null;
  if (key === "storage" || key === "all") _storage = null;
  if (key === "ocr" || key === "all") _ocr = null;
  if (key === "gpu" || key === "all") _gpu = null;
  if (key === "agentProfiles" || key === "all") _agentProfiles = null;
}
function overrideCacheConfig(config) {
  _cache = config;
}
function overrideQueueConfig(config) {
  _queue = config;
}
function overrideVectorConfig(config) {
  _vector = config;
}
function overrideApiKeysConfig(config) {
  _apiKeys = config;
}
function overrideOcrConfig(config) {
  _ocr = config;
}
function overrideStorageConfig(config) {
  _storage = config;
}
function getSecretTier(name) {
  if (TIER_1_SECRETS.has(name)) return 1;
  if (TIER_3_SECRETS.has(name)) return 3;
  return 2;
}
function clearLazySecretCache() {
  _lazySecretCache.clear();
}
async function loadLazySecret(name) {
  if (process.env[name] !== void 0 && process.env[name] !== "") {
    return process.env[name];
  }
  if (_lazySecretCache.has(name)) {
    return _lazySecretCache.get(name);
  }
  try {
    const { stateProvider } = await import("./storage-XY65Z4YO.js");
    const { getVaultSystemKey, decryptSecret } = await import("./edgeSecrets-OXDV32FC.js");
    const systemKey = getVaultSystemKey();
    if (!systemKey || typeof stateProvider.getEdgeSecret !== "function") {
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
async function materializeSecret(name) {
  if (process.env[name] !== void 0 && process.env[name] !== "") return;
  const loaded = await loadLazySecret(name);
  if (loaded) process.env[name] = loaded;
}
async function getAuthConfigAsync(tenantSlug) {
  await materializeSecret("FRONTBASE_AUTH");
  _authSingle = null;
  _authMap.clear();
  return getAuthConfig(tenantSlug);
}
async function getApiKeysConfigAsync() {
  await materializeSecret("FRONTBASE_API_KEYS");
  await materializeSecret("FRONTBASE_AUTH");
  _apiKeys = null;
  return getApiKeysConfig();
}
async function getCacheConfigAsync() {
  await materializeSecret("FRONTBASE_CACHE");
  _cache = null;
  return getCacheConfig();
}
async function getQueueConfigAsync() {
  await materializeSecret("FRONTBASE_QUEUE");
  _queue = null;
  return getQueueConfig();
}
async function getVectorConfigAsync() {
  await materializeSecret("FRONTBASE_VECTOR");
  _vector = null;
  return getVectorConfig();
}
async function getGpuModelsAsync() {
  await materializeSecret("FRONTBASE_GPU");
  _gpu = null;
  return getGpuModels();
}
async function getAgentProfilesConfigAsync() {
  await materializeSecret("FRONTBASE_AGENT_PROFILES");
  _agentProfiles = null;
  return getAgentProfilesConfig();
}
async function getOcrConfigAsync() {
  await materializeSecret("FRONTBASE_OCR");
  _ocr = null;
  return getOcrConfig();
}
async function getStorageConfigAsync() {
  await materializeSecret("FRONTBASE_STORAGE");
  _storage = null;
  return getStorageConfig();
}
async function prewarmTier2() {
  const names = [...TIER_2_SECRETS];
  let loaded = 0;
  const failed = [];
  for (const name of names) {
    try {
      await materializeSecret(name);
      if (process.env[name] !== void 0 && process.env[name] !== "") {
        loaded++;
      }
    } catch (err) {
      failed.push(name);
      console.error(`[Prewarm] Failed to materialize '${name}':`, err);
    }
  }
  resetConfig("all");
  console.log(
    `[Prewarm] Tier-2 background load complete: ${loaded}/${names.length} materialized` + (failed.length ? `, failed: ${failed.join(", ")}` : "")
  );
  return { loaded, failed };
}
var _stateDb, _authMap, _authSingle, _apiKeys, _cache, _queue, _vector, _storage, _ocr, _gpu, _agentProfiles, TIER_1_SECRETS, TIER_2_SECRETS, TIER_3_SECRETS, _lazySecretCache;
var init_env = __esm({
  "src/config/env.ts"() {
    _stateDb = null;
    _authMap = /* @__PURE__ */ new Map();
    _authSingle = null;
    _apiKeys = null;
    _cache = null;
    _queue = null;
    _vector = null;
    _storage = null;
    _ocr = null;
    _gpu = null;
    _agentProfiles = null;
    TIER_1_SECRETS = /* @__PURE__ */ new Set([
      "FRONTBASE_DATASOURCES",
      "FRONTBASE_STORAGE",
      "FRONTBASE_CACHE",
      "FRONTBASE_QUEUE",
      "FRONTBASE_SECRETS_KEY",
      "FRONTBASE_SECRETS_KEY_OLD"
    ]);
    TIER_2_SECRETS = /* @__PURE__ */ new Set([
      "FRONTBASE_AUTH",
      "FRONTBASE_API_KEYS",
      "FRONTBASE_SECURITY",
      "FRONTBASE_AGENT_PROFILES",
      "FRONTBASE_VECTOR",
      "FRONTBASE_GPU",
      "FRONTBASE_OCR"
    ]);
    TIER_3_SECRETS = /* @__PURE__ */ new Set([
      "FRONTBASE_STATE_DB"
    ]);
    _lazySecretCache = /* @__PURE__ */ new Map();
  }
});

export {
  getStateDbConfig,
  getAuthConfig,
  getApiKeysConfig,
  getApiKeysConfigSync,
  getCacheConfig,
  getQueueConfig,
  getVectorConfig,
  getGpuModels,
  getOcrConfig,
  getStorageConfig,
  getAgentProfilesConfig,
  resetConfig,
  overrideCacheConfig,
  overrideQueueConfig,
  overrideVectorConfig,
  overrideApiKeysConfig,
  overrideOcrConfig,
  overrideStorageConfig,
  TIER_1_SECRETS,
  TIER_2_SECRETS,
  TIER_3_SECRETS,
  getSecretTier,
  clearLazySecretCache,
  loadLazySecret,
  getAuthConfigAsync,
  getApiKeysConfigAsync,
  getCacheConfigAsync,
  getQueueConfigAsync,
  getVectorConfigAsync,
  getGpuModelsAsync,
  getAgentProfilesConfigAsync,
  getOcrConfigAsync,
  getStorageConfigAsync,
  prewarmTier2,
  env_exports,
  init_env
};
