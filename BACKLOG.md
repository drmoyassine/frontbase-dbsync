# Frontbase Backlog

> Organized by section. Tags: `🐛 Bug` · `✨ New Feature` · `🔧 Improvement` · `🔌 Integration`

---

## 🎨 Builder / SSR

- [ ] 🐛 **SSR page width issue** — Page content does not span the full viewport width in SSR output. Navbar, Hero, and section backgrounds don't reach viewport edges on widescreen. **Root cause candidates:** (1) `renderPage()` injects explicit `width` from `containerStyles.values.size`, (2) `margin:0 auto` on containers, (3) `.fb-page` missing `width:100%`, (4) `horizontalAlign: 'center'` adding auto margins. **Next step:** Log `layoutData.root.containerStyles.values` and verify whether adding `width:100%` to `.fb-page` resolves it.

- [ ] ✨ **Auth Form component** — New builder component (Login/Signup form) that renders via Edge SSR. Client-side auth calls `supabase.auth.signInWithPassword()`/`signUp()`. Store JWT in `httpOnly` cookie, configurable redirect after login.

- [ ] ✨ **Private Page Enforcement** — Implement page gating (`pages.ts:360`): check `page.isPublic`, redirect unauthenticated users. Auth middleware in Hono to verify JWT from cookie. Project-level login redirect setting.

- [ ] ✨ **Role-Based Visibility** — Component-level access rules (builder property: "Visible to roles"). Server-side filtering (exclude from SSR, not CSS `display:none`). User-scoped data queries via JWT for Supabase RLS.

- [ ] ✨ **PWA Support for Published Apps** — Dynamic Manifest, Service Worker (Cache-first static, Network-first API), offline support, "Add to Home Screen" prompt.

- [ ] ✨ **`/robots.txt` on Edge** — Auto-generated from project settings, served by Edge Worker, configurable allow/disallow paths.

- [ ] ✨ **`/sitemap.xml` on Edge** — Auto-generated from published page slugs in Turso, served by Edge Worker, updated on each publish.

- [ ] ✨ **Version History & Rollback (Pages)** — Snapshot table (`page_versions`) storing full JSON state per version. Enables rollback, diff view, and audit trail.

- [ ] 🐛 **Better error toasts** — Parse and display structured error details from backend (currently shows `[object Object]` for some errors).

- [ ] 🔧 **Split `FileBrowser/index.tsx`** (818L) — Extract file tree rendering, toolbar, and file actions into subcomponents (`FileTree.tsx`, `FileActions.tsx`, `FileUploader.tsx`). Single component currently handles tree state, upload logic, delete actions, and toolbar rendering. See `performance-optimization.md` §1.

- [ ] ✨ **SSR/HTML Support for Supabase Edge Full Bundle** — Supabase Edge Functions rewrite `Content-Type: text/html` → `text/plain` with `x-content-type-options: nosniff`, blocking HTML rendering. Automations (webhooks, APIs) work fine since they return `application/json`. Full SSR requires a reverse proxy (e.g., Cloudflare) to fix the Content-Type.

  **Bundle changes needed:**
  - Build `supabase-edge` (Full) bundle via `tsup.supabase-edge.ts` (already exists, imports `fullApp` + SSR routes)
  - SSR renderer must output **absolute CDN URLs** for static assets when `platform === 'supabase-edge'`:
    - `hydrate.js` → host on Supabase Storage (public bucket) or external CDN, NOT relative `/static/react/hydrate.js`
    - Favicon → external CDN URL, NOT `/static/icon.png`
    - CSS → already inlined via `cssBundle` (no change needed)
  - Publish pipeline: when target is Supabase, upload `hydrate.js` to Supabase Storage and inject the public URL into SSR templates

  **Reverse proxy setup (user-configured, Frontbase provides instructions):**
  - Cloudflare Origin Rule: resolve `example.com` to `project.supabase.co`, override Host Header
  - Cloudflare URL Rewrite Rule: prepend `/functions/v1/fn-name` to path
  - Cloudflare Response Header Rule: when path does NOT start with `/api/`, set `Content-Type: text/html; charset=UTF-8` + remove `x-content-type-options`
  - All 3 rule types available on **Cloudflare free tier** (10 rules each)

  **Edge Inspector UI:**
  - For Supabase engines, show "SSR Setup Guide" with pre-filled rule values (project ref, function name)
  - Copy-paste friendly rule configs
  - "Test SSR" button: hits user's custom domain, verifies `Content-Type: text/html` + `<!DOCTYPE html>` in body

