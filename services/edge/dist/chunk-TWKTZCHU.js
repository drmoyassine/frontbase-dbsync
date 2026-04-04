import {
  __esm,
  __export
} from "./chunk-KFQGP6VL.js";

// src/config/env.ts
var env_exports = {};
__export(env_exports, {
  getAuthConfig: () => getAuthConfig,
  getCacheConfig: () => getCacheConfig,
  getGpuModels: () => getGpuModels,
  getQueueConfig: () => getQueueConfig,
  getStateDbConfig: () => getStateDbConfig,
  overrideCacheConfig: () => overrideCacheConfig,
  overrideQueueConfig: () => overrideQueueConfig,
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
function getAuthConfig() {
  return _auth ??= parseEnv("FRONTBASE_AUTH", { provider: "none" });
}
function getCacheConfig() {
  return _cache ??= parseEnv("FRONTBASE_CACHE", { provider: "none" });
}
function getQueueConfig() {
  return _queue ??= parseEnv("FRONTBASE_QUEUE", { provider: "none" });
}
function getGpuModels() {
  return _gpu ??= parseEnv("FRONTBASE_GPU", []);
}
function resetConfig(key) {
  if (key === "stateDb" || key === "all") _stateDb = null;
  if (key === "auth" || key === "all") _auth = null;
  if (key === "cache" || key === "all") _cache = null;
  if (key === "queue" || key === "all") _queue = null;
  if (key === "gpu" || key === "all") _gpu = null;
}
function overrideCacheConfig(config) {
  _cache = config;
}
function overrideQueueConfig(config) {
  _queue = config;
}
var _stateDb, _auth, _cache, _queue, _gpu;
var init_env = __esm({
  "src/config/env.ts"() {
    _stateDb = null;
    _auth = null;
    _cache = null;
    _queue = null;
    _gpu = null;
  }
});

export {
  getStateDbConfig,
  getAuthConfig,
  getCacheConfig,
  getQueueConfig,
  getGpuModels,
  resetConfig,
  overrideCacheConfig,
  overrideQueueConfig,
  env_exports,
  init_env
};
