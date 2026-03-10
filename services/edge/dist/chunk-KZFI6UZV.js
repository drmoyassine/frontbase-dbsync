import {
  init_redis,
  redis_exports
} from "./chunk-2T6KJ3IO.js";
import {
  __toCommonJS
} from "./chunk-KFQGP6VL.js";

// src/cache/NullCacheProvider.ts
var NullCacheProvider = class {
  async get(_key) {
    return null;
  }
  async set(_key, _value) {
  }
  async setex(_key, _seconds, _value) {
  }
  async del(..._keys) {
    return 0;
  }
  async keys(_pattern) {
    return [];
  }
  async ping() {
    return "PONG (null-cache)";
  }
  // Queue ops
  async lpush(_key, ..._elements) {
    return 0;
  }
  async rpop(_key) {
    return null;
  }
  async llen(_key) {
    return 0;
  }
  // Rate limiting / concurrency — always allow
  async incr(_key) {
    return 1;
  }
  async decr(_key) {
    return 0;
  }
  async expire(_key, _seconds) {
    return 1;
  }
  // Sorted set (priority queue) — no-op
  async zadd(_key, _score, _member) {
    return 1;
  }
  async zpopmax(_key) {
    return null;
  }
};

// src/cache/index.ts
init_redis();
var _provider = null;
async function createInitialProvider() {
  const cacheUrl = process.env.FRONTBASE_CACHE_URL;
  const cacheToken = process.env.FRONTBASE_CACHE_TOKEN;
  if (cacheUrl && cacheUrl.startsWith("http") && cacheToken) {
    try {
      const { initRedis } = (init_redis(), __toCommonJS(redis_exports));
      console.log("\u{1F534} Cache: HTTP provider");
      return initRedis({ url: cacheUrl, token: cacheToken });
    } catch {
      console.warn("\u26A0\uFE0F Failed to init HTTP cache adapter, falling back to NullCache");
      return new NullCacheProvider();
    }
  }
  if (cacheUrl && !cacheUrl.startsWith("http")) {
    try {
      const { initRedisAsync } = (init_redis(), __toCommonJS(redis_exports));
      console.log("\u{1F534} Cache: IoRedis TCP provider");
      return await initRedisAsync({ url: cacheUrl });
    } catch {
      console.warn("\u26A0\uFE0F Failed to init IoRedis adapter, falling back to NullCache");
      return new NullCacheProvider();
    }
  }
  console.log("\u2B1C Cache: NullCacheProvider (no cache configured)");
  return new NullCacheProvider();
}
var _initPromise = null;
function getCacheProvider() {
  if (!_provider) {
    if (!_initPromise) {
      _initPromise = createInitialProvider().then((p) => {
        _provider = p;
        return p;
      });
    }
    return new NullCacheProvider();
  }
  return _provider;
}
var cacheProvider = new Proxy({}, {
  get(_target, prop) {
    const provider = getCacheProvider();
    const value = provider[prop];
    if (typeof value === "function") {
      return value.bind(provider);
    }
    return value;
  }
});

// src/engine/debounce.ts
async function shouldDebounce(workflowId, windowSeconds = 0) {
  if (windowSeconds <= 0) return false;
  try {
    const key = `wf:${workflowId}:debounce`;
    const existing = await cacheProvider.get(key);
    if (existing) {
      return true;
    }
    await cacheProvider.setex(key, windowSeconds, "1");
    return false;
  } catch {
    return false;
  }
}

export {
  cacheProvider,
  shouldDebounce
};
