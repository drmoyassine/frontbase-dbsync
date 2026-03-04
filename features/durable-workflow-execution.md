# Durable Workflow Execution

> Workflows that survive crashes and auto-recover — even on Cloudflare Workers' 10ms CPU limit.

## What It Does

Frontbase saves a **checkpoint** to Redis after every node in your workflow completes. If the Edge Worker dies mid-execution — whether from a CPU limit, a network timeout, or a cold restart — the workflow **resumes from the last checkpoint**, not from scratch.

## How It Works

1. **Checkpoint after every node** — After each node completes, its outputs and status are saved to Redis with a 1-hour TTL
2. **Resume on retry** — When the workflow is re-triggered (manually or via QStash auto-retry), the engine loads the checkpoint, skips already-completed nodes, and continues execution
3. **Single database write** — Instead of writing to the database after every node (N writes for N nodes), Frontbase buffers all results and flushes once on completion

## QStash Auto-Retry

For fire-and-forget webhooks, Frontbase optionally routes execution through [Upstash QStash](https://upstash.com/qstash). If the Worker fails:

- QStash **automatically retries** up to 3 times with exponential backoff
- Each retry reads the checkpoint and **resumes where it left off**
- Failed executions land in a dead-letter queue for investigation

## Graceful Degradation

| Configuration | Behavior |
|---|---|
| Redis + QStash | Full durable execution with auto-retry |
| Redis only | Checkpoints saved, manual retry resumes |
| No Redis | Works exactly like before — no crashes, no checkpoints |

## Configuration

```bash
# Redis (enables checkpoints)
FRONTBASE_CACHE_URL=https://your-redis.upstash.io
FRONTBASE_CACHE_TOKEN=your-token

# QStash (enables auto-retry — optional)
QSTASH_TOKEN=your-qstash-token
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...
```
