# Redis Architecture Guide

**Last Updated:** 2026-01-18

This is the consolidated, authoritative reference for Redis caching in Frontbase. It combines the original analysis, architecture design, and implementation details into a single document.

---

## Overview

Frontbase uses a **Flexible Unified HTTP-First** Redis strategy that works across all environments (local Docker, VPS, Cloudflare Workers).

| Principle | Description |
|-----------|-------------|
| **Single Source of Truth** | UI Settings → SQLite database → Synced to Edge at startup |
| **HTTP Everywhere** | `@upstash/redis` SDK for both Upstash Cloud and local SRH proxy |
| **Zero Trust Runtime** | User data never passes through Frontbase servers |

---

## Architecture Diagram

```mermaid
graph TD
    subgraph "Admin / Studio"
        UI[Settings UI<br/>Two-Path Selector] -->|Saves| API[FastAPI Backend]
        API -->|Persists| DB[(SQLite<br/>ProjectSettings)]
    end

    subgraph "Infrastructure"
        SRH[serverless-redis-http<br/>Local Dev Proxy]
        Upstash[Upstash Redis<br/>Production]
        LocalRedis[(Local Redis<br/>Docker)]
    end

    subgraph "Runtime"
        DB -.->|Sync on Startup| Edge[Edge Engine]
        Edge -->|HTTP| Upstash
        Edge -->|HTTP| SRH
        SRH -->|TCP| LocalRedis
    end
```

---

## Service Roles

| Service | Purpose | Redis Usage |
|---------|---------|-------------|
| **Edge Engine** | SSR pages, public runtime | ✅ Active caching via `cached<T>()` |
| **FastAPI Backend** | Admin UI, config storage | ⚠️ Test Connection only (future: schema/API cache) |

---

## Configuration

### Two-Path Selector (Settings UI)

1. **Upstash (Managed)**: Enter REST URL + Token from Upstash Console
2. **Self-Hosted (BYO)**: Deploy SRH proxy, enter proxy URL + Token

### Environment Mapping

| Environment | Backend Context | Redis URL |
|-------------|-----------------|-----------|
| Local Dev (uvicorn standalone) | Windows host | `http://localhost:8079` |
| Local Dev (docker compose) | Docker network | `http://redis-http:80` |
| VPS / Cloud | Docker network | `http://redis-http:80` |
| Production Edge | Internet | `https://...upstash.io` |

### Pre-seeded Defaults (Docker)
Alembic migrations auto-configure:
- `redis_url`: `http://redis-http:80`
- `redis_token`: `dev_token_change_in_prod`
- `redis_type`: `self-hosted`
- `redis_enabled`: `true`

---

## Caching Layers

```
┌─ L1: React Query (Browser) ─────────────┐
│  Per-user, ~5 min staleTime             │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─ L2: Edge Redis (Server) ───────────────┐
│  Shared across users, configurable TTL  │
│  Uses: cached<T>(key, fn, ttl)          │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─ L3: External Datasource ───────────────┐
│  Supabase / MySQL / WordPress API       │
└─────────────────────────────────────────┘
```

---

## Key APIs

### Edge Engine (`redis.ts`)

```typescript
// Polymorphic adapter (auto-selects HTTP or TCP)
await initRedis({ url, token, type });

// Cache wrapper for SSR data
const data = await cached<T>('cache-key', fetchFn, ttl);

// Manual operations
await getRedis().set('key', value);
await getRedis().get<T>('key');
```

### FastAPI Backend (`redis_client.py`)

```python
# Test connection (Settings UI)
success, msg = await test_redis_connection(url, token, type)

# Future: Schema/API caching
await cache_set(redis_url, key, value, ttl)
result = await cache_get(redis_url, key)
```

---

## Startup Flow

```
1. Docker starts → redis → redis-http → backend → edge
2. Backend runs Alembic migrations (pre-seeds defaults)
3. Edge boots → syncRedisSettingsFromFastAPI()
4. Edge calls /api/sync/settings/redis/
5. Edge initializes UpstashAdapter with config
6. SSR requests use cached() wrapper
```

---

## Troubleshooting

### Common Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `ECONNREFUSED` | Backend not ready when Edge syncs | Retry logic handles this; check `depends_on` |
| `getaddrinfo failed` | Using `redis-http` from host machine | Use `localhost:8079` for host, `redis-http:80` for Docker |
| `NOT NULL constraint` | Migration INSERT missing columns | Fixed in 0005 (adds UUID + timestamp) |
| `307 Redirect` | Missing trailing slash on API calls | Always use `/api/.../endpoint/` with slash |

### Verify SRH Connectivity (PowerShell)

```powershell
$headers = @{ "Authorization" = "Bearer dev_token_change_in_prod" }
$body = '["PING"]'
Invoke-RestMethod -Uri "http://127.0.0.1:8079/" -Method POST -Headers $headers -Body $body -ContentType "application/json"
# Expected: { "result": "PONG" }
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `services/edge/src/cache/redis.ts` | Polymorphic Redis client |
| `services/edge/src/cache/README.md` | Detailed cache module docs |
| `services/edge/src/startup/sync.ts` | Config hydration on boot |
| `services/edge/src/routes/data.ts` | SSR caching integration |
| `fastapi-backend/app/services/sync/redis_client.py` | Backend Redis helpers |
| `fastapi-backend/app/services/sync/routers/settings.py` | Settings API endpoints |
| `fastapi-backend/alembic/versions/0003-0006` | Schema + pre-seed migrations |
| `src/components/dashboard/SettingsPanel.tsx` | Two-path selector UI |

---

## Future Work (Post-MVP)

- [ ] **Backend Redis Caching**: Wire `cache_get/set` to schema discovery and external APIs (WordPress, etc.)
- [ ] **Rate Limiting**: Protect public endpoints
- [ ] **Queue Support**: Async job processing via Redis lists
