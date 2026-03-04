# Multi-Target Edge Deployment

> Deploy once, run everywhere. One codebase, four deployment modes.

## What It Does

Frontbase's Edge Engine uses an **adapter pattern** to deploy the exact same codebase to any environment — Cloudflare Workers, Docker containers, or standalone nodes — without code changes.

## Deployment Modes

| Mode | Target | Edge State | Use Case |
|------|--------|-----------|----------|
| **Cloud (BYOE)** | CF Workers, Vercel, Netlify | Turso + Upstash | SaaS customers |
| **Self-Hosted** | Docker Compose | Local SQLite | Privacy, internal tools |
| **Standalone Node** | Any Docker host | Turso + Upstash | Sovereign compute |
| **Distributed** | Multi-machine Docker | Configurable | Enterprise scale |

## Adapter Pattern

The engine reads one environment variable to select its storage backend:

| `FRONTBASE_DEPLOYMENT_MODE` | Provider | Connection |
|---|---|---|
| `cloud` | `TursoHttpProvider` | HTTP to Turso |
| `local` *(default)* | `LocalSqliteProvider` | Local SQLite file |

## Bundle Types

| Bundle | Size | Includes |
|--------|------|----------|
| **Full** | ~2.2 MB | SSR pages + workflows + data queries |
| **Lite** | ~1.1 MB | Workflows only (no React/SSR) |

## Publishing Pipeline

When you hit **Publish**, the backend:
1. Compiles canvas state into optimized JSON + routing tree
2. Generates a Tailwind CSS bundle at build time (no CDN dependency)
3. Pushes to all configured targets simultaneously (Turso, local SQLite, Edge engines)
4. Invalidates/primes caches

**No redeployment needed** — Edge Workers pick up new content automatically.

## Bundle Versioning (Source-Based)

Each deploy stores a **12-char SHA-256 hash** of the **source files** (`services/edge/src/**/*.ts`). Staleness is detected immediately after any `.ts` edit — no build step required.

| State | Badge | Action |
|-------|-------|--------|
| Source hash matches | `✓ Synced` | None |
| Source hash differs | `⚠ Outdated` | One-click **Redeploy** button appears |
| No hash stored (pre-existing) | `⚠ Outdated` | Treated as outdated until first redeploy |

Redeploy auto-detects the engine type and routes accordingly:

| Engine Type | Redeploy Flow |
|---|---|
| **Cloudflare** | Build → CF API upload → patch secrets → flush cache |
| **Docker** | Build → POST `/api/update` → engine restarts → health check |

## Docker Self-Update

Docker/Node.js engines expose `POST /api/update` for remote code updates:

1. Backend builds the latest bundle
2. POSTs `{ script_content, source_hash }` to the engine
3. Engine writes bundle atomically to `dist/index.js`
4. Engine exits gracefully → Docker `restart: always` brings it back
5. Backend waits for health check (up to 18s) → marks as Synced

Same UX as Cloudflare — user clicks Redeploy, backend handles the rest.

## Edge Queue Integration

Each engine can be configured with an **Edge Queue** (QStash, RabbitMQ, BullMQ, SQS) for durable workflow execution:

```env
FRONTBASE_QUEUE_PROVIDER=qstash
FRONTBASE_QUEUE_URL=https://qstash.upstash.io
FRONTBASE_QUEUE_TOKEN=eyJ...
FRONTBASE_QUEUE_SIGNING_KEY=sig_6c...
```

Queues are configured in Settings → Edge Queues, then attached to engines in both the Deploy and Reconfigure dialogs.

## Per-Workflow Settings

Each workflow can be configured with runtime settings via the Settings panel (gear icon in editor toolbar):

| Setting | Default | Description |
|---|---|---|
| Rate Limit | 60/min | Max executions per window |
| Debounce | 0 ms | Deduplicate rapid triggers |
| Execution Timeout | 29000 ms | Max runtime before abort |
| Queue Enabled | false | Use durable queue for retries |
| Max Retries | 3 | Queue retry attempts |

Settings are stored as JSON on the workflow draft, deployed to edge engines, and applied at runtime in both `/api/execute` and `/api/webhook` routes. QStash signature verification activates when `Upstash-Signature` header is present.
