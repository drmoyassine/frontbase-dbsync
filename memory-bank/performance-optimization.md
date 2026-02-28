# Performance & Code Health Optimization Backlog

> Audit date: 2026-02-28
> Generated from full codebase scan across FastAPI backend, Vite/React frontend, and Hono Edge service.

---

## 1. Dead Code Removal (High Priority)

| File | Lines | Status | Action |
|------|-------|--------|--------|
| `fastapi-backend/app/services/publish_strategy.py` | 93 | **No callers** — `fan_out_to_deployment_targets()` is unreferenced after publish consolidation | **DELETE entire file** |
| `services/edge/src/db/pages-store.ts` | ~60 | **No imports** — superseded by `storage/LocalSqliteProvider.ts` | **DELETE** |
| `services/edge/src/db/project-settings.ts` | ~50 | **No imports** — superseded by `storage/` providers | **DELETE** |
| `/tmp/check_hash.py` | ~20 | Scratch debug script | **DELETE** |

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

### 3.2 State Provider Duplication
- `db/pages-store.ts` and `db/project-settings.ts` are **dead files** that duplicate `storage/LocalSqliteProvider.ts` logic
- The old `db/` pattern uses raw `drizzle(createClient(...))` outside the provider abstraction
- **Action**: Delete both files

### 3.3 Edge Schema Duplication
- `publishedPages` table schema is defined in **both** `TursoHttpProvider.ts` (line 28) and `LocalSqliteProvider.ts` (line 28)
- If a column is added to one but not the other → schema drift
- **Action**: Extract shared schema into `storage/schema.ts` and import from both providers

### 3.4 Pydantic/Zod Schema Sync
- `fastapi-backend/app/schemas/publish.py` (Pydantic) and `services/edge/src/schemas/publish.ts` (Zod) must stay in sync
- No automated validation exists — drift is caught only by runtime errors
- **Action (Future)**: Consider generating Zod from Pydantic via codegen, or add a CI test that validates shape parity

### 3.5 Migration Runner Safety
- `edge-migrations.ts` marks a version as applied (`INSERT OR IGNORE`) **before** running its SQL
- If the SQL fails (non-duplicate error), the version is marked applied but the change didn't happen
- **Action**: Move `INSERT INTO _schema_version` to AFTER successful SQL execution

---

## 4. Dependency & Import Hygiene

### 4.1 Backend
- `publish_strategy.py` imports `EdgeEngine` and `httpx` but the file should be deleted entirely
- `publish.py` uses `from ...models.models import EdgeEngine, PageDeployment` inline inside the endpoint — should be top-level

### 4.2 Edge
- `import.ts` line 254 calls `stateProvider.init()` at module-load time, AND `sync.ts` line 214 also calls `stateProvider.init()` — **double initialization**. Remove the one in `import.ts` since startup sync handles it.

---

## 5. Priority Order

> [!TIP]
> Ordered by impact × effort ratio. Quick wins first.

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | Delete `publish_strategy.py` (dead file) | 5 min | Removes 93 lines of dead code |
| 2 | Delete `db/pages-store.ts` + `db/project-settings.ts` | 5 min | Removes ~110 lines of dead code |
| 3 | Extract shared Drizzle schema from providers | 30 min | Prevents future schema drift |
| 4 | Remove double `stateProvider.init()` in `import.ts` | 5 min | Removes redundant DB init |
| 5 | Fix migration runner version tracking order | 15 min | Prevents phantom "applied" migrations |
| 6 | Split `publish.py` into router + services | 30 min | AGENTS.md compliance |
| 7 | Split `models/models.py` by domain | 45 min | Maintainability |
| 8 | Split `nodeSchemas.ts` by node category | 30 min | Reduces cognitive load |
| 9 | Split `FileBrowser/index.tsx` into subcomponents | 1 hr | React best practices |
| 10 | Split `runtime.ts` data-fetching logic | 45 min | Separation of concerns |
