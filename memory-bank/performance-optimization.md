# Performance & Code Health Optimization Backlog

> Audit date: 2026-03-02
> Last updated: 2026-03-05
> Generated from full codebase scan across FastAPI backend, Vite/React frontend, and Hono Edge service.

---

## 1. Dead Code Removal (High Priority) ✅

| File | Lines | Status | Action |
|------|-------|--------|--------|
| `fastapi-backend/app/services/publish_strategy.py` | 93 | ✅ **Archived** → `_archived/publish_strategy.py` | Done |
| `services/edge/src/db/pages-store.ts` | ~60 | ✅ **Archived** → `_archived/pages-store.ts` | Done |
| `services/edge/src/db/project-settings.ts` | ~50 | ⚠️ **NOT dead** — imported by `PageRenderer.ts` for `getFaviconUrl()` | **KEEP** |
| `/tmp/check_hash.py` | ~20 | ✅ Deleted | Done |

---

## 2. Large File Refactoring (AGENTS.md Compliance)

> AGENTS.md §4.1: Keep files focused. If a file contains multiple concerns, split it.

### Backend (Python)

#### ~~🔴 `routers/edge_engines.py` — **974 lines** → **330 lines** ✅ DONE (2026-03-05)~~

**Concern audit (6 distinct responsibilities):**

| Concern | Lines | Functions |
|---|---|---|
| Pydantic schemas (8 models) | 30–112 | `EdgeEngineCreate`, `Update`, `Response`, `TestConnectionResult`, `BatchRequest`, `BatchDeleteRequest`, `BatchToggleRequest`, `BatchResult` |
| Serializer + staleness | 119–199 | `_serialize_engine` |
| CRUD endpoints | 208–304 | `get_bundle_hashes`, `list`, `get`, `create`, `update` |
| Reconfigure (CF binding mgmt) | 307–516 | `ReconfigureRequest`, `FRONTBASE_BINDING_NAMES`, `reconfigure_engine` (190 lines!) |
| Redeploy (CF + Docker dual-mode) | 519–675 | `redeploy_engine` (157 lines!) |
| Test, Delete, Batch ops, Scope | 678–973 | `delete`, `test`, `_test_target_connection`, `_extract_cf_creds`, `_delete_cloudflare_worker*`, batch CRUD (3), `list_active_engines_by_scope` |

**Proposed split:**

| New File | Lines | Contains |
|---|---|---|
| `schemas/edge_engines.py` | ~90 | All 8 Pydantic schemas + `_serialize_engine` |
| `services/engine_deploy.py` | ~200 | `redeploy_engine` logic (CF + Docker paths), `_build_secrets_dict()` |
| `services/engine_reconfigure.py` | ~200 | `reconfigure_engine` logic, `FRONTBASE_BINDING_NAMES`, CF PATCH calls |
| `services/engine_test.py` | ~60 | `_test_target_connection`, `_delete_cloudflare_worker*`, `_extract_cf_creds` |
| `routers/edge_engines.py` | ~200 | Thin router: CRUD, batch endpoints, scope query — all delegating to services |

---

#### ~~🔴 `routers/cloudflare.py` — **880 lines** → **270 lines** ✅ DONE (2026-03-05)~~

**Concern audit (5 distinct responsibilities):**

| Concern | Lines | Functions |
|---|---|---|
| Pydantic schemas (5 models) | 45–74 | `ConnectRequest`, `DeployRequest`, `StatusRequest`, `TeardownRequest`, `InspectRequest` |
| CF API helpers (low-level HTTP) | 81–242 | `_get_provider_credentials`, `_headers`, `_list_workers`, `_detect_account_id`, `_upload_worker`, `_enable_workers_dev`, `_set_secrets` |
| Bundle hash & build utilities | 245–365 | `_compute_bundle_hash`, `_get_current_bundle_hash`, `_get_source_hash`, `_build_worker` |
| Deploy/status/teardown endpoints | 372–707 | `connect_cloudflare`, `deploy_to_cloudflare` (177 lines!), `cloudflare_status`, `teardown_cloudflare` |
| Inspector endpoints | 714–878 | `_inspect_content_sync`, `_inspect_settings_sync`, `inspect_worker_content`, `inspect_worker_settings`, `inspect_worker_secrets` |

