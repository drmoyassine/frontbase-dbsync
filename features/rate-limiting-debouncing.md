# Workflow Rate Limiting & Debouncing

> Built-in protection against runaway triggers and duplicate executions.

## Rate Limiting

Every workflow is automatically rate-limited to **60 executions per minute** per workflow. When exceeded:

- The webhook/execute endpoint returns **HTTP 429** with a clear error message
- An `X-RateLimit-Remaining` header shows remaining capacity
- The counter resets every 60 seconds automatically

This protects your Edge Workers from:
- Webhook floods (e.g., a misconfigured upstream sending 1000 events/second)
- Accidental infinite loops between workflows
- Cost overruns on serverless platforms

## Debouncing

Prevents duplicate workflow executions within a configurable time window. If the same workflow is triggered twice within 5 seconds, the second trigger is silently skipped with a `"debounced"` response.

This is essential for:
- **Data change triggers** — A single database update can fire multiple webhooks
- **UI event triggers** — Rapid button clicks or form resubmissions
- **Webhook retries** — Upstream services retrying a successful delivery

## How It Works

Both features use **Redis atomic operations** for correctness under concurrency:

- **Rate limiting**: `INCR` + `EXPIRE` — atomic counter per time window, no race conditions even with 50 simultaneous triggers
- **Debouncing**: `SET NX EX` — set-if-not-exists with TTL, single atomic operation

## Graceful Degradation

When Redis is not configured, both features are transparently disabled — all executions are allowed, exactly like the current behavior. Zero configuration required for basic deployments.
