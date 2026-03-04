# Performance & Code Health Optimization Backlog

> Audit date: 2026-03-02
> Last updated: 2026-03-03
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

#### 🔴 `routers/edge_engines.py` — **974 lines** (Highest Priority)

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

#### 🔴 `routers/cloudflare.py` — **880 lines** (High Priority)

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

#### ⚠️ Shared Extraction: `services/bundle_hash.py`

Both `cloudflare.py` and `edge_engines.py` import `_get_source_hash`. After refactoring, this should live in a shared `services/bundle_hash.py` to avoid circular imports. The `edge_engines.py` redeploy also calls `_build_worker` — it should import from `services/bundle_builder.py`.

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
| `storage/TursoHttpProvider.ts` | **383** | Turso state provider — all CRUD in one file | Acceptable (single-concern provider) but monitor growth |
| `storage/LocalSqliteProvider.ts` | **354** | Local SQLite state provider | Same as above |

---

## 3. Architecture & Systems Design

### 3.1 Publish Pipeline (Resolved ✅)
- ~~Dual-write via `TursoPublishStrategy` + `fan_out_to_deployment_targets()`~~ → Consolidated to single path via `publish_to_target()` → edge `/api/import`

### 3.2 State Provider Duplication (Resolved ✅)
- ~~`db/pages-store.ts` duplicates `storage/LocalSqliteProvider.ts`~~ → **Archived**
- `db/project-settings.ts` — **Retained** (active import from `PageRenderer.ts` for `getFaviconUrl()`)

### 3.3 Edge Schema Duplication
- `publishedPages` table schema is defined in **both** `TursoHttpProvider.ts` (line 28) and `LocalSqliteProvider.ts` (line 28)
- If a column is added to one but not the other → schema drift
- **Action**: Extract shared schema into `storage/schema.ts` and import from both providers

### 3.4 Pydantic/Zod Schema Sync
- `fastapi-backend/app/schemas/publish.py` (Pydantic) and `services/edge/src/schemas/publish.ts` (Zod) must stay in sync
- No automated validation exists — drift is caught only by runtime errors
- **Action (Future)**: Consider generating Zod from Pydantic via codegen, or add a CI test that validates shape parity

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
| 1 | **Split `edge_engines.py` (974→5 files)** | 2 hr | 🔴 Highest — 6 concerns in 1 file, blocks clean maintenance | Pending |
| 2 | **Split `cloudflare.py` (880→6 files)** | 1.5 hr | 🔴 High — 5 concerns, shared bundle utils need extraction | Pending |
| 3 | ~~Archive `publish_strategy.py`~~ | 5 min | Removes 93 lines of dead code | ✅ Done |
| 4 | ~~Archive `db/pages-store.ts`~~ (kept `project-settings.ts`) | 5 min | Removes ~60 lines of dead code | ✅ Done |
| 5 | Extract shared Drizzle schema from providers | 30 min | Prevents future schema drift | Pending |
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
