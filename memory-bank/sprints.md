# Execution Sprints: Universal Edge Implementation

Based on the Universal Edge Implementation Plan, here are the phased sprints organized by dependency order.

**Last Updated:** 2026-01-18 01:22 AM

---

## Pre-Sprint Review Protocol

> [!IMPORTANT]
> **Before starting ANY sprint**, complete this mandatory review step.

### Review Checklist

- [ ] **Codebase Context**: Read relevant source files to understand current implementation
- [ ] **Design Patterns**: Identify existing patterns to maintain consistency
- [ ] **Affected Files**: List all files that will be created/modified/deleted
- [ ] **Dependency Check**: Verify prerequisite sprints are complete
- [ ] **Refinement**: Update sprint tasks based on findings (add/remove/clarify)
- [ ] **Risk Assessment**: Re-evaluate risk level with current knowledge
- [ ] **Testing Criteria**: Identify specific tests to validate changes

---

## ✅ Sprint 0: Foundation (COMPLETE)

**Goal:** Establish the core middleware stack without changing functionality.
**Risk:** Low
**Estimated Effort:** 1-2 days

### Sprint 0 Pre-Sprint Review

- [x] Review `services/actions/src/index.ts` current middleware setup
- [x] Review `services/actions/package.json` for existing Hono packages
- [x] List affected files and confirm no breaking changes
- [x] Refine tasks based on findings

### Sprint 0 Tasks

- [x] Add global middleware to `services/actions/src/index.ts`:
  - `requestId()`, `logger()`, `secureHeaders()`, `compress()`, `timeout()`, `bodyLimit()`
- [x] Add CORS to API routes
- [x] Implement `factory` pattern (`createFactory`) for handler structure
- [x] Use `combine` to group middleware chains for organization
- [x] Verify local dev still works (`npm run dev`)

### Sprint 0 Acceptance Criteria

- [x] All existing endpoints still function
- [x] `X-Request-ID` header appears in responses
- [x] Response compression is active

---

## ✅ Sprint 1: Universal Database Layer (COMPLETE)

**Goal:** Replace Node.js-specific DB drivers with HTTP-based drivers.
**Risk:** Medium (Core change)
**Estimated Effort:** 2-3 days

### Sprint 1 Pre-Sprint Review

- [x] Review `services/actions/src/db/index.ts` current implementation
- [x] Review `services/actions/src/db/schema.ts` for Drizzle compatibility
- [x] Identify all files importing from `db/`
- [x] Check Neon/Turso/PlanetScale driver documentation for Drizzle integration
- [x] Refine tasks based on findings

### Sprint 1 Tasks

- [x] Install universal drivers
- [x] Refactor `services/actions/src/db/index.ts`:
  - Remove `fs`, `path`, `postgres` imports
  - Implement Neon HTTP driver for Postgres
- [x] Update environment variable documentation

### Sprint 1 Acceptance Criteria

- [x] Works locally with `DATABASE_URL` pointing to Neon or Turso
- [x] No `fs` or `path` imports remain in `src/`
- [x] Existing API tests pass

---

## ✅ Sprint 2: Authentication & Security (COMPLETE)

**Goal:** Secure the Edge Engine with JWT verification and API key support.
**Risk:** Medium
**Estimated Effort:** 2-3 days

### Sprint 2 Pre-Sprint Review

- [x] Review FastAPI auth flow to understand token format
- [x] Review Supabase JWT structure and claims
- [x] Identify which routes need protection (`/execute`, `/executions`, `/webhook`)
- [x] Check existing CORS setup from Sprint 0
- [x] Refine tasks based on findings

### Sprint 2 Tasks

- [x] Add `bearer-auth` middleware for API key access (`/webhook`)
- [x] Document auth flow in README

### Sprint 2 Acceptance Criteria

- [x] API key allows webhook triggers
- [x] Unauthenticated webhook requests return 401

---

## ✅ Sprint 2 Extended: Full Auth Shell (COMPLETE)

**Goal:** Cross-layer authentication for React, FastAPI, and Hono.
**Risk:** Medium
**Estimated Effort:** 1 day

### Sprint 2+ Tasks