**Proposed split:**

| New File | Lines | Contains |
|---|---|---|
| `schemas/cloudflare.py` | ~30 | `ConnectRequest`, `DeployRequest`, `StatusRequest`, `TeardownRequest`, `InspectRequest` |
| `services/cloudflare_api.py` | ~180 | All CF API v4 helpers: `_headers`, `_list_workers`, `_detect_account_id`, `_upload_worker`, `_enable_workers_dev`, `_set_secrets`, `_get_provider_credentials` |
| `services/bundle_hash.py` | ~60 | `_compute_bundle_hash`, `_get_source_hash`, `_get_current_bundle_hash` (shared by `edge_engines.py` too) |
| `services/bundle_builder.py` | ~80 | `_build_worker` — delegates to edge `/api/build-bundle` or local `npx tsup` |
| `routers/cloudflare.py` | ~250 | Thin router: `connect`, `deploy`, `status`, `teardown` — delegating to services |
| `routers/cloudflare_inspector.py` | ~170 | Inspector endpoints: `inspect_content`, `inspect_settings`, `inspect_secrets` + sync helpers |

---

#### ~~⚠️ Shared Extraction: `services/bundle.py`~~ ✅ DONE

Both `cloudflare.py` and `edge_engines.py` now import from `services/bundle.py` (hash + build), `services/secrets_builder.py` (DRY secrets), and `services/cloudflare_api.py` (CF HTTP helpers). Secret-building deduplication eliminated 3x copy-paste.

---

| File | Lines | Issue | Proposed Split |
|------|-------|-------|----------------|
| `services/sync/adapters/supabase_adapter.py` | **800** | Supabase adapter handles schema introspection, query building, and data fetching in one file | Split into `supabase_schema.py` (introspection), `supabase_query.py` (query builder), `supabase_adapter.py` (thin orchestrator) |
| `routers/pages/publish.py` | **441** | Mixes `compute_page_hash()`, `convert_to_publish_schema()`, and endpoint handler | Extract `services/page_hash.py` (hash util) and `services/publish_serializer.py` (schema conversion); leave `publish.py` as thin router |
| `routers/edge_caches.py` | **383** | Mixes CRUD, test endpoints, QStash inline test, and helper functions (`_test_cache`, `_test_upstash`, `_test_qstash`) | Extract `services/cache_tester.py` (test helpers), keep `edge_caches.py` as thin router with CRUD + test endpoints |
| `services/css_bundler.py` | **362** | CSS tree-shaking + bundling logic | Review for extraction of Tailwind v4 source-inline logic into separate utility |
| `middleware/schema_comparison.py` | **339** | Schema diff/comparison engine | Review — may be acceptable if single-concern |
| `models/models.py` | **303** | All ORM models in one file | Split by domain: `models/page.py`, `models/edge.py`, `models/settings.py` |

### Frontend (TypeScript/React)

| File | Lines | Issue | Proposed Split |
|------|-------|-------|----------------|
| `lib/workflow/nodeSchemas.ts` | **891** | All workflow node definitions in one file | Group by node category (triggers, actions, conditions) |
| `components/dashboard/FileBrowser/index.tsx` | **818** | File browser UI + logic in one component | Extract file tree rendering, toolbar, and file actions into subcomponents |
| `components/dashboard/settings/shared/EdgeCachesForm.tsx` | **635** ⚠️ | Was 434 — grew +201 from modal dialog, QStash .env paste, dual test toast logic. Mixes form state (15+ useState), CRUD handlers, provider selection, QStash env parsing, test logic, and 3 render blocks (dialog, list, card) | Extract: `EdgeCacheDialog.tsx` (modal form + QStash section), `useEdgeCacheForm.ts` (form state + handlers), keep `EdgeCachesForm.tsx` as list + layout |
| `components/actions/editor/WorkflowEditor.tsx` | **599** | Massive inline JSX toolbar + editor logic | Extract `WorkflowEditorHeader.tsx` and `WorkflowTestStatus.tsx` |
| `components/builder/data-table/DataColumnConfigurator.tsx` | **489** | Column configuration UI | Extract column type pickers and sorting config into subcomponents |
| `modules/dbsync/components/dashboard/AutomationsContentPanel.tsx` | **306** | Mixes data fetching, pagination, analytics, and table UI | Extract `AutomationsAnalytics.tsx`, `AutomationsTable.tsx`, and `useAutomationsList.ts` hook |

