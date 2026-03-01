# Frontbase Architecture

> Last Updated: 2026-03-02

Frontbase is an open-source, edge-native platform for deploying AI-powered apps and edge services with no-code. The system consists of three main components:

- **Frontend:** React 18, Vite, Tailwind, Zustand (Visual page builder & admin dashboard)
- **Backend:** FastAPI, SQLAlchemy, Alembic (API, design-time operations, publishing)
- **Edge Engine:** Hono, Drizzle ORM (Runtime SSR, workflows, self-sufficient)

## Core Philosophy

The architecture separates two distinct planes:
- **Control Plane:** Where users *build* their apps (FastAPI, Builder SPA, Central Postgres/SQLite).
- **Execution Plane:** Where visitors *access* the published apps (Hono Edge Engine + Edge State DB + Cache).

Frontbase acts as the **orchestration layer** only. It guides users through an setup to connect their own Turso and Upstash accounts. The FastAPI backend orchestrates publishing operations across these user-connected services.

---

## 1. Edge Delivery Architecture

A single Hono-based codebase (`services/edge`) supports four distinct deployment modes.

### 1.1 Cloud (SaaS) — Bring Your Own Edge (BYOE)
Targeted at SaaS customers wanting infinite scalability with zero self-managed infrastructure.
- **Control Plane (Frontbase Managed):** Hosted Builder SPA, FastAPI Backend, Central Postgres (for drafts, billing, workspaces).
- **User-Connected Infrastructure:** Turso DB (Source of Truth for Edge State) and Upstash Redis (Cache/Buffer). Connect via OAuth/Strings.
- **Execution Plane (User Managed):** Stateless Hono Edge Engine deployed to Vercel/Cloudflare/Netlify.
- **Publishing Pipeline:** FastAPI compiles the canvas, pushes SQL to Turso, and invalidates/primes Upstash Redis. Edge Engine serves traffic by reading from Redis (L2) or Turso (L3).

### 1.2 Self-Hosted — All-In-One Docker
Targeted at privacy-focused users. Everything runs via `docker-compose.yml`.
- **Publishing Pipeline:** FastAPI compiles canvas state and writes to a local `pages.db` on a shared Docker volume. The Hono Edge Container reads `pages.db` directly from disk.
- **Adapter Pattern:** Edge Engine selects `LocalSqliteProvider` via `FRONTBASE_DEPLOYMENT_MODE=local`.

### 1.3 Standalone Edge Node
Targeted at advanced users wanting sovereign compute but using Frontbase's Builder.
- **Architecture:** User deploys the `frontbase/edge-node` Docker image anywhere (Kubernetes, AWS Fargate).
- **Publishing:** Frontbase publishes to remote Turso/Upstash. The user's self-managed Edge nodes automatically sync and serve the output.

### 1.4 Distributed Self-Hosted
Targeted at operators splitting services across separate machines for scaling.
- Each service (`frontbase/backend`, `frontbase/frontend`, `frontbase/edge`, `frontbase/postgres`, `frontbase/redis`) runs independently.
- **Environment Variables:** Dependency URLs (`BACKEND_URL`, `EDGE_URL`, `FRONTBASE_STATE_DB_URL`) link services across the network securely.

---

## 2. Redis Caching & State Strategy

Frontbase uses a **Flexible Unified HTTP-First** Redis strategy that works across all environments (local Docker, VPS, Cloudflare Workers).

### 2.1 The Two-Path Selector
1. **Upstash (Managed):** REST URL + Token from Upstash Console.
2. **Self-Hosted (BYO):** Requires `serverless-redis-http` (SRH) proxy, which exposes a REST API mirroring Upstash.

### 2.2 Caching Layers
``` text
┌─ L1: React Query (Browser) ─────────────┐
│  Per-user, ~5 min staleTime             │
└─────────────────────────────────────────┘
                    ▼
┌─ L2: Edge Redis (Server) ───────────────┐
│  Shared across users, configurable TTL  │
│  Uses: cached<T>(key, fn, ttl)          │
└─────────────────────────────────────────┘
                    ▼
┌─ L3: External Datasource ───────────────┐
│  Turso / Supabase / Postgres / APIs     │
└─────────────────────────────────────────┘
```

> **Golden Rule:** Writes always persist to Turso (directly or via Redis buffer flush). Reads try Redis first, fall back to Turso on cache miss. Redis is 100% disposable. Should the Redis cache be completely flushed, the system will re-warm from Turso instantly with zero data loss.

---

## 3. Workflow Automation Data Architecture

Turso and Upstash work together seamlessly to power the workflow automation engine (`/api/execute`, `/api/webhook` routes).

### 3.1 Turso: Source of Truth
Stores all **permanent** workflow data:
- Workflow definitions (nodes, edges, config).
- Execution history (audit trails).
- Permanent counters (total successes/failures).
- Rate limit rules.

### 3.2 Upstash: Ephemeral Buffer & Fast State
Handles all **time-sensitive, high-frequency, or disposable** workflow state:
- **Execution Buffering:** Buffers node results as the workflow progresses, then batches the flush to Turso on completion (saves Turso HTTP overhead).
- **Rate Limiting:** Atomic `INCR` checks limit Windows.
- **Debouncing:** Atomic `SET NX EX` locks stop duplicate trigger firings.
- **Spike Leveling (Queues):** RPUSH/LPOP prevents Edge execution timeouts during webhook bursts.
- **Checkpoints:** Durable workflow resume points in case of CF Worker CPU limits.

---

## 4. Control Plane Database Compatibility

Frontbase's Control Plane (FastAPI) is designed to support both **SQLite** (Development/Edge default) and **PostgreSQL** (Production).

### 4.1 Driver Strategy
- **Application (`database/config.py`):** Uses an asynchronous driver (`aiosqlite` for SQLite, `asyncpg` for PostgreSQL).
- **Migrations (`alembic/env.py`):** Uses synchronous drivers (`sqlite` or `psycopg2`) because Alembic migrations run synchronously. It automatically converts the connection string dialect.

### 4.2 Migration Best Practices
- **Boolean Literals:** SQLite uses `1`/`0`, PostgreSQL uses `true`/`false`. Migrations must inject the correct literal using dialect detection: `op.get_bind().dialect.name`.
- **Datetime Parsing:** PostgreSQL occasionally returns `datetime` as space-separated strings, breaking Pydantic validators. Use a flexible `BeforeValidator` to gracefully parse fallback date strings.
- **Schema Modification:** SQLite has poor support for `ALTER TABLE DROP COLUMN`. As a result, use `render_as_batch=True` within Alembic configuration to recreate tables safely during destructive migrations.
