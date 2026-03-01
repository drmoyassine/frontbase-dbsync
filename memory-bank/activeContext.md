# Active Context

This file tracks the project's current status, including recent changes, current goals, and open questions.

> Last Updated: 2026-03-02

## Current Focus

**🔐 EDGE AUTH & PRIVATE PAGES (Priority 1)**
- **TODO**: Implement Supabase Auth forms (login/signup) on the builder.
- **TODO**: Issue HTTP-only cookies on login, passing them to the Edge Engine for verification.
- **TODO**: Implement private page gating and redirect logic on the Edge.

**🐛 DESIGN-TIME BUGS (Priority 2)**
- **TODO**: Fix the `SSR page width issue` where published pages do not span the full viewport width on widescreen devices due to flex/width constraints on `.fb-page`.

**🌐 MULTI-DATABASE EDGE DEPLOYMENT (Completed)**
- **COMPLETED**: `EdgeDatabase` model — named edge DB connections (Turso, Neon, SQLite)
- **COMPLETED**: Cloudflare deploy accepts `edge_db_id`, fetches creds from EdgeDatabase table
- **COMPLETED**: `TursoPublishStrategy` reads from EdgeDatabase instead of `settings.json`

**☁️ CLOUDFLARE WORKERS INTEGRATION (Completed)**
- **COMPLETED**: Lightweight Worker skeleton (`cloudflare-lite.ts`, ~337 KB)
- **COMPLETED**: One-click deploy from Settings UI (API token → auto-build → upload → secrets → target)
- **COMPLETED**: Verified end-to-end publish flow to Workers and Lite Engine execution.

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
