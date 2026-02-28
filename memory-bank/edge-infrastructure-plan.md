# Edge Infrastructure Master Plan

> Last Updated: 2026-03-01
> Source of truth for edge infrastructure phasing. For strategic architecture see `edge-architecture.md`.

---

## Previously Completed
- [x] AGENTS.md compliance (staleTime, Release-Before-IO)
- [x] Split EdgeEnginesPanel.tsx (728 -> 25 lines)
- [x] Housekeeping + verification

---

## Phase 1: Multi-Cache & Engine Card UI ✅
- [x] Create EdgeCache model + Alembic migration
- [x] Create `/api/edge-caches` CRUD endpoints
- [x] Create EdgeCachesForm.tsx (replace global Redis form)
- [x] Add DB + Cache name badges to Engine Cards
- [x] Add ReconfigureEngineDialog.tsx

## Phase 2: Provider-Agnostic Bundle Architecture (Partially Complete)

### Completed ✅
- [x] Composable Cache adapters (Upstash HTTP, IoRedis TCP, Null — auto-detected via `FRONTBASE_CACHE_URL` protocol)
- [x] Create `engine/lite.ts` (core + workflows + LiquidJS) — standalone `liteApp` with root info route
- [x] Create `engine/full.ts` (lite + SSR + React) — extends `createLiteApp()`, adds page routes
- [x] Adopt Hono middleware: streaming, etag, timing, bodyLimit, secureHeaders, requestId, timeout, cors
- [x] New tsup configs: `tsup.cloudflare.ts` (full), `tsup.cloudflare-lite.ts` (lite)
- [x] Rename env vars: `UPSTASH_REDIS_REST_*` → `FRONTBASE_CACHE_URL/TOKEN` (provider-agnostic)
- [x] Reconfigure endpoint: CF Settings API PATCH + DELETE legacy secrets
- [x] Root fallback pages: JSON info responses for both lite and full (no-homepage) bundles
- [x] CORS middleware for cross-origin inspect (`origin: '*'`, commit `ab4f55d`)

### Completed in Feb 28 Session ✅
- [x] Init gate (`ensureInitialized()` Proxy in `storage/index.ts`) — prevents CF Worker race conditions
- [x] Migration runner fix — version record inserted AFTER SQL succeeds (`edge-migrations.ts`)
- [x] Dead init removal — removed module-level `stateProvider.init()` from `import.ts`
- [x] Dead code archived — `publish_strategy.py`, `pages-store.ts` → `_archived/`
- [x] Pre-flight health check in `publish_to_target` and `reconfigure_engine`
- [x] `wrangler.toml` name alignment with engine DB records

### Pending
- [ ] Composable State DB adapters (Turso, Neon, Supabase, SQLite, Null) — currently only Turso + LocalSqlite
- [ ] Rewrite provider adapters as thin wrappers (`engine/core.ts` extraction)
- [ ] UI: Engine Type selector in deploy dialog

## Phase 3: Edge Inspector (Mission Control) (Partially Complete)

### Completed ✅
- [x] Backend inspector endpoints — `cloudflare.py`: `inspect/content` (L734), `inspect/secrets` (L780), `inspect/settings` (L756)
- [x] `EdgeInspectorDialog.tsx` exists at `src/components/dashboard/settings/shared/EdgeInspectorDialog.tsx`

### Pending
- [ ] Monaco code viewer integration (dependency available: `@monaco-editor/react`)
- [ ] Health & Resource metrics panel
- [ ] Bundle-type awareness (hide tabs for Lite engines)
- [ ] Edge Code Editor (Inspector IDE) — AI agent + human source editing → compile → deploy (see BACKLOG.md)

## Phase 4: Enterprise Secrets Management (Open Question — Deferred)

### Option A: Infisical Integration
- Integrate Infisical SDK for centralized secrets sync
- Staging/Prod environment separation
- Requires self-hosted Infisical instance (heavy — Docker, PostgreSQL, Redis, SMTP)

### Option B: Infisical-as-a-Worker (Multi-Tenant Secrets Service)
- Standalone CF Worker (`frontbase-secrets`) as a lightweight, multi-tenant secrets manager
- Each Frontbase instance (self-hosted or cloud) registers as a tenant
- Secrets stored encrypted in Turso/D1, accessed via API key
- No Infisical dependency — purpose-built for Frontbase's edge-native architecture
- Could serve as a shared service across all Frontbase deployments

### Open Questions
1. Is Infisical too heavyweight for self-hosted community users?
2. Can a custom secrets Worker replace Infisical's core value (versioning, rotation, audit)?
3. Should this be a cloud-only service or also self-hostable?
4. Multi-tenant model: one secrets Worker serving all Frontbase instances — pricing/operational model?

---

## Priority Queue (Verified 2026-03-01)

### P1: E2E Verification of Deployed Workers ✅ (Resolved Feb 28)
- [x] Hit deployed worker health endpoint — `GET /api/health` returns 200
- [x] Deploy Full worker + test SSR page — page served at CF Worker URL
- [x] Verify Turso DB gets data — `publish_to_target` → `POST /api/import` → TursoHttpProvider writes
- [x] Verify publish to new and old CF Workers — confirmed by user
- [ ] Deploy a workflow to CF Lite + execute it — **pending** (workflow deploy not yet wired)

### P2: Publish Pages & Automations to Edge Engines
- [x] Verify page publish pushes to CF Workers — confirmed working (single-target via `publish_to_target()`)
- [x] Test: publish a page → confirm it appears on CF Worker — ✅
- [ ] Extend workflow publish with same pattern — deploy workflow definitions to edge `/api/deploy`
- [ ] Test: publish a workflow → confirm callable on Workers via `/api/execute` and `/api/webhook`

### P3: Code Cleanup ✅ (Resolved Feb 28)
- [x] `db/pages-store.ts` — archived to `_archived/`
- [x] `publish_strategy.py` — archived to `_archived/`
- [x] `db/project-settings.ts` — NOT dead (used by `PageRenderer.ts` for `getFaviconUrl()`)
- [x] Module-level `stateProvider.init()` removed from `import.ts`
- Remaining items tracked in `performance-optimization.md`

### P4: Refactoring Large Files
Tracked in `performance-optimization.md` items 6-10. Lower priority — do incrementally when working in affected files.
