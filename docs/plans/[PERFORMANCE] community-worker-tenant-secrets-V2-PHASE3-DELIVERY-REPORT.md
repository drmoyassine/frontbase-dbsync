# Delivery Report — V2 Phase 3: Scheduled Rotation, Bulk Operations & Admin UI

**Plan:** `[PERFORMANCE] community-worker-tenant-secrets-V2-key-rotation.md` (Phase 3)
**Parent:** `[PERFORMANCE] community-worker-tenant-secrets-V2-DELIVERY-REPORT.md` (V2)
**Status:** ✅ Phase 3 implemented and verified (backend `py_compile` clean · **34 rotation tests pass** (22 V2 + 12 new) · 70 edge-suite tests pass · frontend **tsc 0 errors**)
**Date:** 2026-06-24

---

## 1. Summary

V2 delivered per-engine, **manual**, zero-downtime key rotation with an HKDF
option. Phase 3 closes the operational gaps around it so shared/community
engines are self-maintaining and observable:

1. **Scheduled rotation.** A Celery beat task (`rotate-shared-engine-secrets`)
   runs daily at 02:00 UTC and rotates any shared engine whose secrets key is
   older than **90 days**, using the HKDF strategy with a 1-hour transition
   window. No operator action required.

2. **Bulk rotation API.** `POST /api/edge-engines/batch/rotate-secrets-key`
   rotates up to 50 shared engines in one request, concurrency-limited to 3 via
   `asyncio.Semaphore` (same pattern as the existing batch redeploy/delete), and
   returns a `BatchResult { success, failed, total }`.

3. **Rollback.** `POST /api/edge-engines/{engine_id}/rollback-rotation` reverts an
   in-flight rotation while its transition window is still open — restoring the
   previous key **and** the pre-rotation resolver mode (HKDF vs random) — then
   redeploys. The rotation is recorded in history as `rolled_back`.

4. **History.** `GET /api/edge-engines/{engine_id}/rotation-history` returns the
   in-flight transition (synthesized, with a live tenant count) plus the last 10
   resolved rotations, stored in `engine_config['rotation_history']`.

5. **Admin UI.** A `RotationDialog` (key-icon trigger on shared engine rows)
   composes a `RotationStatusCard` (initiate / live countdown / roll back) and a
   `RotationHistoryTable`. On-demand so the engine list fires no per-row status
   queries.

**Value engineering** (no new infra, no new tables, no new env vars):
- Reuses the existing Celery beat scheduler — no new scheduler/queue service.
- Stores rotation history in `engine_config` metadata — no schema migration.
- Mirrors the existing `asyncio.Semaphore(3)` + `BatchResult` batch pattern.
- Two reusable React components behind one on-demand dialog.

---

## 2. Components Delivered

### 2.1 Backend service — `app/services/edge_secrets_push.py`

| Function | Purpose |
|---|---|
| `rollback_rotation(engine, db, rotation_id)` *(async)* | Restore previous key + resolver mode during the transition window; record `rolled_back` history; redeploy. Raises `ValueError` on any precondition failure. |
| `list_rotation_history(engine, db)` | In-flight transition (synthesized, live tenant count) + last 10 resolved rotations, newest-first. |
| `get_engines_requiring_rotation(db, max_age_days=90)` | Shared+active engines whose last rotation predates the cutoff (age from rotation start → newest history entry → `created_at`). |
| `run_scheduled_rotation(max_age_days=90)` *(async)* | Orchestrator the Celery task calls: open a session, sweep eligible engines, rotate each (HKDF preferred, random fallback), return `{checked, rotated, failed, errors}`. |

**Modified V2 functions (backward-compatible additions):**
- `rotate_secrets_key` now captures `old_use_hkdf` + `tenants_affected` into the
  rotation metadata (so rollback/prune can record history **without a DB query**),
  and records a `completed` history entry on an immediate cut-over (`window_seconds=0`).
- `prune_expired_rotation` records a `completed` history entry before dropping the
  transition metadata (reads stored `tenants_affected`, no extra query).

**New private helpers:** `_parse_iso(value)` (defensive ISO-8601 parse —
`engine.created_at` is stored as an ISO **string**), `_record_rotation_history(cfg, entry)`
(capped at `_ROTATION_HISTORY_LIMIT = 10`).

### 2.2 Backend API — `app/routers/edge_engines.py`