- [x] **React**: LoginPage, ProtectedRoute, auth store with real API calls
- [x] **FastAPI**: Auth router (login, logout, me endpoints)
- [x] **Hono**: Webhook auth middleware
- [x] SaaS landing page branding
- [x] Fixed 307 redirect issues (removed trailing slashes)
- [x] Fixed proxy headers for HTTPS redirects in production

### Files Modified

- `src/stores/auth.ts` - Real auth with API calls
- `src/components/auth/ProtectedRoute.tsx` - Route guard
- `src/pages/auth/LoginPage.tsx` - Admin login page
- `fastapi-backend/app/routers/auth.py` - Auth endpoints
- `fastapi-backend/docker_entrypoint.sh` - Proxy headers
- `docker-compose.yml` - VITE_API_URL build arg

---

## ✅ Sprint 3: SSR Pages Engine (COMPLETE)

**Goal:** Render published pages on the Edge.
**Risk:** Medium-High (New feature)
**Estimated Effort:** 1.5-2 days

> See `sprint3_ssr_plan.md` for detailed implementation plan.

### Sprint 3 Pre-Sprint Review

- [x] Review FastAPI page schema storage
- [x] Review existing React component library for SSR compatibility
- [x] Identify page schema structure (JSON format)
- [x] Define variable scopes (Page, Session, Cookies)
- [x] Plan approved

### Key Decisions

- **Variable Scopes**: Page Variables, Session Variables, Cookies
- **Edge Architecture**: No FastAPI on edge, uses D1/KV
- **Component Tiers**: Static, Interactive, Data-Driven
- **Hydration**: React hydrates interactive components

### Sprint 3 Tasks

- [x] Create SSR route `/:slug` in Hono
- [x] Create variable store (3 scopes)
- [x] Create static component renderers
- [x] Create interactive component renderers
- [x] Create data component renderers with hydration
- [x] Create client hydration bundle
- [x] Add FastAPI public page endpoint
- [x] Add FastAPI publish endpoint (New Requirement)

### Sprint 3 Acceptance Criteria

- [x] `GET /my-page` returns full HTML
- [x] Cached responses return Cache-Control headers
- [x] Variables persist per scope (18/18 tests passed)
- [x] Interactive components hydrate correctly

---

## ✅ Sprint 3.5: Stability & Enhancements (COMPLETE)

**Goal:** Stabilize core components and fix critical infrastructure.
**Risk:** Medium
**Estimated Effort:** 2-3 days

### Sprint 3.5 Tasks

- [x] **DataTable Refactor**: Modularized into `datatable/` directory (`SearchableSelect`, `Pagination`)
- [x] **Routing Fix**: Corrected Nginx routing for `/api/database/*`
- [x] **Advanced Search**: Simultaneous server-side search & filtering
- [x] **Cascading Filters**: Implemented dependent dropdowns

---
## ✅ Sprint 4: Storage & Cache (COMPLETE)

**Goal:** Integrate Supabase Storage for file handling and Upstash Redis for caching/queues.
**Risk:** Low
**Estimated Effort:** 2-3 days

> See `sprint4_storage_cache_plan.md` for detailed implementation plan.

### Sprint 4 Tasks

- [x] **Supabase Storage Integration**
  - [x] Create `services/edge/src/storage/supabase.ts`
  - [x] Implement upload/download via Supabase JS client
  - [x] Add presigned URL generation for direct uploads
  - [x] Create `/api/storage/*` endpoints in Hono
  - [x] FileBrowser UI with breadcrumb navigation
- [x] **Unified Redis Architecture** (HTTP-First)
  - [x] Install `@upstash/redis`
  - [x] Create `services/edge/src/cache/redis.ts` (dual adapter: Upstash HTTP + SRH)
  - [x] Add `serverless-redis-http` to docker-compose for local dev
  - [x] Settings UI with two-path selector (Upstash vs Self-Hosted)
  - [x] Startup sync: Edge fetches Redis config from FastAPI
  - [x] SSR data caching via `cached()` wrapper in `data.ts`
  - [x] Alembic migrations to pre-seed Docker Redis defaults
- [x] **Documentation**
  - [x] `services/edge/src/cache/README.md` — full architecture guide
  - [x] Knowledge item: `unified_frontbase_architecture`

### Sprint 4 Acceptance Criteria