---

## ⚡ Automations


### Execution Logs
- [ ] 🔧 **Execution history panel** — List of past executions with status, duration, trigger info per workflow.
- [ ] ✨ **Execution detail view — Pipeline Diagram** — Replace vertical node list with horizontal pipeline (`Node → Node → Node`) with hover tooltips (inputs, outputs, status, duration). Requires runtime enrichment + Edge API changes. **Full plan:** [`memory-bank/execution-pipeline-diagram-plan.md`](memory-bank/execution-pipeline-diagram-plan.md)
- [ ] ✨ **Branching workflow visualization** — Phase 2: render multi-branch/parallel-path workflows as a DAG instead of linear pipeline. **Full plan:** [`memory-bank/execution-pipeline-diagram-plan.md`](memory-bank/execution-pipeline-diagram-plan.md)
- [ ] ✨ **Live execution streaming** — Real-time execution progress updates (WebSocket or polling).
- [ ] 🔧 **Execution log retention** — Configurable cleanup of old execution records.

### Trigger Nodes

**Current edge runtime support:**

| Trigger | Status | Path |
|---------|--------|------|
| `webhook_trigger` | ✅ Working | `POST /api/webhook/:id` |
| `manual_trigger` | ✅ Working | `POST /api/execute/:id` |
| `ui_event_trigger` | 🟡 Easy | Client → `/api/execute/:id` |
| `queue_trigger` | 🔴 Pending | Queue message → edge (push or pull) |
| `data_change_trigger` | 🔴 Pending | Data source webhook → edge |
| `schedule_trigger` | 🔴 Pending | QStash cron → edge |
| `email_trigger` | 🔴 Pending | Email service webhook → edge |

- [ ] 🐛 **Fix multi-trigger publish to CF Worker** — Redeploy CF Worker with updated `z.string()` triggerType schema.
- [ ] ✨ **UI Event Trigger** — `ui_event_trigger` node. Hydrated page calls `/api/execute/:id` on click/hover/submit. Config: event type, target element, debounce.
- [ ] ✨ **Data Change Trigger** — `data_change_trigger` node. On publish, auto-registers webhook in data source (Supabase Database Webhooks / `pg_net`). Config: table, change type (INSERT/UPDATE/DELETE), filter conditions.
- [ ] ✨ **Queue Trigger (IoT / Message Bus)** — `queue_trigger` node. Subscribes to a channel on the connected `EdgeQueue` (QStash, RabbitMQ, MQTT, Redis Pub/Sub). **Push mode** (QStash/cloud): queue POSTs to `/api/queue/:workflowId`. **Pull mode** (RabbitMQ/MQTT/self-hosted): edge engine maintains persistent subscription. Config: queue provider (from `EdgeQueue`), channel/topic, optional message filter (`{{ payload.temp > 30 }}`). Push works on all deployment types; pull requires self-hosted engine.
- [ ] ✨ **Schedule Trigger (QStash)** — `schedule_trigger` node. On publish, registers QStash schedule. Config: cron expression + timezone. On unpublish, deregisters.
- [ ] ✨ **Email Received Trigger** — `email_trigger` node. Uses email service (SendGrid Inbound Parse / Mailgun / Postmark / Resend) to forward emails as POST to `/api/webhook/:id`. Typed outputs: `from`, `to`, `subject`, `bodyPlain`, `bodyHtml`, `attachments`. Auto-registers/deregisters on publish/unpublish.

**Edge bundle changes needed (minimal):**
1. Add trigger aliases in `node-executors.ts` `executeNode` switch (`webhook_trigger`, `data_change_trigger`, `schedule_trigger`, `ui_event_trigger`, `email_trigger`)
2. No new routes needed — all invoke via existing `/api/webhook/:id` or `/api/execute/:id`

