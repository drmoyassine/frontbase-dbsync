# Redis Cache Module

A unified caching layer for the Frontbase Edge Engine using Redis.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Settings UI                             │
│        (Upstash Managed or Self-Hosted with SRH)            │
└─────────────────────────┬───────────────────────────────────┘
                          │ Saves to DB
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI Backend                             │
│              (ProjectSettings table)                         │
└─────────────────────────┬───────────────────────────────────┘
                          │ Syncs on startup
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Edge Engine                                │
│                                                              │
│  ┌─────────────┐    ┌─────────────────────────────────────┐ │
│  │ redis.ts    │───▶│ UpstashAdapter (HTTP) │ IoRedisAdapter (TCP) │
│  └─────────────┘    └─────────────────────────────────────┘ │
│                              │                               │
│                              ▼                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │               @upstash/redis or ioredis                 ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Files

| File | Description |
|------|-------------|
| `redis.ts` | Unified Redis client with Upstash (HTTP) and IoRedis (TCP) adapters |

## Adapters

### UpstashAdapter (HTTP)
- Used for: Upstash Cloud, Self-Hosted with SRH proxy
- URL format: `https://...` or `http://...`
- Requires: Token for authentication

### IoRedisAdapter (TCP)
- Used for: Direct Redis connections (development, self-hosted without SRH)
- URL format: `redis://...`
- Works in: Node.js environments only (not true Edge runtimes)

## Configuration

Redis is configured via the **Settings UI** → **Cache & Performance** tab:

1. **Upstash (Managed)**: Enter your Upstash REST URL and Token
2. **Self-Hosted (BYO)**: Deploy SRH proxy, enter proxy URL and Token

Settings are stored in the database and synced to Edge on startup.

## API

### Initialization
```typescript
import { initRedis, getRedis } from './redis.js';

// Initialize with config (done automatically on startup)
initRedis({ url: 'https://...', token: '...' });

// Get the client instance
const redis = getRedis();
```

### Caching
```typescript
import { cached, invalidate, invalidatePattern } from './redis.js';

// Cache function result
const data = await cached('my-key', async () => {
    return await fetchExpensiveData();
}, 60); // TTL in seconds

// Invalidate single key
await invalidate('my-key');

// Invalidate by pattern
await invalidatePattern('user:*');
```

### Queues
```typescript
import { enqueue, dequeue, queueLength } from './redis.js';

// Add to queue
await enqueue('jobs', { type: 'email', to: 'user@example.com' });

// Process queue
const job = await dequeue('jobs');

// Check queue length
const pending = await queueLength('jobs');
```

### Rate Limiting
```typescript
import { rateLimit } from './redis.js';

const { allowed, remaining } = await rateLimit('api:user123', 100, 60);
// 100 requests per 60 seconds
```

## Environment Variables (Fallback)

If Redis is not configured via UI, the Edge Engine falls back to these env vars:

```env
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

## Local Development

For local development, use the `serverless-redis-http` (SRH) proxy included in docker-compose:

```bash
docker-compose up -d redis redis-http
```

Then configure in Settings UI:
- URL: `http://localhost:8079`
- Token: `dev_token_change_in_prod`

## Integration Points

- **SSR Data Fetching** (`routes/data.ts`): Uses `cached()` wrapper for data requests
- **Cache API** (`routes/cache.ts`): OpenAPI endpoints for cache management
- **Startup Sync** (`startup/sync.ts`): Fetches Redis config from FastAPI on boot
