# Frontbase Backlog

> Tags: `🐛 Bug` · `✨ New Feature` · `🔧 Improvement` · `🔌 Integration`

---

# 📋 TODO

## Backend

### Edge Infrastructure
- [ ] 🔧 **Edge DB quota guard** — Monitor row reads/writes (Turso/Neon), warn in UI, auto-fallback to local SQLite.
- [ ] 🔧 **Cache quota guard** — Monitor commands/month (Upstash), reduce TTL or disable L2 cache gracefully.
- [ ] 🔧 **Graceful provider downgrade** — Fall back to local SQLite/no-cache on edge DB/cache failure. Log and surface in status panel.
- [ ] 🔌 **Enterprise Secrets Management** — Infisical integration for deploy-time secrets injection, E2E encrypted storage, audit logs.
- [ ] 🔌 **Neon Auth Support** — Add Neon Auth as an auth provider option. Detect when auth provider has database capability and auto-suggest same datasource for contacts table.
- [ ] 🔌 **Observability** — Axiom/Sentry logging integration, OpenTelemetry tracing.

### Builder / SSR (Backend)
- [ ] ✨ **Private Page Enforcement** — Page gating (`pages.ts:360`): check `page.isPublic`, redirect unauthenticated. Auth middleware in Hono to verify JWT from cookie.
- [ ] ✨ **`/robots.txt` on Edge** — Auto-generated from project settings, served by Edge Worker.
- [ ] ✨ **`/sitemap.xml` on Edge** — Auto-generated from published page slugs in Turso, served by Edge Worker.
- [ ] ✨ **Version History & Rollback (Pages)** — Snapshot table (`page_versions`) with rollback, diff view, audit trail.

### Automations (Backend)
- [ ] ✨ **Data Change Trigger** — `data_change_trigger` node. On publish, auto-register webhook in data source (Supabase Database Webhooks / `pg_net`).
- [ ] ✨ **Queue Trigger (IoT / Message Bus)** — `queue_trigger` node. Push mode (QStash) + Pull mode (RabbitMQ/MQTT/self-hosted).
- [ ] ✨ **Schedule Trigger (QStash)** — `schedule_trigger` node. On publish, register QStash schedule. Cron expression + timezone.
- [ ] ✨ **Email Received Trigger** — `email_trigger` node via SendGrid/Mailgun/Postmark/Resend inbound parse.
- [ ] ✨ **Email node** — Send emails via configured SMTP or API (SendGrid/Resend).
- [ ] ✨ **Delay/Wait node** — Pause execution for a configurable duration.
- [ ] ✨ **Loop/Iterator node** — Iterate over array data from upstream nodes.
- [ ] ✨ **Version History & Rollback (Workflows)** — Snapshot table (`automation_draft_versions`) with rollback, diff, audit trail.
- [ ] ✨ **Durable Workflow Execution (remaining)** — Spike leveling (queue buffer), idempotency keys, cross-execution shared variables.
- [ ] ✨ **Node-level Output Caching** — Cache individual node outputs with configurable TTL, per-node cache key from input hash.
- [ ] ✨ **Manual Checkpoint Node** — User-placeable checkpoint node for explicit state saves inside loops.
- [ ] ✨ **Custom WebSockets** — Real-time workflow execution streaming (replacing Supabase Realtime).

### Cross-Bucket File Move (Backend + Frontend)
- [ ] ✨ **Cross-Bucket & Cross-Provider File Move** — `download_file()` on `StorageAdapter` ABC, `POST /api/storage/move-cross`, streaming for >50MB. Frontend: enhanced `MoveDialog` with bucket picker, folder browser, progress indicator.

---

## Frontend

### Builder / SSR (Frontend)
- [ ] 🐛 **SSR page width issue** — Page content doesn't span full viewport. Debug `renderPage()` viewport width, `containerStyles.values.size`, `.fb-page` width.
- [ ] ✨ **Auth Form component** — Login/Signup builder component with Edge SSR. Client-side auth via `supabase.auth.signInWithPassword()`/`signUp()`. JWT in httpOnly cookie.
- [ ] ✨ **Role-Based Visibility** — Component-level access rules ("Visible to roles"). Server-side filtering. User-scoped data queries via JWT for Supabase RLS.
- [ ] ✨ **PWA Support for Published Apps** — Dynamic Manifest, Service Worker, offline support, "Add to Home Screen" prompt.
- [ ] 🐛 **Better error toasts** — Parse and display structured error details from backend.
- [ ] ✨ **SSR/HTML Support for Supabase Edge Full Bundle** — Supabase rewrites `Content-Type: text/html` → `text/plain`. Requires reverse proxy, absolute CDN URLs for static assets, SSR setup guide in Inspector.

