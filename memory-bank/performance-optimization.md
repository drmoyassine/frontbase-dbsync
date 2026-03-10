# Performance & Code Health Optimization Backlog

> Audit date: 2026-03-02
> Last updated: 2026-03-07
> Generated from full codebase scan across FastAPI backend, Vite/React frontend, and Hono Edge service.

---

## 1. Open Refactoring Items

> Files still above the complexity threshold per AGENTS.md §4.1.

### Backend (Python)

All backend files reviewed and actioned. ✅

- ~~`supabase_adapter.py`~~ — Done (667→340L via `supabase_query.py`)
- ~~`css_bundler.py`~~ — Done (398→200L via `tailwind_generator.py`)
- `schema_comparison.py` — **Kept as-is** (339L, single concern: Zod↔Pydantic comparison)

### Frontend (TypeScript/React)

- `FileBrowser/index.tsx` (818L) — **Pending** (deferred to backlog)
- `BuilderHeader.tsx` (525L, 18KB) — **Pending** — Single component with 18 functions mixing publish logic, preview URLs, navigation, unsaved-changes handling, and UI rendering. Extract into:
  - `usePublishFlow.ts` — publish handlers (`handleSingleTargetPublish`, `handleMultiTargetPublish`, `handlePublishClick`, `toggleTarget`, `isTargetSynced`)
  - `useBuilderNavigation.ts` — navigation/save guards (`handleBackToDashboard`, `handleSaveAndNavigate`, `handleDiscardAndNavigate`)
  - `BuilderHeaderActions.tsx` — action buttons (publish dropdown, preview, save)
- ~~`DataColumnConfigurator.tsx`~~ — **File no longer exists** (deleted in prior refactoring)

### Edge (Hono Service)

All edge files reviewed and actioned. ✅

- ~~`routes/pages.ts`~~ — Done (537→420L via `ssr/htmlDocument.ts`)
- `DataTable.tsx` — **Kept as-is** (499L, single concern: already has utils/hooks extracted)

---

## 2. Open Architecture Items

### ~~Pydantic/Zod Schema Sync~~ ✅
- `test_schema_sync.py` — **18 tests** (expanded from 5)
  - P1 #5: 5 Pydantic↔Zod sync points + 7 infrastructure tests
  - P1 #6: 4 Drizzle↔migration column parity checks + 2 file existence tests
- ReactFlow intentional diffs handled via `allowed_extras` annotations
- **Automated CI guard** — any new field added to Zod without a Pydantic counterpart will fail

### ~~Dependency & Import Hygiene~~ ✅
- ~~`publish.py` inline import~~ — Resolved: `publish.py` was refactored in session 3, imports now at top-level in `crud.py` and `public.py`

### ~~Stale `advanced-query` 404 on VPS~~ ✅
- **Fixed**: `advanced_query` endpoint in `database.py` now catches the 404 from `get_project_context_sync` and returns `{"success": false, "error": "Database not configured", "rows": []}` instead of throwing HTTP 404

---

## 3. Open Test Plan (Prioritized by Risk)

> [!IMPORTANT]
> Current test coverage: Edge 74+ (9 files), Backend 142, Frontend 10 = **226+ total**.

### ~~🟡 P1 — High (Schema drift & contract validation)~~ ✅ Done

| # | Test Area | Tests | Status |
|---|---|---|---|
| 5 | **Pydantic ↔ Zod schema parity** | 12 | ✅ 5 sync points + 7 infra tests in `test_schema_sync.py` |
| 6 | **Drizzle schema consistency** | 6 | ✅ 4 table parity checks + 2 file tests in `test_schema_sync.py` |

### 🟢 P2 — Medium (UI + state management coverage)

| # | Test Area | Codebase | Est. Tests | Why Useful |
|---|---|---|---|---|
| 9 | **Auth flows** (login/logout/session) | Backend (pytest) | 4–5 | Session cookie handling, redirect logic |
| 10 | **Edge storage providers** (CRUD) | Edge (vitest) | 6–8 | `TursoHttpProvider` + `LocalSqliteProvider` — getPage, setPage, deletePage |
| 11 | **WorkflowEditor component** | Frontend (vitest) | 5–6 | Toolbar rendering, node selection, test execution state |
| 12 | **EdgeCachesForm** | Frontend (vitest) | 4–5 | Provider selection, QStash env paste, dual test toasts |
| 13 | **DataTable SSR** | Edge (vitest) | 3–4 | Ensure DataTable renders correct HTML for hydration |
| 14 | **FileBrowser component** | Frontend (vitest) | 3–4 | File tree rendering, upload/delete actions |

### ⚪ P3 — Low (Nice-to-have / code health)

| # | Test Area | Codebase | Est. Tests | Why |
|---|---|---|---|---|
| 15 | **CSS bundler** (`css_bundler.py`) | Backend (pytest) | 3–4 | Tree-shaking correctness |
| 16 | **LiquidJS variable resolution** | Edge (vitest) | 3–4 | Page/session/query scope rendering |
| 17 | **Schema comparison engine** | Backend (pytest) | 2–3 | Diff algorithm correctness |
| 18 | **`nodeSchemas.ts` validation** | Frontend (vitest) | 2–3 | Verify all node types have required fields |

