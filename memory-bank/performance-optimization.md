# Performance & Code Health Optimization Backlog

> Audit date: 2026-02-28
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

| File | Lines | Issue | Proposed Split |
|------|-------|-------|----------------|
| `services/sync/adapters/supabase_adapter.py` | **800** | Supabase adapter handles schema introspection, query building, and data fetching in one file | Split into `supabase_schema.py` (introspection), `supabase_query.py` (query builder), `supabase_adapter.py` (thin orchestrator) |
| `routers/pages/publish.py` | **441** | Mixes `compute_page_hash()`, `convert_to_publish_schema()`, and endpoint handler | Extract `services/page_hash.py` (hash util) and `services/publish_serializer.py` (schema conversion); leave `publish.py` as thin router |
| `services/css_bundler.py` | **362** | CSS tree-shaking + bundling logic | Review for extraction of Tailwind v4 source-inline logic into separate utility |
| `middleware/schema_comparison.py` | **339** | Schema diff/comparison engine | Review — may be acceptable if single-concern |
| `models/models.py` | **303** | All ORM models in one file | Split by domain: `models/page.py`, `models/edge.py`, `models/settings.py` |

### Frontend (TypeScript/React)

| File | Lines | Issue | Proposed Split |
|------|-------|-------|----------------|
| `lib/workflow/nodeSchemas.ts` | **891** | All workflow node definitions in one file | Group by node category (triggers, actions, conditions) |
| `components/dashboard/FileBrowser/index.tsx` | **818** | File browser UI + logic in one component | Extract file tree rendering, toolbar, and file actions into subcomponents |
| `components/builder/data-table/DataColumnConfigurator.tsx` | **489** | Column configuration UI | Extract column type pickers and sorting config into subcomponents |
| `components/dashboard/settings/shared/EdgeCachesForm.tsx` | **434** | Edge cache settings form | Extract cache config sections into subcomponents |

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
| 1 | ~~Archive `publish_strategy.py`~~ | 5 min | Removes 93 lines of dead code | ✅ Done |
| 2 | ~~Archive `db/pages-store.ts`~~ (kept `project-settings.ts`) | 5 min | Removes ~60 lines of dead code | ✅ Done |
| 3 | Extract shared Drizzle schema from providers | 30 min | Prevents future schema drift | Pending |
| 4 | ~~Remove double `stateProvider.init()`~~ | 5 min | Removes redundant DB init | ✅ Done |
| 5 | ~~Fix migration runner version tracking~~ | 15 min | Prevents phantom migrations | ✅ Done |
| 6 | Split `publish.py` into router + services | 30 min | AGENTS.md compliance | Pending |
| 7 | Split `models/models.py` by domain | 45 min | Maintainability | Pending |
| 8 | Split `nodeSchemas.ts` by node category | 30 min | Reduces cognitive load | Pending |
| 9 | Split `FileBrowser/index.tsx` into subcomponents | 1 hr | React best practices | Pending |
| 10 | Split `runtime.ts` data-fetching logic | 45 min | Separation of concerns | Pending |
| 11 | Fix stale `advanced-query` 404 on VPS (no Supabase) | 30 min | Prevents noisy 404s in logs | Low Priority |

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