### Edge (Hono Service)

| File | Lines | Issue | Proposed Split |
|------|-------|-------|----------------|
| `engine/runtime.ts` | **540** | Runtime engine: request routing + SSR + data fetching | Extract data fetching into `engine/data-fetcher.ts`; keep routing in `runtime.ts` |
| `routes/pages.ts` | **536** | Page serving route with SSR rendering inline | Extract SSR template assembly into `ssr/template.ts` |
| `components/datatable/DataTable.tsx` | **498** | DataTable SSR component | Review — may be acceptable as single rendering component |
| `storage/TursoHttpProvider.ts` | **365** | Turso state provider — all CRUD in one file | ✅ Schema extracted to `schema.ts` |
| `storage/LocalSqliteProvider.ts` | **340** | Local SQLite state provider | ✅ Schema extracted to `schema.ts` |

---

## 3. Architecture & Systems Design

### 3.1 Publish Pipeline (Resolved ✅)
- ~~Dual-write via `TursoPublishStrategy` + `fan_out_to_deployment_targets()`~~ → Consolidated to single path via `publish_to_target()` → edge `/api/import`

### 3.2 State Provider Duplication (Resolved ✅)
- ~~`db/pages-store.ts` duplicates `storage/LocalSqliteProvider.ts`~~ → **Archived**
- `db/project-settings.ts` — **Retained** (active import from `PageRenderer.ts` for `getFaviconUrl()`)

### 3.3 Edge Schema Duplication (Resolved ✅ — 2026-03-05)
- ~~`publishedPages` table schema defined in both providers~~ → Extracted to shared `storage/schema.ts`
- Both `TursoHttpProvider.ts` and `LocalSqliteProvider.ts` now import from single source
- `LocalSqliteProvider` re-exports for backward compatibility

### 3.4 Pydantic/Zod Schema Sync (Partial ✅ — 2026-03-05)
- Created `tests/test_schema_sync.py` — automated field parity checks between `api-contracts.ts` Zod schemas and backend models
- 5 sync tests: `PageSchema` fields, `ColumnSchema` fields, `EdgeEngine` TS interface shape
- **Future**: Consider generating Zod from Pydantic via codegen for full automation

### 3.5 Migration Runner Safety (Resolved ✅)
- ~~`edge-migrations.ts` marks version applied before SQL~~ → Fixed: version record now inserted AFTER SQL succeeds
- Added `ensureInitialized()` init gate in `storage/index.ts` Proxy — prevents CF Worker race condition where DB operations run before migrations complete

### 3.6 QStash Coupling (Resolved ✅ — 2026-03-04)
- ~~QStash credentials on `EdgeCache` model~~ → Extracted into `EdgeQueue` entity (peer to EdgeDB + EdgeCache)
- `engine/queue.ts` replaces `qstash.ts` — reads `FRONTBASE_QUEUE_*` with `QSTASH_*` fallback
- Per-workflow rate limiting + debounce via `workflow.settings` (no longer hardcoded)
- QStash signature verification on `/api/execute/:id` when `Upstash-Signature` header present

---

## 4. Dependency & Import Hygiene

### 4.1 Backend
- `publish_strategy.py` imports `EdgeEngine` and `httpx` but the file should be deleted entirely
- `publish.py` uses `from ...models.models import EdgeEngine, PageDeployment` inline inside the endpoint — should be top-level

### 4.2 Edge
- ~~`import.ts` double init~~ → ✅ Removed module-level `stateProvider.init()`. Init is now gated through the Proxy's `ensureInitialized()` on first method call.

---

## 5. Priority Order

> [!TIP]
> Ordered by impact × effort ratio. Quick wins first.