### Total Remaining Tests: ~35–50

---

## 4. Completed Refactoring ✅

### Backend Splits
| File | Before → After | Extracted | Date |
|------|---------------|-----------|------|
| `routers/edge_engines.py` | 974 → 330L | `schemas/edge_engines.py`, `services/engine_deploy.py`, `services/engine_reconfigure.py`, `services/engine_test.py` | 2026-03-05 |
| `routers/cloudflare.py` | 880 → 270L | `schemas/cloudflare.py`, `services/cloudflare_api.py`, `services/bundle.py`, `routers/cloudflare_inspector.py` | 2026-03-05 |
| `routers/pages/publish.py` | 469 → 140L | `services/page_hash.py` (50L), `services/publish_serializer.py` (260L) | 2026-03-07 |
| `routers/edge_caches.py` | 330 → 247L | `services/cache_tester.py` (90L) | 2026-03-07 |
| `models/models.py` | 408 → 30L | `models/auth.py`, `models/sync.py`, `models/edge.py`, `models/page.py` | 2026-03-07 |
| `supabase_adapter.py` | 667 → 340L | `supabase_query.py` (220L) — DRY search helper | 2026-03-07 |
| `css_bundler.py` | 398 → 200L | `tailwind_generator.py` (190L) | 2026-03-07 |

### Frontend Splits
| File | Before → After | Extracted | Date |
|------|---------------|-----------|------|
| `nodeSchemas.ts` | 1006 → 8 files | `nodeSchemas/` dir | 2026-03-07 |
| `WorkflowEditor.tsx` | 649 → 380L | `WorkflowEditorToolbar.tsx`, `WorkflowTestStatus.tsx` | 2026-03-07 |
| `EdgeCachesForm.tsx` | 474 → 200L | `EdgeCacheDialog.tsx`, `useEdgeCacheForm.ts` | 2026-03-07 |
| `AutomationsContentPanel.tsx` | 310 → 65L | `AutomationsStatsCards.tsx`, `AutomationsTable.tsx` | 2026-03-07 |

### Edge Splits
| File | Before → After | Extracted | Date |
|------|---------------|-----------|------|
| `engine/runtime.ts` | 694 → 420L | `engine/node-executors.ts` (270L) | 2026-03-07 |
| `routes/pages.ts` | 537 → 420L | `ssr/htmlDocument.ts` (140L) | 2026-03-07 |
| `storage/TursoHttpProvider.ts` + `LocalSqliteProvider.ts` | — | Schema extracted to shared `storage/schema.ts` | 2026-03-05 |

### Dead Code Removal
- `publish_strategy.py` (93L) → archived
- `db/pages-store.ts` (~60L) → archived
- `/tmp/check_hash.py` → deleted
- `db/project-settings.ts` — **retained** (active import from `PageRenderer.ts`)

### Completed Architecture Items
- **Publish Pipeline** — Consolidated to single path via `publish_to_target()` → edge `/api/import`
- **State Provider Duplication** — `db/pages-store.ts` archived
- **Edge Schema Duplication** — Extracted to shared `storage/schema.ts`
- **Migration Runner Safety** — Version record inserted AFTER SQL succeeds + `ensureInitialized()` gate
- **QStash Coupling** — Extracted to `EdgeQueue` entity + `engine/queue.ts`
- **Import Double Init** — Removed module-level `stateProvider.init()`

### Completed Architecture Fixes
- **Import Hygiene** — `publish.py` refactored, imports at top-level
- **Stale `advanced-query` 404** — `database.py` returns graceful JSON instead of HTTP 404

---

## 5. Completed Test Suites ✅

| Suite | File | Tests | Date |
|-------|------|-------|------|
| P0 #1 | `test_engine_deploy.py` | 11 — CF/Docker redeploy, GPU bindings, flush cache | 2026-03-07 |
| P0 #2 | `test_cloudflare_api.py` | 19 — headers, creds, upload, secrets, delete | 2026-03-07 |
| P0 #3 | `test_publish_pipeline.py` | 12 — page hash, component conversion, datasources | 2026-03-07 |
| P0 #4 | `import.test.ts` | 10 — POST import, DELETE, settings, status | 2026-03-07 |
| P1 #7 | `test_bundle_hash.py` | 10 — compute_bundle_hash, get_source_hash | 2026-03-07 |
| P1 #8 | `test_engine_reconfigure.py` | 10 — credential resolution, CF PATCH, orchestrator | 2026-03-07 |

**Total: 67 → 129 pytest (+62 new), 9 vitest files (74+). Zero regressions.**

---

*Last updated: 2026-03-07 (Session 4 — schema parity P1 #5+#6 done, 18 sync tests)*