### Action Nodes
- [ ] ✨ **Email node** — Send emails via configured SMTP or API (SendGrid/Resend).
- [ ] ✨ **Delay/Wait node** — Pause execution for a configurable duration.
- [ ] ✨ **Loop/Iterator node** — Iterate over array data from upstream nodes.
- [ ] ✨ **Webhook Response node** — Return custom response body/headers for webhook-triggered workflows.

### Node Validation
- [ ] 🔧 **Required field validation** — Validate required inputs before save/publish, show warnings.
- [ ] 🔧 **Node connection validation** — Verify type compatibility between connected node outputs/inputs.
- [ ] 🔧 **Schema-driven defaults** — Ensure all node schemas define sensible defaults for all fields.

### Execution Engine
- [ ] ✨ **Version History & Rollback (Workflows)** — Snapshot table (`automation_draft_versions`) with rollback, diff view, and audit trail.
- [ ] ✨ **Durable Workflow Execution (remaining)** — ~~Checkpointing~~ ✅ (`engine/checkpoint.ts`), ~~rate limiting~~ ✅ (`engine/qstash.ts`), ~~debouncing~~ ✅ (`engine/debounce.ts`), ~~DLQ wiring~~ ✅ (`dead_letters` table + `runtime.ts`). **Remaining:** spike leveling (queue buffer), idempotency keys, cross-execution shared variables.
- [ ] ✨ **Node-level Output Caching** — Cache individual node outputs (HTTP request, data query) with configurable TTL. Repeat executions reuse cached results instead of re-fetching. Requires per-node config panel + cache key generation from input hash.
- [ ] ✨ **Manual Checkpoint Node** — User-placeable Checkpoint node type for explicit state saves inside loops or before expensive operations. Pass-through node (data in → data out) that forces `saveCheckpoint()` at that point in the graph.
- [ ] ✨ **Custom WebSockets** — Real-time workflow execution streaming (replacing Supabase Realtime).

---

## 🌐 Edge Infrastructure

### Resilience & Status
 
- [x] ~~🔧 **Publish-state sync check**~~ — ✅ `batch/sync-check` endpoint, `sync_status` field (`synced`/`stale`/`unknown`), `bundle_checksum` drift detection in `engine_serializer.py`.
- [x] ~~**Skip redundant publishes (content hash)**~~ — ✅ Implemented via `page_hash.py`, Drizzle schema `content_hash` column, migration v3. Hash `layoutData + cssBundle`, skip writes if unchanged.
- [ ] 🔧 **Edge DB quota guard** — Monitor row reads/writes (Turso/Neon), warn in UI, auto-fallback to local SQLite.
- [ ] 🔧 **Cache quota guard** — Monitor commands/month (Upstash), reduce TTL or disable L2 cache gracefully.
- [ ] 🔧 **Graceful provider downgrade** — Fall back to local SQLite/no-cache on edge DB/cache failure. Log and surface in status panel.
- [x] ~~**Edge provider badge**~~ — ✅ Show provider icon + name on resource cards. Implemented via `EdgeResourceRow` + `PROVIDER_ICONS` + `ProviderBadge` in `edgeConstants.tsx`.
- [ ] ✨ **Live status panel** — Settings widget showing edge DB/cache/queue quotas, connection status, hit rate.
- [ ] ✨ **Provider switch confirmation** — Confirmation dialog when changing edge DB/cache/queue provider.

