import {
  __esm
} from "./chunk-KFQGP6VL.js";

// src/cache/ioredis-adapter.ts
var IoRedisAdapter;
var init_ioredis_adapter = __esm({
  "src/cache/ioredis-adapter.ts"() {
    IoRedisAdapter = class {
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
      async decr(key) {
        await this.ensureClient();
        return this.client.decr(key);
      }
      async zadd(key, score, member) {
        await this.ensureClient();
        return this.client.zadd(key, score, member);
      }
      async zpopmax(key) {
        await this.ensureClient();
        const result = await this.client.zpopmax(key, 1);
        if (!result || result.length < 2) return null;
        return { member: result[0], score: parseFloat(result[1]) };
      }
    };
  }
});
init_ioredis_adapter();
export {
  IoRedisAdapter
};