| Method · Path | Behavior |
|---|---|
| `POST /batch/rotate-secrets-key` | Batch rotate (Semaphore(3), tenant-scoped load, non-shared → failed). *Registered before the `{engine_id}` routes so the literal `/batch/...` path isn't shadowed by `/{engine_id}/rotate-secrets-key`.* |
| `POST /{engine_id}/rollback-rotation` | Roll back (shared-only, `ValueError` → 400). Returns restored version + serialized engine. |
| `GET /{engine_id}/rotation-history` | `{ history: [...] }`. |

**Schemas** (`app/schemas/edge_engines.py`): `BatchRotateSecretsRequest`,
`RollbackRotationRequest`, `RotationHistoryEntry`.

### 2.3 Scheduled task — `app/services/task_queue.py`

```python
"rotate-shared-engine-secrets": {
    "task": "app.services.edge_secrets_push.check_and_rotate_shared_engine_secrets",
    "schedule": crontab(minute=0, hour=2),   # 02:00 UTC daily
}
```
Thin sync wrapper `check_and_rotate_shared_engine_secrets_task()` runs the async
`run_scheduled_rotation` via `asyncio.run` — same pattern as the existing
`prune_executions` beat task. No new env vars; uses `REDIS_URL`.

### 2.4 Frontend — `src/hooks/useEdgeInfrastructure.ts`

API methods: `rotateSecretsKey`, `batchRotateSecretsKey`, `rollbackRotation`,
`getRotationHistory`, `getRotationStatus`. Types: `RotationParams`,
`RotationStatus`, `RotationHistoryEntry`.

Hooks (TanStack Query v5, AGENTS.md-compliant):
- `useRotationStatus` — polls every 30 s **only while a transition is active**
  (`refetchInterval` keyed off `query.state.data?.active`).
- `useRotationHistory` — 5-min `staleTime`.
- `useRotateSecretsKey`, `useRollbackRotation` — mutations that invalidate
  status/history/`edge-engines` on success (object-form `invalidateQueries`).

### 2.5 Frontend components — `src/components/dashboard/settings/shared/`

| Component | Role |
|---|---|
| `RotationStatusCard.tsx` | Inactive: version + key type + **Rotate key**. Active: old→new, live window countdown bar + **Roll back**. Toast feedback via `sonner`. |
| `RotationHistoryTable.tsx` | Started (relative) · strategy · versions · tenants · status badge. |
| `RotationDialog.tsx` | Key-icon trigger (shared rows only) composing the two above — on-demand, so no N status queries on list load. |

Wired into `EdgeEnginesSection.tsx`: `{isCommunityShared && <RotationDialog engine={engine} />}`
inside the `canManage` action cluster (so read-only tenants on cloud can't see it — only the
engine owner / master).

---

## 3. Rotation Lifecycle (end to end)

```
                         ┌─────────────────────────────┐
   Celery beat 02:00 UTC │ run_scheduled_rotation      │   OR  manual / batch API
   (90-day sweep)        │ get_engines_requiring_rotation     rotate_secrets_key
                         └──────────────┬──────────────┘
                                        ▼
              rotate_secrets_key (hkdf/random, window=3600s)
                · new key active, old kept as secrets_key_old
                · cfg['rotation'] = { id, started_at, old_use_hkdf,
                                      tenants_affected, … status: transitioning }
                · redeploy → KEY + KEY_OLD env, re-push ciphertext
                                        ▼
   ┌──────────────── transition window open ─────────────────┐
   │  GET /rotation-status   → active, remaining_seconds      │
   │  GET /rotation-history  → [transitioning, …past]          │
   │                                                           │
   │  POST /rollback-rotation → restore old key + mode,        │
   │                             history += rolled_back, redeploy │
   └───────────────────────────────────────────────────────────┘
                                        ▼
        prune_expired_rotation (lazy, top of next redeploy)
          · history += completed
          · drop secrets_key_old + rotation metadata
```

**Rollback correctness across strategies:** the pre-rotation resolver mode
(`old_use_hkdf`) is captured at rotation time. On rollback:
- `old_use_hkdf=False` → restore the random blob from `secrets_key_old`.
- `old_use_hkdf=True` → flip `use_hkdf` back (the old key is HKDF-derived from
  `system_key`, deterministic — no blob to restore).

---

## 4. Value-Engineering Decisions

