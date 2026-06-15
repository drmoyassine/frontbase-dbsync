# Tenant Scoping & Multi-Binding Edge Engines — Corrected Plan

Secures unscoped data sources in multi-tenant environments and moves edge engines
from project-wide to per-engine, multi-binding data/storage configuration.

This revision corrects three blocking errors in the original draft (cross-registry
relationships, a dead `unified.db` read path, and a non-existent `FRONTBASE_STORAGE`
compile step) and fills several isolation gaps. **Phase 1 is the actual vulnerability
fix and ships independently of Phase 2.**

---

## Architectural Constraints (read first)

These facts drive the design and were the source of the original draft's errors:

1. **Two declarative registries, one physical DB.** `Datasource` is mapped under
   `app.services.sync.database.Base`; `EdgeEngine`, `StorageProvider`, `Project` under
   `app.database.config.Base`. In both SQLite (`frontbase.db`) and Postgres modes the two
   Bases resolve to the **same physical database**, so cross-table SQL works — but
   SQLAlchemy **string-based `relationship()` resolution is registry-scoped** and cannot
   bridge the two. The main session already queries the sync model directly
   (`db.query(Datasource)` in `secrets_builder._build_auth_config`), proving querying works
   while `relationship("Datasource")` from a main-Base class would fail at mapper config.
   → **Use explicitly-queried association tables, never an ORM many-to-many across Bases.**

2. **`_build_datasources_config` currently reads a dead DB.** It opens `unified.db` via raw
   `sqlite3` (`secrets_builder.py:400`), but only `_archived_unified.db` (0 bytes) exists and
   real data lives in `frontbase.db`; in Postgres mode `unified.db` never exists. So
   **`FRONTBASE_DATASOURCES` is currently always empty.** The rewrite must move this onto the
   ORM `db` session, which also fixes this latent bug.

3. **`FRONTBASE_STORAGE` is not compiled by the backend.** It is consumed by the edge runtime
   (`services/edge/dist/*`) but no code in `secrets_builder.py` (or elsewhere in the backend)
   ever emits it. `StorageProvider` already has a `project_id` column, so storage is
   project-scoped at rest — the missing piece is *per-engine binding + provisioning*, not
   "switching project-wide compilation."

---

## Open Question — Data Migration for Existing Datasources

**Recommendation: Option A** — backfill all existing `datasources.project_id IS NULL` rows to
the default project (`Project.tenant_id IS NULL`) on first startup. **Note the auto-migrator
only *adds the column*** (`sync/database._add_missing_columns` performs nullable column adds,
not data backfill), so Option A requires an explicit one-time backfill step (Phase 1, below).
Option B (leave null = globally accessible) is rejected — it leaves a standing isolation hole.

---

## Phase 1 — Tenant-Scope Data Sources (the vulnerability fix; ship first)

### [MODIFY] `fastapi-backend/app/services/sync/models/datasource.py`
* Add `project_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)`.
  Raw String, **no `ForeignKey`** (cross-registry — would break sync-service startup
  compilation).
* **Relax the global unique name constraint.** `name` is currently `unique=True` (global),
  which lets Tenant A's "Production" block Tenant B from creating one — both a UX break and an
  existence-leak. Replace with a composite `UniqueConstraint("project_id", "name")` via
  `__table_args__` and drop `unique=True` on the column. (Composite-unique change is a schema
  change — see migration note.)

### [MODIFY] `fastapi-backend/app/services/sync/routers/datasources/crud.py`
* Add `ctx: TenantContext | None = Depends(get_tenant_context)` to **all five** endpoints —
  `create`, `list`, `get`, `update`, `delete`. The draft omitted `update` and `get`, both of
  which are IDOR vectors (a tenant can mutate/read another tenant's datasource by ID).
* `create_datasource`: set `datasource.project_id = ctx.tenant's project id` when `ctx` is
  present and not master. Resolve the project from the tenant (mirror how `secrets_builder`
  maps tenant→project). When `ctx is None` (self-host) leave `project_id` null.
* `list/get/update/delete`: when `ctx` is present and `not ctx.is_master`, filter/guard by
  `Datasource.project_id == <ctx project id>`; return 404 (not 403) on mismatch to avoid
  existence disclosure. Master and self-host (`ctx is None`) see all.
* **Fix the Supabase cross-write side-effect** (`crud.py:64-81`): it unconditionally writes
  Supabase credentials into project `"default"` settings. Under scoping this leaks Tenant A's
  keys into the default project. Scope this write to the creating tenant's project (or gate it
  off when a tenant context is present).
* Confirm the sync router is mounted so the session cookie / SuperTokens JWT reaches these
  handlers (the same dual-path `get_tenant_context` relies on).

### [BACKFILL] one-time, on startup (Option A)
* After `init_db`, run an idempotent backfill: `UPDATE datasources SET project_id = :default
  WHERE project_id IS NULL`, where `:default` is the `Project` with `tenant_id IS NULL`. Guard
  so it only runs in cloud mode. This is **not** covered by `_add_missing_columns`.

### Phase 1 verification
1. Tenant A creates datasource "Production". Tenant B creates "Production" → succeeds
   (per-project uniqueness), and neither appears in the other's `list`.
