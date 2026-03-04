# Edge-Native Workflow Engine

> A unified runtime that executes workflows at the edge — directly on Cloudflare Workers, Vercel Edge, or your own Docker container.

## What It Does

Frontbase ships a **single Hono-based Edge Engine** that handles both SSR page delivery and workflow automation execution. Workflows run directly where your visitors are — at the edge — with sub-millisecond latency.

## Trigger Types

| Trigger | Endpoint | Status |
|---------|----------|--------|
| **Webhook** | `POST /api/webhook/:id` | ✅ Production |
| **Manual** | `POST /api/execute/:id` | ✅ Production |
| **UI Event** | Client → `/api/execute/:id` | 🟡 Planned |
| **Schedule** | QStash Cron → Edge | 🟡 Planned |
| **Data Change** | DB Webhook → Edge | 🟡 Planned |
| **Email** | Email Service → Edge | 🟡 Planned |

## Key Capabilities

- **Sync & async modes** — Workflows with an `http_response` node execute synchronously and return custom responses. All others fire-and-forget.
- **Per-workflow authentication** — Header-based, Basic Auth, or no auth — configured per trigger node
- **Built-in observability** — Full execution history with per-node status, inputs, outputs, and timing
- **Fan-out logging** — Execution logs pulled from all deployed engines, not just one

## Deployment Targets

The same workflow code runs everywhere:

| Target | How |
|--------|-----|
| **Cloudflare Workers** | `wrangler deploy` (Lite or Full bundle) |
| **Docker** | `docker-compose up edge` |
| **Vercel / Netlify** | Adapter pattern (planned) |
| **Standalone Node** | `frontbase/edge-node` image on any cloud |

## Four-Tier Caching

1. **L1 — In-process RAM** (SWR ~60s)
2. **L2 — Upstash Redis** (global, <10ms)
3. **L3 — Turso replicas** (source of truth, ~5ms)
4. **L4 — CDN** (static assets)
