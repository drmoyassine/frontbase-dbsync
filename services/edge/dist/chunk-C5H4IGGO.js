import {
  env_exports,
  getCacheConfig,
  init_env
} from "./chunk-YLQ7CKVG.js";
import {
  init_redis,
  redis_exports
} from "./chunk-2T6KJ3IO.js";
import {
  __esm,
  __export,
  __toCommonJS
} from "./chunk-KFQGP6VL.js";

// src/cache/DenoKvProvider.ts
var DenoKvProvider_exports = {};
__export(DenoKvProvider_exports, {
  DenoKvProvider: () => DenoKvProvider
});
var DenoKvProvider;
var init_DenoKvProvider = __esm({
  "src/cache/DenoKvProvider.ts"() {
    "use strict";
    DenoKvProvider = class {
      kvPromise;
      constructor() {
        this.kvPromise = Deno.openKv();
      }
      toKey(key) {
        return ["frontbase", "cache", key];
      }
      async get(key) {
        const kv = await this.kvPromise;
        const result = await kv.get(this.toKey(key));
        if (result.value === null) return null;
        try {
          return JSON.parse(result.value);
        } catch {
          return result.value;
        }
      }
      async set(key, value) {
        const kv = await this.kvPromise;
        await kv.set(this.toKey(key), value);
      }
      async setex(key, seconds, value) {
        const kv = await this.kvPromise;
        await kv.set(this.toKey(key), value, { expireIn: seconds * 1e3 });
      }
      async del(...keys) {
        const kv = await this.kvPromise;
        let count = 0;
        for (const key of keys) {
          await kv.delete(this.toKey(key));
          count++;
        }
        return count;
      }
      async keys(pattern) {
        const kv = await this.kvPromise;
        const results = [];
        const prefix = pattern.replace(/\*.*$/, "");
        for await (const entry of kv.list({ prefix: ["frontbase", "cache", ...prefix ? [prefix] : []] })) {
          const keyParts = entry.key;
          if (keyParts.length >= 3) {
            results.push(keyParts.slice(2).join(":"));
          }
        }
        return results;
      }
      async ping() {
        await this.kvPromise;
        return "PONG";
      }
      // ── Queue operations (list-based, using KV sorted keys) ──────────
      async lpush(key, ...elements) {
        const kv = await this.kvPromise;
        const listKey = ["frontbase", "queue", key];
        for (const el of elements) {
          const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          await kv.set([...listKey, id], el);
        }
        return elements.length;
      }
      async rpop(key) {
        const kv = await this.kvPromise;
        const listKey = ["frontbase", "queue", key];
        let oldest = null;
        for await (const entry of kv.list({ prefix: listKey })) {
          oldest = entry;
          break;
        }
        if (!oldest) return null;
        await kv.delete(oldest.key);
        return oldest.value;
      }
      async llen(key) {
        const kv = await this.kvPromise;
        const listKey = ["frontbase", "queue", key];
        let count = 0;
        for await (const _ of kv.list({ prefix: listKey })) {
          count++;
        }
        return count;
      }
      // ── Rate limiting ────────────────────────────────────────────────
      async incr(key) {
        const kv = await this.kvPromise;
        const k = this.toKey(key);
        const current = await kv.get(k);
        const newVal = (current.value ?? 0) + 1;
        await kv.set(k, newVal);
        return newVal;
      }
      async decr(key) {
        const kv = await this.kvPromise;
        const k = this.toKey(key);
        const current = await kv.get(k);
        const newVal = (current.value ?? 0) - 1;
        await kv.set(k, newVal);
        return newVal;
      }
      async expire(key, seconds) {
        const kv = await this.kvPromise;
        const k = this.toKey(key);
        const current = await kv.get(k);
        if (current.value === null) return 0;
        await kv.set(k, current.value, { expireIn: seconds * 1e3 });
        return 1;
      }
      // ── Sorted set (priority queue) ──────────────────────────────────
      async zadd(key, score, member) {
        const kv = await this.kvPromise;
        const zKey = ["frontbase", "zset", key, score.toString().padStart(15, "0"), member];
        await kv.set(zKey, member);
        return 1;
      }
      async zpopmax(key) {
        const kv = await this.kvPromise;
        const prefix = ["frontbase", "zset", key];
        let last = null;
        for await (const entry of kv.list({ prefix })) {
          last = entry;
        }
        if (!last) return null;
        await kv.delete(last.key);
        const keyParts = last.key;
        const score = parseFloat(keyParts[keyParts.length - 2]);
        return { member: last.value, score };
      }
    };
  }
});

