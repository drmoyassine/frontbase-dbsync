// src/cache/redis.ts
import { Redis as UpstashRedis } from "@upstash/redis";
var UpstashAdapter = class {
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
};
var IoRedisAdapter = class {
  client;
  initialized;
  constructor(url) {
    this.initialized = this.initClient(url);
  }
  async initClient(url) {
    try {
      const { default: IORedis } = await import("ioredis");
      this.client = new IORedis(url, {
        connectTimeout: 1e3,
        // 1 second timeout
        maxRetriesPerRequest: 1
      });
    } catch (error) {
      console.error("Failed to load ioredis. Ensure you are running in a Node.js environment for TCP connections.", error);
      throw error;
    }
  }
  async ensureClient() {
    await this.initialized;
    if (!this.client) throw new Error("Redis client not initialized");
  }
  async get(key) {
    await this.ensureClient();
    const value = await this.client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  async set(key, value) {
    await this.ensureClient();
    return this.client.set(key, value);
  }
  async setex(key, seconds, value) {
    await this.ensureClient();
    return this.client.setex(key, seconds, value);
  }
  async del(...keys) {
    await this.ensureClient();
    return this.client.del(...keys);
  }
  async keys(pattern) {
    await this.ensureClient();
    return this.client.keys(pattern);
  }
  async ping() {
    await this.ensureClient();
    return this.client.ping();
  }
  async lpush(key, ...elements) {
    await this.ensureClient();
    return this.client.lpush(key, ...elements);
  }
  async rpop(key) {
    await this.ensureClient();
    return this.client.rpop(key);
  }
  async llen(key) {
    await this.ensureClient();
    return this.client.llen(key);
  }
  async incr(key) {
    await this.ensureClient();
    return this.client.incr(key);
  }
  async expire(key, seconds) {
    await this.ensureClient();
    return this.client.expire(key, seconds);
  }
};
var redisInstance = null;
function initRedis(config) {
  if (config.url.startsWith("http")) {
    if (!config.token) {
      throw new Error("Redis Token is required for Upstash HTTP connection");
    }
    redisInstance = new UpstashAdapter(config.url, config.token);
  } else {
    redisInstance = new IoRedisAdapter(config.url);
  }
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

export {
  initRedis,
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
  testConnection
};