### Deployment & Adapters
- [x] ~~🔌 **Postgres Edge State Provider**~~ — ✅ `NeonHttpProvider` + `SupabaseRestProvider` + `CfD1HttpProvider` implementing `IStateProvider`. Dialect-aware PG migrations with `frontbase_edge` schema isolation. Provider factory dispatch in `storage/index.ts`.
- [ ] ✨ **Capability-driven resource forms** — Derive DB/Cache/Queue provider options from `PROVIDER_CONFIGS` capabilities metadata instead of hardcoding. `EDGE_*_PROVIDERS` arrays exist in `edgeConstants.tsx` but forms still use local `PROVIDER_OPTIONS`. Show capability badges in connect dialogs.
- [ ] ✨ **Local Data Proxy (Hybrid Edge)** — Connect Edge workers to local/private infra via `serverless-redis-http` or Cloudflare Tunnels.
- [x] ~~🔌 **One-Click Integrations**~~ — ✅ Auto-create resources via `AccountResourcePicker` + `POST /api/edge-providers/create-resource-by-account/`. Supports Upstash Redis, CF D1/KV/Queues, Turso DBs.
- [ ] ✨ **Multi-Provider Load Balancing** — DNS-level weighted routing across CF + Vercel + Netlify.
- [ ] 🔧 **Extract Shared Edge Core** — Refactor into `shared/edge-core.ts` + thin adapter wrappers per provider.
- [x] ~~✨ **Edge `/api/config` Endpoint**~~ — ✅ `routes/config.ts`: GET current config (redacted), POST hot-reload cache/queue. Registered in `lite.ts` with `systemKeyAuth`.
- [x] ~~**Edge CORS Origin Configuration**~~ — ✅ Implemented in `engine/lite.ts` CORS middleware.
- [x] ~~🔧 **Edge Request Logging**~~ — ✅ `edge-logs.ts` route: `POST /api/edge-logs` (bulk insert), `GET /api/edge-logs` (paginated read with level filter).
- [x] ~~✨ **Engine Type Selector in Deploy Dialog**~~ — ✅ Full Bundle toggle exists in the Deploy Engine Wizard.
- [x] ~~🔧 **Source Hash Staleness Detection**~~ — ✅ `get_source_hash()` in `bundle.py` hashes all `.ts` files in `services/edge/src/` for drift detection. Used by `engine_serializer.py` for `sync_status` comparison and `engine_deploy.py` for build caching.
- [x] ~~🔧 **`build_worker()` mocked integration tests**~~ — ✅ `test_engine_deploy.py`: 29 tests covering CF/Docker/Vercel deploy, GPU bindings, cache flush, provider routing, partial failures, tsup configs.

### Inspector & DX
- [x] ~~**Edge Inspector Dialog**~~ — ✅ Provider-agnostic inspector with split-pane layout: files + secrets + bindings (left), Monaco Editor (right). Source snapshot from backend DB.
- [ ] ✨ **Inspector Health & Resource Metrics Panel** — Metrics tab: Worker CPU, memory, request count, error rate, Turso/Upstash usage. Data from provider APIs.
- [x] ~~**Edge Code Editor (Inspector IDE)**~~ — ✅ Monaco editor for source `.ts` files. Save All writes to disk, Compile & Deploy triggers redeploy. Dirty state tracking with amber dots.

### Security & Compliance
- [ ] 🔌 **Enterprise Secrets Management** — Infisical integration for deploy-time secrets injection, E2E encrypted storage, audit logs.
- [ ] ✨ **GDPR Compliance Enhancements** — Cookie Consent Banner, IP Anonymization, Privacy Policy Template, Data Retention Controls.
- [ ] ✨ **Admin User Management** — List, search, invite, delete Supabase auth users from dashboard. GoTrue Admin API for CRUD. Contacts sync.
- [ ] 🔌 **Neon Auth Support** — Add Neon Auth as an auth provider option. Neon Auth provides @neondatabase/pg + drizzle integration. Detect when auth provider has database capability and auto-suggest same datasource for contacts table.
- [ ] 🔌 **Storage Adapters** — Add storage provider adapters for Cloudflare R2, Vercel Blob, and Netlify Blobs alongside existing Supabase Storage.
- [ ] ✨ **Cross-Bucket & Cross-Provider File Move** — Enable moving files between buckets and across providers (single + multi-select). **Backend:** Add `download_file(bucket, path) → bytes` to `StorageAdapter` ABC (all 4 adapters), new `POST /api/storage/move-cross` endpoint (download → upload → delete, native `move_file` optimization for same-bucket Supabase), streaming for files >50MB. **Frontend:** Enhanced `MoveDialog` with bucket picker grouped by provider, folder browser for dest bucket, cross-provider badge, progress indicator. Multi-select already works via `moveMutation` targets array. ~3-4 hours effort.

---

## 🗄️ Data Studio