| # | Item | Effort | Impact | Status |
|---|------|--------|--------|--------|
| 1 | ~~**Split `edge_engines.py` (974→5 files)**~~ | 2 hr | 🔴 Highest — 6 concerns in 1 file | ✅ Done (2026-03-05) |
| 2 | ~~**Split `cloudflare.py` (880→6 files)**~~ | 1.5 hr | 🔴 High — 5 concerns, shared bundle utils | ✅ Done (2026-03-05) |
| 3 | ~~Archive `publish_strategy.py`~~ | 5 min | Removes 93 lines of dead code | ✅ Done |
| 4 | ~~Archive `db/pages-store.ts`~~ (kept `project-settings.ts`) | 5 min | Removes ~60 lines of dead code | ✅ Done |
| 5 | ~~Extract shared Drizzle schema from providers~~ | 30 min | Prevents future schema drift | ✅ Done (2026-03-05) |
| 6 | ~~Remove double `stateProvider.init()`~~ | 5 min | Removes redundant DB init | ✅ Done |
| 7 | ~~Fix migration runner version tracking~~ | 15 min | Prevents phantom migrations | ✅ Done |
| 8 | Split `publish.py` into router + services | 30 min | AGENTS.md compliance | Pending |
| 9 | Split `models/models.py` by domain | 45 min | Maintainability | Pending |
| 10 | Split `nodeSchemas.ts` by node category | 30 min | Reduces cognitive load | Pending |
| 11 | Split `FileBrowser/index.tsx` into subcomponents | 1 hr | React best practices | Pending |
| 12 | Split `runtime.ts` data-fetching logic | 45 min | Separation of concerns | Pending |
| 13 | Split `WorkflowEditor.tsx` into subcomponents | 45 min | Extracts massive inline toolbars/state | Pending |
| 14 | Split `AutomationsContentPanel.tsx` into subcomponents | 45 min | Extracts analytics, filters, tables | Pending |
| 15 | Fix stale `advanced-query` 404 on VPS (no Supabase) | 30 min | Prevents noisy 404s in logs | Low Priority |
| 16 | **Split `EdgeCachesForm.tsx` (635→~200 + 250 + 150)** | 45 min | Extract `EdgeCacheDialog.tsx`, `useEdgeCacheForm.ts` hook | Pending |
| 17 | **Extract `edge_caches.py` test helpers (383→~200 + 180)** | 20 min | Move `_test_cache`, `_test_upstash`, `_test_qstash` into `services/cache_tester.py` | Pending |

### Item 11: Stale `advanced-query` 404 Details

**Symptom:** `POST /api/database/advanced-query` returns 404 on VPS when Supabase isn't configured.

**Root cause chain:**
1. `dashboard.ts` persists `connections.supabase.connected` in localStorage (line 126)
2. `PropertiesPanel.tsx` calls `initialize()` on every component selection (line 80)
3. `syncConnectionStatus()` reads stale `connected: true` from the dashboard store
4. `fetchGlobalSchema()` fires `POST /api/database/advanced-query` → `get_project_context_sync()` throws `HTTPException(404, "Supabase connection not configured")`

**Partial fix applied:** `syncConnectionStatus` now calls `fetchConnections()` first (commit `b672e90`), but may have race conditions with localStorage hydration.

**Recommended full fix (two-layer):**
- **Frontend:** Don't persist `connections` in dashboard store, OR guard `fetchGlobalSchema` with a try/catch that silently handles 404
- **Backend:** Change `advanced_query` endpoint to return `{"success": false, "error": "Database not configured", "rows": []}` instead of HTTP 404 when Supabase isn't configured

---

## 6. Future Test Plan (Prioritized by Risk)

> [!IMPORTANT]
> Current test coverage: Edge 64, Backend 43, Frontend 10 = **117 total**.
> The items below are ordered by **risk of silent breakage** × **frequency of change**.

### 🔴 P0 — Critical (Untested paths that touch production deploys)

