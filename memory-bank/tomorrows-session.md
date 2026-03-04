# Session — 2026-03-04 — Workflow Settings, Source Checksums & Docker Self-Update

## Completed Today ✅

### 1. EdgeQueue Model + Migration (Previous Session)
- [x] `0022_add_edge_queues.py` Alembic migration
- [x] `EdgeQueue` model in `models.py`
- [x] `edge_queue_id` FK on `EdgeEngine`

### 2. Queue API + Settings UI (Previous Session)
- [x] `edge_queues.py` router — full CRUD + test endpoint
- [x] `/api/edge-queues/test-connection/` — provider-aware ping
- [x] Separate "Edge Queues" tab in Settings (`EdgeQueuesForm.tsx`)
- [x] Edge Queue dropdown in **Deploy Engine** dialog
- [x] Edge Queue dropdown in **Reconfigure Engine** dialog
- [x] Queue badge on engine cards

### 3. Provider-Agnostic Queue Module
- [x] Created `engine/queue.ts` — replaces `qstash.ts`
- [x] `FRONTBASE_QUEUE_*` env vars with `QSTASH_*` fallback
- [x] Backward-compatible exports (`isQStashEnabled`, `verifyQStashSignature`)
- [x] Updated `webhook.ts` import

### 4. Per-Workflow Settings (End-to-End)
- [x] `settings: string | null` on `WorkflowData` interface
- [x] Migration v4: `ALTER TABLE workflows ADD COLUMN settings TEXT`
- [x] Drizzle schemas + `upsertWorkflow` (both `LocalSqliteProvider` + `TursoHttpProvider`)
- [x] `execute.ts` + `webhook.ts` read settings for rate limit / debounce
- [x] `settings` in Pydantic schemas (`WorkflowDraftBase`, `WorkflowDraftUpdate`)
- [x] `_build_deploy_payload` includes `settings` (JSON-stringified)
- [x] `settings` in TS types (`WorkflowDraft`, `UpdateDraftInput`)
- [x] `WorkflowSettingsPanel.tsx` — gear icon in toolbar, popover UI for rate limit, debounce, timeout, queue

### 5. QStash Signature Verification
- [x] `verifyQueueSignature()` called in `/api/execute/:id` when `Upstash-Signature` header present
- [x] 401 response for invalid signatures
- [x] Added 401 to OpenAPI route spec

### 6. Source-Based Bundle Checksum
- [x] `_get_source_hash()` — hashes all `.ts` in `services/edge/src/` (replaces build-output hash)
- [x] `_get_current_bundle_hash()` delegates to source hash
- [x] All deploy paths store source hash as `bundle_checksum`
- [x] `list_edge_engines` / `get_edge_engine` / `get_bundle_hashes` use source hash
- [x] Engines show Outdated immediately after any `.ts` edit — **no build step needed**
- [x] Verified: source hash mismatch → `is_outdated: true` ✅

### 7. Docker Edge Self-Update
- [x] `routes/update.ts` — `POST /api/update` on edge engine
- [x] Receives bundle, writes atomically to `dist/index.js`, `process.exit(0)` → Docker restart
- [x] Registered in `lite.ts` (available to all engine types)
- [x] `redeploy_engine` auto-detects CF vs Docker mode
- [x] Docker path: build → POST `/api/update` → health check loop (18s max)
- [x] Same "Redeploy" UX for both CF and Docker engines

### 8. Bug Fixes (Previous Session)
- [x] 307 redirect loop on `/test-connection/` (trailing slashes)
- [x] `Dashboard.tsx` crash: `pages?.filter` not a function
- [x] `createPageSlice.ts`: `pagesRaw.map` crash (Array.isArray guard)
- [x] `api-contracts.ts`: `validate()` now throws on `success: false`
- [x] 500 error on `/api/actions/drafts` (ran missing Alembic migrations)

---

## Next Session Priorities

### 1. Distributed Deployment Testing
- [ ] Test multi-machine deployment with `docker-compose.distributed`
- [ ] Verify Docker self-update redeploy flow end-to-end
- [ ] Test queue env vars flow correctly across machines

### 2. Auth on /api/update
- [ ] Add `apiKeyAuth` middleware to `/api/update` route
- [ ] Ensure backend sends API key header when POSTing to Docker engines

### 3. Queue Trigger Node (Backlog)
- [ ] Add `queue_trigger` to `nodeSchemas.ts` with channel + filter config
- [ ] Add `/api/queue/:workflowId` route to edge runtime (push receiver)
- [ ] Register push callback URL on publish (QStash: create topic subscription)

### 4. Performance Optimization
- [ ] Split `WorkflowEditor.tsx` (now 599+ lines with settings integration)
- [ ] Extract shared Drizzle schema from `LocalSqliteProvider` + `TursoHttpProvider`