### Edge Infrastructure (Frontend)
- [ ] ✨ **Local Data Proxy (Hybrid Edge)** — Connect Edge workers to local/private infra via `serverless-redis-http` or Cloudflare Tunnels.
- [ ] ✨ **Multi-Provider Load Balancing** — DNS-level weighted routing across CF + Vercel + Netlify.
- [ ] ✨ **Live status panel** — Settings widget showing edge DB/cache/queue quotas, connection status, hit rate.
- [ ] ✨ **Provider switch confirmation** — Confirmation dialog when changing edge DB/cache/queue provider.
- [ ] ✨ **Inspector Health & Resource Metrics Panel** — Metrics tab: Worker CPU, memory, request count, error rate, Turso/Upstash usage.

### Automations (Frontend)
- [ ] ✨ **Execution detail view — Pipeline Diagram** — Horizontal pipeline (`Node → Node → Node`) with hover tooltips.
- [ ] ✨ **Branching workflow visualization** — Phase 2: render multi-branch/parallel-path workflows as a DAG.
- [ ] ✨ **Live execution streaming** — Real-time execution progress updates (WebSocket or polling).
- [ ] 🔧 **Execution log retention** — Configurable cleanup of old execution records.
- [ ] ✨ **UI Event Trigger** — `ui_event_trigger` node. Hydrated page calls `/api/execute/:id` on click/hover/submit.
- [ ] 🔧 **Required field validation** — Validate required inputs before save/publish, show warnings.
- [ ] 🔧 **Node connection validation** — Verify type compatibility between connected node outputs/inputs.
- [ ] 🔧 **Schema-driven defaults** — Ensure all node schemas define sensible defaults.

### Data Studio (Frontend)
- [ ] 🔧 **User-configurable FK display columns** — Select which columns to display for foreign key relationships.
- [ ] 🔧 **Optimized fetching** — Select specific columns instead of `*`.
- [ ] 🔧 **Heuristic FK detection fallback** — Auto-detect FKs based on column names.
- [ ] ✨ **Multi-level relation support** — Nested FK relationship fetching.

### Platform-Wide
- [ ] 🔧 **Optimize Caching & Refetch Strategy** — Unify React Query / Zustand cache behaviour. Consistent `staleTime`, `refetchOnWindowFocus: false`.
- [ ] ✨ **GDPR Compliance Enhancements** — Cookie Consent Banner, IP Anonymization, Privacy Policy Template, Data Retention Controls.
- [ ] ✨ **Admin User Management** — List, search, invite, delete Supabase auth users from dashboard. GoTrue Admin API for CRUD.
- [ ] ✨ **Multi-Tenant Cloud Mode (BYOP)** — `FRONTBASE_MODE=cloud|selfhost`. Cloud mode hides local edge, enforces BYOP (Bring Your Own Provider).

---

# ✅ Completed

## Backend

### 2026-03-23 — Edge Management API & DRY Refactor
- [x] `DrizzleStateProvider` base class — deduplicated ~280 lines across LocalSqlite + Turso providers
- [x] 4 new edge routes: `/api/workflows`, `/api/manage`, `/api/queue`, `/api/config` (all systemKeyAuth)
- [x] `IStateProvider` extended: `listWorkflows()`, `deleteWorkflow()`, `toggleWorkflow()` — all 5 providers
- [x] Edge `/api/config` endpoint — hot-reload cache/queue without redeploying
- [x] Source hash staleness detection — `get_source_hash()` + `sync_status` drift comparison
- [x] `test_engine_deploy.py` — 29 mocked integration tests
- [x] Removed Upstash as deploy provider (SDK, not hosting platform) — cleaned 5 files + 9 references

### 2026-03-14–16 — Engine Auth & Provider Discovery
- [x] `aiApiKeyAuth` middleware fixed for `FRONTBASE_API_KEY_HASHES`
- [x] Auto-redeploy engines on API key CRUD (CF patch + full redeploy for others)
- [x] Provider discovery refactor — registry pattern dispatch
- [x] Supabase pooler URI connection fix
- [x] Postgres Edge State Provider — `NeonHttpProvider`, `SupabaseRestProvider`, `CfD1HttpProvider` with `frontbase_edge` schema
- [x] Edge request logging — `edge-logs.ts` route (POST bulk insert, GET paginated read)
- [x] Publish-state sync check — `batch/sync-check` endpoint, `sync_status`/`bundle_checksum` drift detection
- [x] `test_edge_auth.py` — 8 pytest tests for API key auth middleware
- [x] Storage Adapters — `base.py` (ABC), `supabase_adapter.py`, `cloudflare_adapter.py` (R2), `vercel_adapter.py`, `netlify_adapter.py`, `factory.py`

