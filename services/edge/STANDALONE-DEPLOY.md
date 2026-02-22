# Frontbase Edge Node — Standalone Deployment

Deploy the Edge Engine independently, connecting to remote **Turso** (state DB) and **Upstash Redis** (L2 cache).

## Prerequisites

1. A **Turso** database — [turso.tech](https://turso.tech)
2. (Optional) An **Upstash Redis** instance — [upstash.com](https://upstash.com)
3. Docker installed on the host machine

## Quick Start

### 1. Create and initialize the Turso database

```bash
turso db create frontbase-edge
turso db shell frontbase-edge < turso-schema.sql
```

### 2. Get your credentials

```bash
turso db show frontbase-edge --url     # → TURSO_DB_URL
turso db tokens create frontbase-edge  # → TURSO_DB_TOKEN
```

### 3. Run with Docker

```bash
docker run -d \
  --name frontbase-edge \
  -e FRONTBASE_ENV=cloud \
  -e FRONTBASE_STATE_DB_URL=libsql://your-db.turso.io \
  -e FRONTBASE_STATE_DB_TOKEN=your-token \
  -e FRONTBASE_REDIS_URL=https://your-redis.upstash.io \
  -e FRONTBASE_REDIS_TOKEN=your-upstash-token \
  -p 3002:3002 \
  frontbase/edge-node:latest
```

Or use Docker Compose:

```bash
# Copy env vars
cp .env.example .env
# Edit .env with your Turso/Upstash credentials

docker-compose -f docker-compose.standalone-edge.yml up -d
```

### 4. Verify

```bash
curl http://localhost:3002/api/health
# → {"status":"ok","version":"..."}
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FRONTBASE_ENV` | Yes | `cloud` | Must be `cloud` for standalone |
| `FRONTBASE_STATE_DB_URL` | Yes | — | Turso database URL |
| `FRONTBASE_STATE_DB_TOKEN` | Yes | — | Turso auth token |
| `FRONTBASE_REDIS_URL` | No | — | Upstash Redis URL (for L2 cache) |
| `FRONTBASE_REDIS_TOKEN` | No | — | Upstash Redis token |
| `PORT` | No | `3002` | HTTP port |
| `PUBLIC_URL` | No | — | Public URL for link generation |

## How Pages Get Published

The standalone edge node does **not** run the backend. Pages are published by the Frontbase control plane, which writes directly to your Turso DB using `PUBLISH_STRATEGY=turso`.

```
Control Plane (FastAPI) → Turso DB ← Edge Node reads
```

## Multi-Region Deployment

Deploy multiple edge nodes in different regions, all pointing to the same Turso DB:

```bash
# US East
docker run -e FRONTBASE_STATE_DB_URL=libsql://your-db.turso.io ...

# EU West (same Turso DB, Turso handles global replication)
docker run -e FRONTBASE_STATE_DB_URL=libsql://your-db.turso.io ...
```

Turso supports edge replicas for low-latency reads in multi-region setups.

## Health Check

The edge node exposes `GET /api/health` for load balancer health checks.

## Building from Source

```bash
cd services/edge
docker build -f Dockerfile.standalone -t frontbase/edge-node .
```
