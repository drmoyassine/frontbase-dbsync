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

## Bundle Versioning

Each deploy stores a **12-char SHA-256 hash** of the uploaded JS bundle. When the local source changes:

| State | Badge | Action |
|-------|-------|--------|
| Hash matches dist | `✓ Synced` | None |
| Hash doesn't match | `⚠ Outdated` | One-click **Redeploy** button appears |
| No hash stored (pre-existing) | `⚠ Outdated` | Treated as outdated until first redeploy |

Redeploy rebuilds the bundle, uploads to the existing worker, patches secrets, and flushes cache — all in one click.

## Edge Queue Integration

Each engine can be configured with an **Edge Queue** (QStash, RabbitMQ, BullMQ, SQS) for durable workflow execution:

```env
FRONTBASE_QUEUE_PROVIDER=qstash
FRONTBASE_QUEUE_URL=https://qstash.upstash.io
FRONTBASE_QUEUE_TOKEN=eyJ...
FRONTBASE_QUEUE_SIGNING_KEY=sig_6c...
```

Queues are configured in Settings → Edge Queues, then attached to engines in both the Deploy and Reconfigure dialogs.