// src/cache/CfKvHttpProvider.ts
var CfKvHttpProvider_exports = {};
__export(CfKvHttpProvider_exports, {
  CfKvHttpProvider: () => CfKvHttpProvider
});
function kvUrl(accountId, namespaceId, path) {
  return `${CF_API}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}${path}`;
}
function authHeaders(apiToken) {
  return {
    "Authorization": `Bearer ${apiToken}`
  };
}
var CF_API, CfKvHttpProvider;
var init_CfKvHttpProvider = __esm({
  "src/cache/CfKvHttpProvider.ts"() {
    "use strict";
    CF_API = "https://api.cloudflare.com/client/v4";
    CfKvHttpProvider = class {
      accountId = "";
      namespaceId = "";
      apiToken = "";
      ensureConfig() {
        if (this.accountId) return;
        const { getCacheConfig: getCacheConfig2 } = (init_env(), __toCommonJS(env_exports));
        const cfg = getCacheConfig2();
        const cacheUrl = cfg.url || "";
        this.apiToken = cfg.cfApiToken || "";
        this.accountId = cfg.cfAccountId || "";
        if (cacheUrl.startsWith("kv://")) {
          this.namespaceId = cacheUrl.replace("kv://", "");
        } else {
          this.namespaceId = cacheUrl;
        }
        if (!this.namespaceId || !this.apiToken || !this.accountId) {
          throw new Error(
            "[CfKvHttpProvider] Missing config in FRONTBASE_CACHE: url (kv://namespace-id), cfApiToken, cfAccountId"
          );
        }
        console.log(`\u{1F536} CfKvHttpProvider configured: KV ${this.namespaceId.substring(0, 8)}...`);
      }
      // =========================================================================
      // Core Key-Value Operations
      // =========================================================================
      async get(key) {
        this.ensureConfig();
        const url = kvUrl(this.accountId, this.namespaceId, `/values/${encodeURIComponent(key)}`);
        const resp = await fetch(url, {
          headers: authHeaders(this.apiToken)
        });
        if (resp.status === 404) return null;
        if (!resp.ok) {
          console.error(`[CfKvHttpProvider] GET ${key} failed: ${resp.status}`);
          return null;
        }
        const text = await resp.text();
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
      async set(key, value) {
        this.ensureConfig();
        const url = kvUrl(this.accountId, this.namespaceId, `/values/${encodeURIComponent(key)}`);
        const resp = await fetch(url, {
          method: "PUT",
          headers: {
            ...authHeaders(this.apiToken),
            "Content-Type": "text/plain"
          },
          body: value
        });
        if (!resp.ok) {
          const text = await resp.text();
          console.error(`[CfKvHttpProvider] SET ${key} failed: ${resp.status} ${text.substring(0, 200)}`);
        }
      }
      async setex(key, seconds, value) {
        this.ensureConfig();
        const url = kvUrl(
          this.accountId,
          this.namespaceId,
          `/values/${encodeURIComponent(key)}?expiration_ttl=${seconds}`
        );
        const resp = await fetch(url, {
          method: "PUT",
          headers: {
            ...authHeaders(this.apiToken),
            "Content-Type": "text/plain"
          },
          body: value
        });
        if (!resp.ok) {
          const text = await resp.text();
          console.error(`[CfKvHttpProvider] SETEX ${key} failed: ${resp.status} ${text.substring(0, 200)}`);
        }
      }
      async del(...keys) {
        this.ensureConfig();
        let deleted = 0;
        for (const key of keys) {
          const url = kvUrl(this.accountId, this.namespaceId, `/values/${encodeURIComponent(key)}`);
          const resp = await fetch(url, {
            method: "DELETE",
            headers: authHeaders(this.apiToken)
          });
          if (resp.ok) deleted++;
        }
        return deleted;
      }
      async keys(pattern) {
        this.ensureConfig();
        const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
        const url = kvUrl(
          this.accountId,
          this.namespaceId,
          `/keys?prefix=${encodeURIComponent(prefix)}&limit=1000`
        );
        const resp = await fetch(url, {
          headers: authHeaders(this.apiToken)
        });
        if (!resp.ok) return [];
        const data = await resp.json();
        const result = data?.result || [];
        return result.map((item) => item.name);
      }
      async ping() {
        this.ensureConfig();
        const url = kvUrl(this.accountId, this.namespaceId, "/keys?limit=1");
        const resp = await fetch(url, {
          headers: authHeaders(this.apiToken)
        });
        if (resp.ok) return "PONG (CF KV)";
        throw new Error(`[CfKvHttpProvider] Ping failed: ${resp.status}`);
      }
      // =========================================================================
      // Unsupported Operations (no-op — KV is not a data structure server)
      // =========================================================================
      async lpush(_key, ..._elements) {
        return 0;
      }
      async rpop(_key) {
        return null;
      }
      async llen(_key) {
        return 0;
      }
      async incr(_key) {
        return 1;
      }
      async decr(_key) {
        return 0;
      }
      async expire(_key, _seconds) {
        return 1;
      }
      async zadd(_key, _score, _member) {
        return 1;
      }
      async zpopmax(_key) {
        return null;
      }
    };
  }
});

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
init_env();
init_redis();
var _provider = null;
async function createInitialProvider() {
  const cfg = getCacheConfig();
  const cacheUrl = cfg.url;
  const cacheToken = cfg.token;
  const cacheProviderName = cfg.provider?.toLowerCase();
  if (cacheProviderName === "deno_kv") {
    try {
      const { DenoKvProvider: DenoKvProvider2 } = (init_DenoKvProvider(), __toCommonJS(DenoKvProvider_exports));
      console.log("\u{1F995} Cache: DenoKvProvider (Deno.openKv)");
      return new DenoKvProvider2();
    } catch (e) {
      console.warn(`\u26A0\uFE0F Failed to init Deno KV cache adapter: ${e.message}`);
      return new NullCacheProvider();
    }
  }
  if (cacheProviderName === "cloudflare" || cacheProviderName === "cloudflare_kv") {
    try {
      const { CfKvHttpProvider: CfKvHttpProvider2 } = (init_CfKvHttpProvider(), __toCommonJS(CfKvHttpProvider_exports));
      console.log("\u{1F536} Cache: CfKvHttpProvider (KV via HTTP)");
      return new CfKvHttpProvider2();
    } catch (e) {
      console.warn(`\u26A0\uFE0F Failed to init CF KV cache adapter: ${e.message}`);
      return new NullCacheProvider();
    }
  }
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
function setCacheProvider(provider) {
  _provider = provider;
  console.log("\u{1F504} Cache provider updated");
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

export {
  NullCacheProvider,
  getCacheProvider,
  setCacheProvider,
  cacheProvider
};