### 2026-03-07 — Refactoring & Testing Batch
- [x] Extract Shared Edge Core — Refactored edge runtime into shared core + thin adapter wrappers (CF, Netlify, Vercel, Deno, etc)
- [x] Storage Architecture Refactor — Moved admin storage APIs to FastAPI for on-demand edge shipping
- [x] Backend Redis Caching — Caching for table/column metadata (Schema Discovery), external APIs, rate limiting
- [x] Split `publish.py` 469→140L — `page_hash.py` (50L) + `publish_serializer.py` (260L)
- [x] Extract `edge_caches.py` test helpers — `cache_tester.py` (90L)
- [x] Webhook Response Node (`http_response`) — custom response body/headers for webhook-triggered workflows
- [x] Split `models/models.py` 408→30L — `auth.py`, `sync.py`, `edge.py`, `page.py`
- [x] Split `runtime.ts` 694→420L — `engine/node-executors.ts` (270L)
- [x] Source snapshot storage — `capture_source_snapshot()` + `GET /source` + `PUT /source`
- [x] `write_source_files()` with path traversal protection
- [x] `test_engine_deploy.py` — 11 tests (CF/Docker redeploy, GPU bindings, flush cache)
- [x] `test_cloudflare_api.py` — 19 tests (headers, creds, upload, secrets, delete)
- [x] `test_publish_pipeline.py` — 12 tests (page hash, component conversion, datasources)
- [x] `test_engine_reconfigure.py` — 10 tests (credential resolution, CF PATCH, orchestrator)
- [x] `test_bundle_hash.py` — 10 tests (compute_bundle_hash, get_source_hash)
- [x] `import.test.ts` — 10 tests (POST import, DELETE, settings, status)

### Earlier
- [x] Multi-trigger publish fix — Zod validation error on edge
- [x] Replace Tailwind CDN with build-time CSS generation — `tailwind_cli.py` + `css_bundler.py`
- [x] Conditional Service Deployment — `docker-compose.standalone-edge.yml` + tier-based compose
- [x] Cloudflare Workers Deployment — `IEdgeAdapter` pattern, `deployment_targets` table
- [x] Automations-Only Bundle Template — `engine/lite.ts` + `tsup.cloudflare-lite.ts`
- [x] Skip redundant publishes (content hash) — `page_hash.py`, Drizzle `content_hash` column
- [x] Durable Workflow: Checkpointing, Rate limiting, Debouncing, DLQ wiring
- [x] Edge CORS Origin Configuration — CORS middleware in `engine/lite.ts`

---

## Frontend

### 2026-03-23 — Edge Resources UI & UX
- [x] `EdgeResourceRow` shared component — icon box, subtitle, badges, metadata, actions
- [x] All 4 resource tabs unified (Compute, Database, Caching, Queues)
- [x] Provider icons + labels centralized (`PROVIDER_ICONS`, `ENGINE_PROVIDER_LABELS`, `ProviderBadge`)
- [x] Capability-driven resource forms — derive DB/Cache/Queue provider options from `PROVIDER_CONFIGS` metadata, showing capability badges in connect dialogs
- [x] Capability-driven forms — `EDGE_DATABASE_PROVIDERS`, `EDGE_CACHE_PROVIDERS`, `EDGE_QUEUE_PROVIDERS` registries wired into all 3 forms
- [x] Fixed `AccountResourcePicker` auto-select hiding "Create New" option
- [x] Fixed provider cache invalidation — `queryClient.invalidateQueries` across all resource modals
- [x] Health endpoint `?key=` parameter support
- [x] Storage Provider Selector — multi-provider `storageProviderId` in FileBrowser

### 2026-03-07 — Inspector IDE & Refactoring
- [x] Inspector refactor — 860→260 lines, 6 sub-components (`inspector/` dir)
- [x] Split `FileBrowser/index.tsx` (818L) — extracted file tree rendering, toolbar, and file actions into subcomponents (now 300L orchestrator)
- [x] Execution history panel — Log view showing past executions with status, duration, trigger info per workflow
- [x] Monaco editor integration (`@monaco-editor/react` in `SourceViewer.tsx`)
- [x] IDE toolbar — Save All + Compile & Deploy, dirty state tracking
- [x] Split `EdgeCachesForm.tsx` 474→200L — `EdgeCacheDialog.tsx` (170L) + `useEdgeCacheForm.ts` (180L)
- [x] Split `nodeSchemas.ts` 1006→8 files — `nodeSchemas/` dir
- [x] Split `WorkflowEditor.tsx` 649→380L — `WorkflowEditorToolbar.tsx` + `WorkflowTestStatus.tsx`
- [x] Split `AutomationsContentPanel.tsx` 310→65L — `AutomationsStatsCards.tsx` + `AutomationsTable.tsx`
- [x] Fixed vitest failure (Jest→Vitest migration in `fastapi-integration.test.ts`)

### Earlier
- [x] Engine Type Selector in Deploy Dialog — Full Bundle toggle
- [x] One-Click Integrations — `AccountResourcePicker` + `POST /api/edge-providers/create-resource-by-account/`
- [x] Edge Inspector Dialog — split-pane layout: files + secrets + bindings (left), Monaco Editor (right)
- [x] Rename route `/frontbase-admin/actions` → `/frontbase-admin/automations`
- [x] Description field — editable description in WorkflowEditor
- [x] Automation card improvements — `is_active` badge, trigger type icons, last execution time
- [x] Persistent endpoint URL on automation card
