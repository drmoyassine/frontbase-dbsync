import {
  __esm
} from "./chunk-KFQGP6VL.js";

// src/resilience.ts
function getResilienceState() {
  return {
    ..._state,
    ttlMultiplier: _ttlMultiplier,
    cacheStats: { hits: _cacheHits, misses: _cacheMisses }
  };
}
function markComponent(component, level, reason) {
  const prev = _state[component];
  if (prev.level === level && prev.reason === reason) return;
  _state = {
    ..._state,
    [component]: { level, reason, since: (/* @__PURE__ */ new Date()).toISOString(), ops: prev.ops }
  };
  console.warn(`[Resilience] ${component} \u2192 ${level}${reason ? ` (${reason})` : ""}`);
}
function parseLimits(env) {
  if (!env) return { soft: Infinity, hard: Infinity };
  const n = parseInt(env, 10);
  if (Number.isFinite(n) && n > 0) return { soft: Math.floor(n * 0.8), hard: n };
  return { soft: Infinity, hard: Infinity };
}
function getTtlMultiplier() {
  return _ttlMultiplier;
}
function recordCacheHit() {
  _cacheHits++;
}
function recordCacheMiss() {
  _cacheMisses++;
}
function registerDowngraders(opts) {
  if (opts.stateDb) _downgradeStateDb = opts.stateDb;
  if (opts.cache) _downgradeCache = opts.cache;
}
function recordStateDbOp() {
  if (DB_LIMITS.hard === Infinity) return;
  _dbOps++;
  _state = { ..._state, stateDb: { ..._state.stateDb, ops: _dbOps } };
  if (_dbOps >= DB_LIMITS.hard && !_dbDowngraded) {
    _dbDowngraded = true;
    markComponent("stateDb", "down", `quota exhausted (~${_dbOps} ops)`);
    _downgradeStateDb?.();
  } else if (_dbOps >= DB_LIMITS.soft) {
    markComponent("stateDb", "degraded", `approaching quota (~${_dbOps} ops)`);
  }
}
function recordCacheOp() {
  if (CACHE_LIMITS.hard === Infinity) return;
  _cacheOps++;
  _state = { ..._state, cache: { ..._state.cache, ops: _cacheOps } };
  if (_cacheOps >= CACHE_LIMITS.hard && !_cacheDowngraded) {
    _cacheDowngraded = true;
    markComponent("cache", "down", `quota exhausted (~${_cacheOps} ops)`);
    _downgradeCache?.();
  } else if (_cacheOps >= CACHE_LIMITS.soft) {
    if (!_cacheTtlClamped) {
      _cacheTtlClamped = true;
      _ttlMultiplier = 0.5;
      console.warn("[Resilience] cache TTL clamped to 50% (soft quota threshold)");
    }
    markComponent("cache", "degraded", `approaching quota (~${_cacheOps} ops)`);
  }
}
var _state, DB_LIMITS, CACHE_LIMITS, _dbOps, _cacheOps, _dbDowngraded, _cacheDowngraded, _ttlMultiplier, _cacheTtlClamped, _cacheHits, _cacheMisses, _downgradeStateDb, _downgradeCache;
var init_resilience = __esm({
  "src/resilience.ts"() {
    "use strict";
    _state = {
      stateDb: { level: "ok" },
      cache: { level: "ok" }
    };
    DB_LIMITS = parseLimits(process.env.FRONTBASE_DB_LIMITS);
    CACHE_LIMITS = parseLimits(process.env.FRONTBASE_CACHE_LIMITS);
    _dbOps = 0;
    _cacheOps = 0;
    _dbDowngraded = false;
    _cacheDowngraded = false;
    _ttlMultiplier = 1;
    _cacheTtlClamped = false;
    _cacheHits = 0;
    _cacheMisses = 0;
    _downgradeStateDb = null;
    _downgradeCache = null;
  }
});

export {
  getResilienceState,
  getTtlMultiplier,
  recordCacheHit,
  recordCacheMiss,
  registerDowngraders,
  recordStateDbOp,
  recordCacheOp,
  init_resilience
};