| # | Test Area | Codebase | Est. Tests | Why Critical |
|---|---|---|---|---|
| 1 | **`edge_engines.py` redeploy** (157 lines) | Backend (pytest) | 8–10 | Dual-mode CF+Docker redeploy, bundle hash comparison, secret injection — **zero test coverage, touches prod infra** |
| 2 | **`cloudflare.py` deploy** (177 lines) | Backend (pytest) | 8–10 | CF API calls, bundle upload, secret injection, workers.dev toggle — **untested, one wrong header = broken deploy** |
| 3 | **Publish pipeline** (`pages/publish.py`) | Backend (pytest) | 6–8 | `compute_page_hash`, `convert_to_publish_schema`, fan-out to targets — **if publish breaks, all pages go stale** |
| 4 | **Edge `/api/import` route** | Edge (vitest) | 4–5 | Import endpoint receives published pages, writes to storage — **if this breaks, no deploys land** |

### 🟡 P1 — High (Schema drift & contract validation)

| # | Test Area | Codebase | Est. Tests | Why Important |
|---|---|---|---|---|
| 5 | **Pydantic ↔ Zod schema parity** | CI script | 3–5 | `publish.py` (Pydantic) vs `publish.ts` (Zod) — **no automated check, drift caught only by runtime** |
| 6 | **Drizzle schema consistency** | Edge (vitest) | 2–3 | `TursoHttpProvider` vs `LocalSqliteProvider` table definitions — **if they drift, data goes missing per-provider** |
| 7 | **Bundle hash correctness** | Backend (pytest) | 3–4 | `_compute_bundle_hash`, `_get_source_hash` shared between CF and Docker deploys — **wrong hash = unnecessary redeploys or missed updates** |
| 8 | **`reconfigure_engine`** (190 lines) | Backend (pytest) | 5–6 | CF binding management — **untested, modifies live worker bindings** |

### 🟢 P2 — Medium (UI + state management coverage)

| # | Test Area | Codebase | Est. Tests | Why Useful |
|---|---|---|---|---|
| 9 | **Auth flows** (login/logout/session) | Backend (pytest) | 4–5 | Session cookie handling, redirect logic |
| 10 | **Edge storage providers** (CRUD) | Edge (vitest) | 6–8 | `TursoHttpProvider` + `LocalSqliteProvider` — getPage, setPage, deletePage |
| 11 | **WorkflowEditor component** | Frontend (vitest) | 5–6 | Toolbar rendering, node selection, test execution state |
| 12 | **EdgeCachesForm** (635 lines) | Frontend (vitest) | 4–5 | Provider selection, QStash env paste, dual test toasts |
| 13 | **DataTable SSR** | Edge (vitest) | 3–4 | Ensure DataTable renders correct HTML for hydration |
| 14 | **FileBrowser component** | Frontend (vitest) | 3–4 | File tree rendering, upload/delete actions |

### ⚪ P3 — Low (Nice-to-have / code health)

| # | Test Area | Codebase | Est. Tests | Why |
|---|---|---|---|---|
| 15 | **CSS bundler** (`css_bundler.py`) | Backend (pytest) | 3–4 | Tree-shaking correctness |
| 16 | **LiquidJS variable resolution** | Edge (vitest) | 3–4 | Page/session/query scope rendering |
| 17 | **Schema comparison engine** | Backend (pytest) | 2–3 | Diff algorithm correctness |
| 18 | **`nodeSchemas.ts` validation** | Frontend (vitest) | 2–3 | Verify all node types have required fields |

### Total Future Tests: ~70–90

> [!CAUTION]
> **Stressing items:**
> - **P0 #1 & #2** (`edge_engines.py` redeploy + `cloudflare.py` deploy) are the **highest risk untested code in the entire codebase**. These functions modify live production infrastructure (CF workers, Docker containers) with zero automated guard rails. A regression here silently breaks all deployments. *(Code now refactored into `services/engine_deploy.py` and `services/cloudflare_api.py` — easier to test.)*
> - **P1 #5** (Pydantic ↔ Zod parity) — initial `test_schema_sync.py` added (5 tests). Covers `PageSchema`, `ColumnSchema`, `EdgeEngine` interface.
> - ~~**P1 #6** (Drizzle schema consistency)~~ — **Resolved.** Both providers now import from shared `storage/schema.ts`.

---

*Last updated: 2026-03-05*