| Decision | Rationale |
|---|---|
| Celery beat, not an edge tick handler | Rotation is a control-plane/DB operation; Celery already runs the retention prune. One scheduler, one mental model. |
| History in `engine_config`, not a new table | Avoids a migration; rotations are rare (≤1/engine/quarter); 10-entry cap keeps the JSON small. |
| Capture `tenants_affected`/`old_use_hkdf` at rotation time | Rollback & prune record history **without DB queries** — keeps the existing mock-db `prune` tests green and avoids session contention in the batch path. |
| On-demand `RotationDialog` | A per-row status query on list load would fan out N requests; the dialog mounts the queries only when opened. |
| Literal `/batch/...` route registered before `/{engine_id}/...` | Prevents Starlette from matching `/batch/rotate-secrets-key` against `/{engine_id}/rotate-secrets-key` (engine_id="batch"). Verified via route ordering. |

---

## 5. Files Changed

**Backend**
- `app/schemas/edge_engines.py` — +3 schemas.
- `app/services/edge_secrets_push.py` — +4 functions, +2 helpers, modified `rotate_secrets_key` & `prune_expired_rotation`.
- `app/routers/edge_engines.py` — +3 endpoints, schema import.
- `app/services/task_queue.py` — +1 beat entry, +1 task wrapper.
- `tests/test_edge_secrets_rotation.py` — +12 tests (rollback, history, scheduling); `decrypt_field` import.

**Frontend**
- `src/hooks/useEdgeInfrastructure.ts` — +5 API methods, +3 types, +4 hooks.
- `src/components/dashboard/settings/shared/RotationStatusCard.tsx` *(new)*
- `src/components/dashboard/settings/shared/RotationHistoryTable.tsx` *(new)*
- `src/components/dashboard/settings/shared/RotationDialog.tsx` *(new)*
- `src/components/dashboard/settings/shared/EdgeEnginesSection.tsx` — import + 1 trigger.

---

## 6. Verification

| Check | Result |
|---|---|
| `python -m py_compile` (4 backend files) | ✅ clean |
| Router + task_queue import | ✅ clean; beat tasks = `[prune-execution-history, rotate-shared-engine-secrets]` |
| Route ordering | ✅ `/batch/rotate-secrets-key` precedes `/{engine_id}/rotate-secrets-key` |
| `pytest tests/test_edge_secrets_rotation.py -v` | ✅ **34 passed** (22 V2 + 12 Phase 3) |
| `pytest test_edge_engines + test_edge_infra + test_engine_deploy + rotation` | ✅ **70 passed** |
| Frontend `tsc --noEmit` (whole project) | ✅ **0 errors** |

**New backend tests:** rollback restores old key + mode; rollback restores HKDF
mode; rollback fails after window / wrong ID / no rotation / non-shared; immediate
cut-over records `completed` history; prune records `completed` history; history
merges active + past newest-first; history capped at 10; age-based eligibility
filter; `run_scheduled_rotation` rotates an old engine end-to-end.

---

## 7. Rollout & Operations

1. **Backend first** — schemas, service, endpoints, Celery entry ship together
   (single deploy). The beat task is inert until celery-beat is running.
2. **Frontend** — the dialog only appears for shared engines the caller owns/manages.
3. **Confirm the scheduler** — `celery -A app.services.task_queue beat -l info` must
   be running in production; at 02:00 UTC watch logs for
   `rotate-shared-engine-secrets` and the `[SecretsRotation] Rotated engine …` lines.
4. **Dry-run first** — operators can `POST /rotate-secrets-key { dry_run: true }` to
   preview affected tenants/versions before a real (or batch) rotation.
5. **Monitor** — beat task returns `{checked, rotated, failed, errors}`; watch
   `failed`/`errors`. A failed rotation leaves the **old key active** (atomic w.r.t.
   the control plane), so a task failure is safe-by-construction.

**No new env vars.** No DB migration. No edge-worker change required (the dual-key
fallback and `KEY_OLD` plumbing shipped in V2).

---

## 8. Limitations & Follow-ups

- **Lazy prune.** A rotation whose window elapsed is only moved to `completed`
  history on the next redeploy (existing V2 behavior). In practice shared engines
  redeploy on the scheduled rotation itself and on config changes, so this is a
  short tail. A future hardener could prune from the beat task directly.
- **History is per-engine metadata**, not queryable cross-engine. Sufficient for
  the admin UI; a dedicated audit table would be needed for fleet-wide reporting.
- **Batch path shares one DB session** across the concurrent rotations (matches the
  existing batch redeploy pattern; safe under single-threaded asyncio since DB calls
  are synchronous and non-preemptible).