2. Tenant B calls `GET/PUT/DELETE /datasources/{A_id}/` → 404.
3. Self-host mode (`ctx is None`) → all datasources visible, no regression.

---

## Phase 2 — Per-Engine Multi-Bindings (revise before coding)

### [MODIFY] `fastapi-backend/app/models/edge.py`
* Add association tables as **plain `Table` objects** (or simple mapped classes) in the main
  Base, **without `relationship()` into the sync registry**:
  * `engine_datasources(engine_id FK→edge_engines.id, datasource_id String)` — `datasource_id`
    is a **plain String, no DB-level FK** (target table `datasources` is in the other
    registry; Alembic autogenerate cannot see it and would drop/fail the FK). Mirror the
    column-level caution already taken for `project_id`.
  * `engine_storages(engine_id FK→edge_engines.id, storage_id FK→storage_providers.id)` —
    `storage_providers` **is** in the main Base, so a real FK is fine here.
* Add `edge_auth_id` (nullable String FK→… as appropriate) to `EdgeEngine` for the 1:1 auth
  binding.
* Do **not** add `datasources`/`storages` ORM relationships that resolve `"Datasource"` by
  string. Expose bindings via explicit query helpers instead (see below).

### [MODIFY] `fastapi-backend/app/services/secrets_builder.py`
* Rewrite `_build_datasources_config(db, engine_id)`:
  * **Delete the `unified.db` / raw-`sqlite3` path entirely** (it reads a non-existent DB).
    Query through the ORM `db` session — the same session already used by `_build_auth_config`
    for `db.query(Datasource)`.
  * Select datasource IDs from `engine_datasources` for `engine_id`, then load those
    `Datasource` rows and build the existing per-type credential entries. Result: an engine's
    `FRONTBASE_DATASOURCES` contains only its bound (and therefore tenant-owned) credentials.
  * `build_engine_secrets` already threads `engine_id` (signature param) — just pass it at the
    call site (`secrets_builder.py:693`).
* **`FRONTBASE_STORAGE` is net-new, not an edit.** There is no existing storage-compile logic
  to "update." Add a `_build_storage_config(db, engine_id)` that reads `engine_storages` →
  `StorageProvider` (+ its `EdgeProviderAccount` credentials) and emits the JSON shape the edge
  runtime already expects (verify the exact shape against `services/edge/src` consumers before
  implementing). Add `FRONTBASE_STORAGE` to `FRONTBASE_BINDING_NAMES` and to
  `build_engine_secrets`.

### [MODIFY] `fastapi-backend/app/schemas/edge_engines.py` + `routers/edge_engines.py`
* Add `datasource_ids: Optional[List[str]] = None` and `storage_ids: Optional[List[str]] = None`
  to `EdgeEngineCreate`, `EdgeEngineUpdate`, and `ReconfigureRequest` (the schemas live in
  `schemas/edge_engines.py`, not the router — the draft pointed at the wrong file).
* In the create/update/reconfigure controllers, **validate the supplied IDs belong to the
  engine's tenant project** before syncing the join rows (otherwise binding becomes a new
  cross-tenant escalation path). Then diff-sync `engine_datasources` / `engine_storages`.
* Extend `EdgeEngineResponse` with `datasources` / `storages` summaries built from the join
  tables so the frontend can render bindings.

### [MODIFY] `src/components/dashboard/settings/shared/EdgeEnginesSection.tsx`
* Remove the project-wide `useQuery(['datasources-list'], datasourcesApi.list)`
  (`EdgeEnginesSection.tsx:64-67`) as the source of binding display.
* Render bound sources from `engine.datasources` (the new response field) instead of the global
  list (`EdgeEnginesSection.tsx:405-407`). Add storage binding display analogously.

---

## Migrations

* **Phase 1** `datasources.project_id` add + composite unique: the sync service self-heals
  *column adds* via `_add_missing_columns`, but the **`UniqueConstraint` change and the
  backfill are not auto-handled** — provide an explicit migration/startup step for both.
* **Phase 2** `engine_datasources`, `engine_storages`, `edge_engines.edge_auth_id` are main-Base
  → **Alembic**. Hand-write the `engine_datasources.datasource_id` column **without a DB-level
  FK** (cross-registry target invisible to autogenerate).

---

## Verification Plan

* Automated: `pytest fastapi-backend/tests/` — confirm the suite exists and add cases for
  (a) cross-tenant 404s on datasource get/update/delete, (b) `_build_datasources_config`
  returning only bound IDs for a given `engine_id`, (c) binding-ID tenant-ownership validation.
* Manual:
  1. Tenant A creates a datasource; Tenant B cannot see it (settings dashboard) or reach it by
     ID.
  2. Deploy an engine under Tenant A, bind that datasource, inspect provisioned env via the
     engine inspector → `FRONTBASE_DATASOURCES` contains **only** Tenant A's bound credentials
     (and is non-empty — proving the `unified.db` regression is fixed).
  3. Bind a storage provider, redeploy, confirm `FRONTBASE_STORAGE` is now emitted.
