# Global Execution Observability

> See every workflow execution across all your edge engines — in one place.

## What It Does

Frontbase provides a **pull-based observability system** that aggregates execution logs from every deployed Edge Engine. Whether your workflows run on a local Docker container, a Cloudflare Worker, or a standalone edge node — all logs appear in a single, unified view.

## How It Works

1. **Fan-out query** — When you open the execution log, the backend queries all registered Edge Engines in parallel
2. **Lazy-loaded details** — The summary table loads instantly. Full execution details (node-by-node breakdown, inputs, outputs) are fetched on-demand when you expand a row
3. **Per-engine attribution** — Each execution log shows which engine ran it, so you can trace issues to specific deployments

## Execution Detail View

Each execution shows:
- **Status** — `completed`, `error`, `executing`, `started`
- **Trigger type** — `webhook`, `manual`, `node_test`
- **Timing** — Start time, end time, total duration
- **Node-by-node breakdown** — Status, inputs, outputs, and errors for every node in the workflow
- **Trigger payload** — The exact data that triggered the execution

## Architecture

```
Browser → Backend → Fan-out to all Edge Engines → Merge & Return
                     ├── Docker Edge (localhost:3002)
                     ├── CF Worker (edge.workers.dev)
                     └── Standalone Node (railway.app)
```

The backend resolves each engine's canonical URL from the `deployment_targets` table and aggregates results — no agents, no push protocol, no log shipping infrastructure required.