- [ ] 🔧 **User-configurable FK display columns** — Allow users to select which columns to display for foreign key relationships.
- [ ] 🔧 **Optimized fetching** — Select specific columns instead of `*` for better performance.
- [ ] 🔧 **Heuristic FK detection fallback** — Auto-detect foreign keys based on column names if DB schema lacks explicit FKs.
- [ ] ✨ **Multi-level relation support** — Support fetching data for nested foreign key relationships.
- [ ] 🔧 **Backend Redis Caching** — Cache table/column metadata (Schema Discovery), external API caching, rate limiting.
- [ ] ✨ **Storage Architecture Refactor** — Move admin storage APIs to FastAPI. On-demand edge shipping.
- [ ] 🔌 **Storage Provider Selector** — Multi-provider support (Supabase, S3, R2) via Settings dropdown.

---

## 🔧 Platform-Wide

- [ ] 🔧 **Optimize Caching & Refetch Strategy** — Unify React Query / Zustand cache behaviour across all list views. Consistent `staleTime`, `refetchOnWindowFocus: false`, frontend filters for Pages panel. **Files:** `useEdgeInfrastructure.ts`, `useActionsQuery.ts`, `createPageSlice.ts`, `PagesContentPanel.tsx`.
- [ ] 🔌 **Observability** — Axiom/Sentry logging integration, OpenTelemetry tracing.
- [ ] ✨ **Multi-Tenant Cloud Mode (BYOP)** — When deployed as `frontbase.dev` cloud SaaS:
  - **Local Edge hidden**: `is_system` engines excluded from Edge Engines list, page publish targets, and workflow publish targets. Users never see internal Docker edges.
  - **Stateless platform engine**: The platform edge is used only for build/compile/preview operations — users cannot host apps or workflows on it.
  - **BYOP (Bring Your Own Provider)**: Users must connect their own cloud edge provider (Cloudflare, Vercel, Supabase Edge Functions, etc.) to publish and host.
  - **Mode flag**: `FRONTBASE_MODE=cloud|selfhost` env var controls visibility. Self-host mode shows local edge as today; cloud mode enforces BYOP.
  - **Affected endpoints**: `GET /api/edge-engines/`, `GET /active/by-scope/`, publish pipeline fan-out, `BuilderHeader.tsx` targets, `PagesPanel.tsx` targets.

---

## ✅ Completed

### 2026-03-23 — Edge Management API & DRY Refactor
- [x] `DrizzleStateProvider` base class — deduplicated ~280 lines across LocalSqlite + Turso providers
- [x] 4 new edge routes: `/api/workflows`, `/api/manage`, `/api/queue`, `/api/config` (all systemKeyAuth)
- [x] `IStateProvider` extended: `listWorkflows()`, `deleteWorkflow()`, `toggleWorkflow()` — all 5 providers
- [x] Edge `/api/config` endpoint — hot-reload cache/queue without redeploying
- [x] Source hash staleness detection — `get_source_hash()` + `sync_status` drift comparison
- [x] `test_engine_deploy.py` — 29 mocked integration tests

### 2026-03-23 — Edge Resources UI & UX
- [x] `EdgeResourceRow` shared component — icon box, subtitle, badges, metadata, actions
- [x] All 4 resource tabs unified (Compute, Database, Caching, Queues)
- [x] Provider icons + labels centralized (`PROVIDER_ICONS`, `ENGINE_PROVIDER_LABELS`, `ProviderBadge`)
- [x] Fixed `AccountResourcePicker` auto-select hiding "Create New" option
- [x] Fixed provider cache invalidation — `queryClient.invalidateQueries` replaces `refetch()` across all resource modals
- [x] Health endpoint `?key=` parameter support
- [x] `test_edge_auth.py` — 8 pytest tests for API key auth middleware

### 2026-03-14–16 — Engine Auth & Provider Discovery
- [x] `aiApiKeyAuth` middleware fixed for `FRONTBASE_API_KEY_HASHES`
- [x] Auto-redeploy engines on API key CRUD (CF patch + full redeploy for others)
- [x] Provider discovery refactor — registry pattern dispatch
- [x] Supabase pooler URI connection fix
- [x] Postgres Edge State Provider — `NeonHttpProvider`, `SupabaseRestProvider`, `CfD1HttpProvider` with `frontbase_edge` schema isolation
- [x] Edge request logging — `edge-logs.ts` route (POST bulk insert, GET paginated read)
- [x] Publish-state sync check — `batch/sync-check` endpoint, `sync_status`/`bundle_checksum` drift detection