- [x] Can upload files to Supabase Storage via API
- [x] Can generate presigned URLs for direct uploads
- [x] Redis caching reduces repeated API calls (Edge SSR)
- [x] Works in both local Docker (`localhost:8079`) and VPS (`redis-http:80`)
- [x] Settings UI allows switching between Upstash and Self-Hosted

---

## ✅ Sprint 5: UI Components & Modular Refactoring (COMPLETE)

**Goal:** Add essential UI components and refactor builder for modularity.
**Risk:** Medium
**Estimated Effort:** Completed (Phase 8 of Project)

### Sprint 5 Achievements

- **Modular Architecture**: Decoupled monolithic files into `renderers/`, `templates/`, `properties/`.
- **New Components**:
  - **Charts**: `ChartRenderer`, `ChartProperties` (replaces planned client-side chart).
  - **Landing Sections**: Hero, Features, Pricing, LogoCloud, Navbar, Footer.
  - **Data Components**: `Grid`, `KPICard`, `DataTable`.
- **Styling**: Implemented Visual Styling Panel (metadata-driven CSS).
- **Polish**: Mobile responsiveness, container styles, icon support.
- **Reference**: See `progress.md` Phase 8 for full details.

---

## Sprint 6: Automation Engine + Deploy (MVP Final)

**Goal:** Enhance the Dafthunk automation engine and enable one-click deployment to edge platforms.
**Risk:** Medium
**Estimated Effort:** 3-4 days

> See `archive/sprint6_automation_deploy_plan.md` for detailed implementation plan.

### Sprint 6 Tasks

#### 1. Automation Engine (Partially Complete)
- [x] **New Node Types**: `HTTP Request`, `Transform`, `Condition`, `Logic`, `Data Request` implemented in `runtime.ts` and `nodeSchemas.ts`.
- [ ] **Scheduling**: `schedule_trigger` schema exists, but the cron runner/scheduler implementation is pending.
- [ ] **History & Versioning**: Version incrementing is implemented in `deploy.ts`, but history retrieval and rollback features are missing.
- [x] **Testing/Debugging**: Backend API support (`singleNodeRoute`) is implemented for testing individual nodes.

#### 2. Edge Deployment (Pending)
- [ ] **Configuration**: `wrangler.toml` for Cloudflare Workers.
- [ ] **Scripts**: One-click deploy scripts.
- [ ] **Targets**: Cloudflare Workers, Vercel Edge, Supabase Edge.
- [ ] **UI Integration**: Deployment status in Builder.

#### 3. Environment Config (Pending)
- [ ] Secrets management for edge deployments.
- [ ] Environment variable injection.

### Sprint 6 Acceptance Criteria (Updated)

- [x] New automation nodes work in workflow editor (Schema & Runtime support verified)
- [ ] Workflows can be scheduled with cron triggers
- [ ] One-click deploy to Cloudflare Workers works
- [ ] Deployment status visible in Builder UI
- [ ] Secrets are securely managed

---

---

## Sprint Summary

| Sprint | Name                    | Effort  | Status       |
|--------|-------------------------|---------|--------------|
| 0      | Foundation              | 1-2d    | ✅ Complete  |
| 1      | Universal DB            | 2-3d    | ✅ Complete  |
| 2      | Auth & Security         | 2-3d    | ✅ Complete  |
| 2+     | Full Auth Shell         | 1d      | ✅ Complete  |
| 3      | SSR Pages               | 1.5-2d  | ✅ Complete  |
| 3.5    | Stability               | 2-3d    | ✅ Complete  |
| 4      | Storage & Cache         | 2-3d    | ✅ Complete  |
| 5      | UI Components + Refactor| 2-3d    | ✅ Complete  |
| 6      | Automation + Deploy     | 3-4d    | Pending      |

**Completed:** Sprints 0, 1, 2, 2+, 3, 3.5, 4, 5
**Next:** Sprint 6 (Automation + Deploy)
**Remaining MVP:** ~3-4 days

---

## MVP Services Stack

| Service       | Provider         | Purpose                    |
|---------------|------------------|----------------------------|
| Database      | Supabase         | Primary data store         |
| Storage       | Supabase Storage | File uploads               |
| Cache/Queues  | Upstash Redis    | Caching, background jobs   |
| Realtime      | Supabase Realtime| Live updates (if needed)   |
| Edge Runtime  | Cloudflare Workers / Vercel Edge | SSR + Automation |
