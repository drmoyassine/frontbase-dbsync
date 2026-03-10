import {
  __esm,
  __export
} from "./chunk-KFQGP6VL.js";

// src/cache/redis.ts
var redis_exports = {};
__export(redis_exports, {
  UpstashAdapter: () => UpstashAdapter,
  cached: () => cached,
  dequeue: () => dequeue,
  enqueue: () => enqueue,
  get: () => get,
  getRedis: () => getRedis,
  initRedis: () => initRedis,
  initRedisAsync: () => initRedisAsync,
  invalidate: () => invalidate,
  invalidatePattern: () => invalidatePattern,
  queueLength: () => queueLength,
  rateLimit: () => rateLimit,
  set: () => set,
  testConnection: () => testConnection
});
import { Redis as UpstashRedis } from "@upstash/redis";
function initRedis(config) {
  if (config.url.startsWith("http")) {
    if (!config.token) {
      throw new Error("Redis Token is required for Upstash HTTP connection");
    }
    redisInstance = new UpstashAdapter(config.url, config.token);
  } else {
    throw new Error("TCP Redis (redis://) requires initRedisAsync(). Use initRedisAsync() for non-HTTP URLs.");
  }
  return redisInstance;
}
async function initRedisAsync(config) {
  if (config.url.startsWith("http")) {
    return initRedis(config);
  }
  const { IoRedisAdapter } = await import("./ioredis-adapter-T3ADOFR6.js");
  redisInstance = new IoRedisAdapter(config.url);
  return redisInstance;
}
function getRedis() {
  if (!redisInstance) {
    throw new Error("Redis not initialized. Call initRedis() first.");
  }
  return redisInstance;
}
async function cached(key, fn, ttlSeconds = 60) {
  try {
    const redis = getRedis();
    const cachedValue = await redis.get(key);
    if (cachedValue !== null) {
      return cachedValue;
    }
    const result = await fn();
    await redis.setex(key, ttlSeconds, JSON.stringify(result));
    return result;
  } catch {
    return fn();
  }
}
async function invalidate(key) {
  const redis = getRedis();
  await redis.del(key);
}
async function invalidatePattern(pattern) {
  const redis = getRedis();
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
async function set(key, value, ttlSeconds) {
  const redis = getRedis();
  const stringValue = JSON.stringify(value);
  if (ttlSeconds) {
    await redis.setex(key, ttlSeconds, stringValue);
  } else {
    await redis.set(key, stringValue);
  }
}
async function get(key) {
  const redis = getRedis();
  return redis.get(key);
}
async function enqueue(queue, data) {
  const redis = getRedis();
  await redis.lpush(queue, JSON.stringify(data));
}
async function dequeue(queue) {
  const redis = getRedis();
  const item = await redis.rpop(queue);
  return item ? JSON.parse(item) : null;
}
async function queueLength(queue) {
  const redis = getRedis();
  return redis.llen(queue);
}
async function rateLimit(key, limit, windowSeconds) {
  const redis = getRedis();
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, windowSeconds);
  }
  return {
    allowed: current <= limit,
    remaining: Math.max(0, limit - current)
  };
}
async function testConnection() {
  try {
    const redis = getRedis();
    await redis.ping();
    return { success: true, message: "Redis connection successful" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed"
    };
  }
}
var UpstashAdapter, redisInstance;
var init_redis = __esm({
  "src/cache/redis.ts"() {
    UpstashAdapter = class {
      client;
      constructor(url, token) {
        this.client = new UpstashRedis({ url, token });
      }
      async get(key) {
        return this.client.get(key);
      }
      async set(key, value) {
        return this.client.set(key, value);
      }
      async setex(key, seconds, value) {
        return this.client.setex(key, seconds, value);
      }
      async del(...keys) {
        return this.client.del(...keys);
      }
      async keys(pattern) {
        return this.client.keys(pattern);
      }
      async ping() {
        return this.client.ping();
      }
      async lpush(key, ...elements) {
        return this.client.lpush(key, ...elements);
      }
      async rpop(key) {
        return this.client.rpop(key);
      }
      async llen(key) {
        return this.client.llen(key);
      }
      async incr(key) {
        return this.client.incr(key);
      }
      async expire(key, seconds) {
        return this.client.expire(key, seconds);
      }
      async decr(key) {
        return this.client.decr(key);
      }
      async zadd(key, score, member) {
        const result = await this.client.zadd(key, { score, member });
        return result ?? 0;
      }
      async zpopmax(key) {
        const result = await this.client.zpopmax(key, 1);
        if (!result || result.length === 0) return null;
        const first = result[0];
        if (first && typeof first === "object" && "member" in first) {
          return { member: first.member, score: first.score };
        }
        return null;
      }
    };
    redisInstance = null;
  }
});

export {
  UpstashAdapter,
  initRedis,
  initRedisAsync,
  getRedis,
  cached,
  invalidate,
  invalidatePattern,
  set,
  get,
  enqueue,
  dequeue,
  queueLength,
  rateLimit,
  testConnection,
  redis_exports,
  init_redis
};