### 2026-03-07 — Inspector IDE & Test Fixes
- [x] Source snapshot storage (`source_snapshot` column + `capture_source_snapshot()` + `GET /source` endpoint)
- [x] Inspector refactor — 860→260 lines, 6 sub-components (`inspector/` dir)
- [x] Monaco editor integration (`@monaco-editor/react` in `SourceViewer.tsx`)
- [x] IDE toolbar — Save All (`PUT /source`) + Compile & Deploy, dirty state tracking
- [x] `write_source_files()` with path traversal protection
- [x] Fixed 11 pytest failures (stale test DB schema + `test_edge_gpu.py` fixture)
- [x] Fixed 1 vitest failure (Jest→Vitest migration in `fastapi-integration.test.ts`)

### 2026-03-07 — Refactoring & Testing Batch
- [x] Split `publish.py` 469→140L — `services/page_hash.py` (50L) + `services/publish_serializer.py` (260L)
- [x] Extract `edge_caches.py` test helpers — `services/cache_tester.py` (90L)
- [x] Split `models/models.py` 408→30L re-export hub — `auth.py`, `sync.py`, `edge.py`, `page.py`
- [x] Split `EdgeCachesForm.tsx` 474→200L — `EdgeCacheDialog.tsx` (170L) + `useEdgeCacheForm.ts` (180L)
- [x] Split `nodeSchemas.ts` 1006→8 files — `nodeSchemas/` dir with domain files
- [x] Split `WorkflowEditor.tsx` 649→380L — `WorkflowEditorToolbar.tsx` (250L) + `WorkflowTestStatus.tsx` (45L)
- [x] Split `runtime.ts` 694→420L — `engine/node-executors.ts` (270L)
- [x] Split `AutomationsContentPanel.tsx` 310→65L — `AutomationsStatsCards.tsx` (55L) + `AutomationsTable.tsx` (190L)
- [x] `test_engine_deploy.py` — 11 tests (CF/Docker redeploy, GPU bindings, flush cache)
- [x] `test_cloudflare_api.py` — 19 tests (headers, creds, upload, secrets, delete)
- [x] `test_publish_pipeline.py` — 12 tests (page hash, component conversion, datasources)
- [x] `test_engine_reconfigure.py` — 10 tests (credential resolution, CF PATCH, orchestrator)
- [x] `import.test.ts` — 10 tests (POST import, DELETE, settings, status)
- [x] `test_bundle_hash.py` — 10 tests (compute_bundle_hash, get_source_hash)

### Earlier
- [x] **Multi-trigger publish fails for non-webhook triggers** — Fixed Zod validation error on the edge.
- [x] **Replace Tailwind CDN with build-time CSS generation** — Implemented via `tailwind_cli.py` + `@source inline()` in `css_bundler.py`.
- [x] **Conditional Service Deployment** — `docker-compose.standalone-edge.yml` and `docker-compose.distributed/` tier-based compose files.
- [x] **Cloudflare Workers Deployment** — Adapter pattern (`IEdgeAdapter`) with Docker and Cloudflare adapters. `deployment_targets` table.
- [x] **Automations-Only Bundle Template** — `engine/lite.ts` + `tsup.cloudflare-lite.ts`.
- [x] **Rename route `/frontbase-admin/actions` → `/frontbase-admin/automations`** — Router config, sidebar nav, deep-link route.
- [x] **Description field** — Editable description textarea in WorkflowEditor.
- [x] **Automation card improvements** — `is_active` badge, trigger type icons, last execution time.
- [x] **Persistent endpoint URL on automation card** — Webhook URL shown directly on card.
- [x] **Skip redundant publishes (content hash)** — `page_hash.py`, Drizzle `content_hash` column, migration v3.
- [x] **Edge CORS Origin Configuration** — CORS middleware in `engine/lite.ts`.
- [x] **Durable Workflow: Checkpointing** — `engine/checkpoint.ts`
- [x] **Durable Workflow: Rate limiting** — `engine/qstash.ts`
- [x] **Durable Workflow: Debouncing** — `engine/debounce.ts`
- [x] **Durable Workflow: DLQ wiring** — `dead_letters` table, `runtime.ts`, both storage providers
