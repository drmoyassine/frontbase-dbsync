# Session — 2026-03-04 — Edge Queue, Bundle Versioning & Redeploy

## Completed Today ✅

### 1. EdgeQueue Model + Migration
- [x] `0022_add_edge_queues.py` Alembic migration
- [x] `EdgeQueue` model in `models.py`
- [x] `edge_queue_id` FK on `EdgeEngine`

### 2. Queue API + Settings UI
- [x] `edge_queues.py` router — full CRUD + test endpoint
- [x] `/api/edge-queues/test-connection/` — provider-aware ping
- [x] Separate "Edge Queues" tab in Settings (`EdgeQueuesForm.tsx`)
- [x] Edge Queue dropdown in **Deploy Engine** dialog
- [x] Edge Queue dropdown in **Reconfigure Engine** dialog
- [x] Queue badge on engine cards

### 3. Provider-Agnostic Env Vars
- [x] `FRONTBASE_QUEUE_*` env vars injected on deploy + reconfigure
- [x] Updated `FRONTBASE_BINDING_NAMES` for managed secrets
- [x] `reconfigure_engine` fetches from `EdgeQueue` table
- [x] `deploy_to_cloudflare` fetches from `EdgeQueue` table

### 4. Bug Fixes
- [x] 307 redirect loop on `/test-connection/` and `/{queue_id}/test/` (trailing slashes)
- [x] Route ordering: static `/test-connection/` moved before `/{queue_id}` routes
- [x] `Dashboard.tsx` crash: `pages?.filter` not a function (corrupted React Query cache)
- [x] `createPageSlice.ts`: `pagesRaw.map` crash (Array.isArray guard)
- [x] `api-contracts.ts`: `validate()` now throws on `success: false`
- [x] 500 error on `/api/actions/drafts` (ran missing Alembic migrations)

### 5. Bundle Versioning + Redeploy ✨
- [x] `_build_worker()` returns `(content, bundle_hash)` tuple
- [x] `_compute_bundle_hash()` — 12-char SHA-256 prefix
- [x] `_get_current_bundle_hash()` — reads dist without rebuilding
- [x] Deploy stores `bundle_checksum` + `last_deployed_at` in engine record
- [x] `_serialize_engine` computes `is_outdated` (deployed hash vs current dist hash)
- [x] Engines with no checksum (pre-existing) treated as outdated
- [x] `GET /api/edge-engines/bundle-hashes/` endpoint
- [x] `POST /api/edge-engines/{id}/redeploy/` — rebuild + upload + secrets + cache flush
- [x] `⚠ Outdated` badge (orange, pulsing) on engine cards
- [x] Redeploy button (Upload icon) — only visible when outdated

### 6. Workflow `settings` JSONB Column
- [x] `0023_add_workflow_settings.py` migration
- [x] `settings` column on `AutomationDraft`

---

## Next Session Priorities

### 1. Queue Trigger Node (IoT / Node-RED pattern)
A new `queue_trigger` node type that subscribes to a channel on the connected `EdgeQueue`:

| Mode | Providers | Deployment | How |
|------|-----------|------------|-----|
| **Push** | QStash, SQS | All | Queue POSTs to `/api/queue/:workflowId` |
| **Pull** | RabbitMQ, MQTT | Self-hosted | Engine maintains persistent subscription |

Tasks:
- [ ] Add `queue_trigger` to `nodeSchemas.ts` with channel + filter config
- [ ] Add `/api/queue/:workflowId` route to edge runtime (push receiver)
- [ ] Register push callback URL on publish (QStash: create topic subscription)
- [ ] Deregister on unpublish

### 2. Workflow Settings UI
- [ ] Settings panel in automation canvas (gear icon in toolbar)
- [ ] Form: rate_limit, debounce_ms, retry_count, execution_timeout_ms, queue_enabled
- [ ] Save to `workflow.settings` via existing workflow update API

### 3. Edge Runtime Queue Adapter
- [ ] Read `FRONTBASE_QUEUE_PROVIDER` env var and instantiate correct client
- [ ] QStash verify signature middleware for push-mode triggers
- [ ] Pull mode adapter for self-hosted (RabbitMQ/MQTT - future)

### 4. Distributed Deployment Testing
- [ ] Test multi-machine deployment with `docker-compose.distributed`
- [ ] Verify queue env vars flow correctly across machines
- [ ] Test redeploy button with remote engines
