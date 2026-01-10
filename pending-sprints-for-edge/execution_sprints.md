# Execution Sprints: Universal Edge Implementation

Based on the Universal Edge Implementation Plan, here are the phased sprints organized by dependency order.

**Last Updated:** 2026-01-10 03:08 AM

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

### Pre-Sprint Review
- [x] Review `services/actions/src/index.ts` current middleware setup
- [x] Review `services/actions/package.json` for existing Hono packages
- [x] List affected files and confirm no breaking changes
- [x] Refine tasks based on findings

### Tasks
- [x] Add global middleware to `services/actions/src/index.ts`:
    - `requestId()`, `logger()`, `secureHeaders()`, `compress()`, `timeout()`, `bodyLimit()`
- [x] Add CORS to API routes
- [x] Implement `factory` pattern (`createFactory`) for handler structure
- [x] Use `combine` to group middleware chains for organization
- [x] Verify local dev still works (`npm run dev`)

### Acceptance Criteria
- [x] All existing endpoints still function
- [x] `X-Request-ID` header appears in responses
- [x] Response compression is active

---

## ✅ Sprint 1: Universal Database Layer (COMPLETE)
**Goal:** Replace Node.js-specific DB drivers with HTTP-based drivers.
**Risk:** Medium (Core change)
**Estimated Effort:** 2-3 days

### Pre-Sprint Review
- [x] Review `services/actions/src/db/index.ts` current implementation
- [x] Review `services/actions/src/db/schema.ts` for Drizzle compatibility
- [x] Identify all files importing from `db/`
- [x] Check Neon/Turso/PlanetScale driver documentation for Drizzle integration
- [x] Refine tasks based on findings

### Tasks
- [x] Install universal drivers
- [x] Refactor `services/actions/src/db/index.ts`:
    - Remove `fs`, `path`, `postgres` imports
    - Implement Neon HTTP driver for Postgres
- [x] Update environment variable documentation

### Acceptance Criteria
- [x] Works locally with `DATABASE_URL` pointing to Neon or Turso
- [x] No `fs` or `path` imports remain in `src/`
- [x] Existing API tests pass

---

## ✅ Sprint 2: Authentication & Security (COMPLETE)
**Goal:** Secure the Edge Engine with JWT verification and API key support.
**Risk:** Medium
**Estimated Effort:** 2-3 days

### Pre-Sprint Review
- [x] Review FastAPI auth flow to understand token format
- [x] Review Supabase JWT structure and claims
- [x] Identify which routes need protection (`/execute`, `/executions`, `/webhook`)
- [x] Check existing CORS setup from Sprint 0
- [x] Refine tasks based on findings

### Tasks
- [x] Add `bearer-auth` middleware for API key access (`/webhook`)
- [x] Document auth flow in README

### Acceptance Criteria
- [x] API key allows webhook triggers
- [x] Unauthenticated webhook requests return 401

---

## ✅ Sprint 2 Extended: Full Auth Shell (COMPLETE)
**Goal:** Cross-layer authentication for React, FastAPI, and Hono.
**Risk:** Medium
**Estimated Effort:** 1 day

### Tasks
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

## 🔜 Sprint 3: SSR Pages Engine (NEXT)
**Goal:** Render published pages on the Edge.
**Risk:** Medium-High (New feature)
**Estimated Effort:** 1.5-2 days

> See `sprint3_ssr_plan.md` for detailed implementation plan.

### Pre-Sprint Review
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

### Tasks
- [ ] Create SSR route `/p/:slug` in Hono
- [ ] Create variable store (3 scopes)
- [ ] Create static component renderers
- [ ] Create interactive component renderers
- [ ] Create data component renderers with hydration
- [ ] Create client hydration bundle
- [ ] Add FastAPI public page endpoint

### Acceptance Criteria
- [ ] `GET /p/my-page` returns full HTML
- [ ] Cached responses return Cache-Control headers
- [ ] Variables persist per scope
- [ ] Interactive components hydrate correctly

---

## Sprint 4: Real-Time & WebSockets
**Goal:** Stream workflow execution logs to the Builder UI.
**Risk:** Medium
**Estimated Effort:** 2-3 days

### Tasks
- [ ] Implement `/ws/executions/:id` using `websocket` helper
- [ ] Modify `runtime.ts` to emit events during execution
- [ ] Add WebSocket connection handler in Builder UI (React)
- [ ] Implement `hono/client` for type-safe React-to-Hono communication
- [ ] Test with local and Edge deployments

### Acceptance Criteria
- Builder connects to WebSocket
- Execution status updates in real-time
- Connection closes gracefully on completion

---

## Sprint 5: Storage Integration
**Goal:** Enable file uploads and binary handling.
**Risk:** Low
**Estimated Effort:** 1-2 days

### Tasks
- [ ] Install `s3-lite-client`
- [ ] Create `services/actions/src/storage/index.ts`
- [ ] Add S3 config env vars
- [ ] Add `/upload` endpoint (if needed for Actions)
- [ ] Document S3-compatible provider setup (R2, MinIO)

### Acceptance Criteria
- Can upload/download files via API
- Works with Cloudflare R2 and local MinIO

---

## Sprint 6: Observability
**Goal:** Implement logging, tracing, and error tracking.
**Risk:** Low
**Estimated Effort:** 1-2 days

### Tasks
- [ ] Integrate Axiom for logs
- [ ] (Optional) Add Sentry for errors
- [ ] (Optional) Add OpenTelemetry tracing

### Acceptance Criteria
- Logs appear in Axiom dashboard
- Request IDs are searchable

---

## Sprint 7: Edge Deployment
**Goal:** Deploy to Cloudflare Workers (or other Edge provider).
**Risk:** Low (if previous sprints completed)
**Estimated Effort:** 1-2 days

### Tasks
- [ ] Add `wrangler.toml` for Cloudflare Workers
- [ ] Configure environment variables in Cloudflare dashboard
- [ ] Test deployment with `wrangler deploy`
- [ ] Verify all endpoints work on Edge
- [ ] Document deployment process

### Acceptance Criteria
- Engine runs on `*.workers.dev` subdomain
- All tests pass on Edge
- Latency is acceptable (<100ms p50 globally)

---

## Sprint Summary

| Sprint | Name | Effort | Status |
| :--- | :--- | :--- | :--- |
| 0 | Foundation | 1-2d | ✅ Complete |
| 1 | Universal DB | 2-3d | ✅ Complete |
| 2 | Auth & Security | 2-3d | ✅ Complete |
| 2+ | Full Auth Shell | 1d | ✅ Complete |
| 3 | SSR Pages | 1.5-2d | 🔜 Next |
| 4 | WebSockets | 2-3d | Pending |
| 5 | Storage | 1-2d | Pending |
| 6 | Observability | 1-2d | Pending |
| 7 | Edge Deployment | 1-2d | Pending |

**Completed:** Sprints 0, 1, 2, 2+
**Next:** Sprint 3 (SSR Pages Engine)
**Remaining:** ~8-12 days
