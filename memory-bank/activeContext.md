# Active Context

This file tracks the project's current status, including recent changes, current goals, and open questions.

> Last Updated: 2026-02-25

## Current Focus

**🌐 MULTI-DATABASE EDGE DEPLOYMENT (Phase 5.5)**

- **COMPLETED**: `EdgeDatabase` model — named edge DB connections (Turso, Neon, SQLite)
- **COMPLETED**: Alembic migration 0018 (table, FK to `deployment_targets`, pre-seed local defaults)
- **COMPLETED**: CRUD router `/api/edge-databases/` (list/create/update/delete/test-connection)
- **COMPLETED**: Cloudflare deploy accepts `edge_db_id`, fetches creds from EdgeDatabase table
- **COMPLETED**: `TursoPublishStrategy` reads from EdgeDatabase instead of `settings.json`
- **COMPLETED**: Frontend dropdown replaces raw Turso URL/token inputs in CF deploy form
- **COMPLETED**: `is_system` flag — Local SQLite DB + Local Edge target pre-seeded, undeletable
- **IN PROGRESS**: Frontend Edge Databases management panel (add/edit/delete in Settings)
- **TODO**: Remove old Turso settings endpoints from `settings.py`

**☁️ CLOUDFLARE WORKERS INTEGRATION (Phase 5–6)**

- **COMPLETED**: Lightweight Worker skeleton (`cloudflare-lite.ts`, ~337 KB)
- **COMPLETED**: Hono + `@libsql/client/web` + `@upstash/redis/cloudflare` (no Node.js built-ins)
- **COMPLETED**: One-click deploy from Settings UI (API token → auto-build → upload → secrets → target)
- **COMPLETED**: Publish fan-out wired: `fan_out_to_deployment_targets` includes `adapter_type='edge'`
- **COMPLETED**: Worker `/api/import` handles `ImportPagePayload` format from publish pipeline
- **TODO**: Verify end-to-end: publish page → Worker serves it at `/ssr/{slug}`

**🎨 CSS SYSTEM MODERNIZATION**

- **COMPLETED**: Refactored CSS registry, extracted utilities
- **COMPLETED**: Tailwind v4 `@source inline()` for responsive variants

## Current Environment

| Component | Port | Status |
|-----------|------|--------|
| FastAPI Backend | 8000 | ✅ Primary — PostgreSQL (Prod) / SQLite (Dev) |
| Vite Frontend | 5173 | ✅ Active — dev server with HMR |
| Edge Engine (Docker) | 3002 | ✅ Active — Hono SSR + Workflows |
| Cloudflare Worker | — | ✅ Deployable — lightweight skeleton |

## Recent Changes (Feb 2026)

- **2026-02-25**: Multi-database edge deployment — `EdgeDatabase` model, CRUD router, CF deploy with `edge_db_id`, self-hosted pre-seeding
- **2026-02-24**: Publish fan-out wired to CF Worker — scope filter, `/api/import` endpoint, `ImportPagePayload` format
- **2026-02-23**: Cloudflare Worker one-click deploy — lightweight bundle, Settings UI, deployment targets
- **2026-02-22**: CSS refactoring — dead code removal, modular registry, Tailwind v4 `@source inline()`
- **2026-02-21**: Edge architecture finalized — 4 deployment modes, adapter pattern, `AGENTS.md` updated
- **2026-02-20**: Tailwind responsive variants fix — `@source inline()` extracts classes from rendered HTML
- **2026-02-15**: SaaS architecture — connector taxonomy, license key model, Redis strategy

## Key Design Decisions (Recent)

| Decision | Rationale |
|----------|-----------|
| `EdgeDatabase` replaces global Turso `settings.json` | Multiple named DBs per project, FK from `deployment_targets` |
| `is_system` flag on EdgeDatabase + DeploymentTarget | Self-hosted local edge is pre-configured and undeletable |
| Lightweight CF Worker (no React/LiquidJS) | Avoids Node.js built-ins, stays under 1MB bundle |
| Edge DB credentials in table, not env vars | UI-managed, per-target selection, migration-safe |

## Open Questions

- Edge Databases management UI design: cards vs table layout in Settings?
- When to clean up old Turso settings endpoints from `settings.py`?
- Phase 6 verification: pre-render HTML at publish time for Worker serving
