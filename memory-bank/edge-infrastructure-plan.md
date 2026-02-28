# Edge Infrastructure Master Plan

## Previously Completed
- [x] AGENTS.md compliance (staleTime, Release-Before-IO)
- [x] Split EdgeEnginesPanel.tsx (728 -> 25 lines)
- [x] Housekeeping + verification

---

## Phase 1: Multi-Cache & Engine Card UI
- [x] Create EdgeCache model + Alembic migration
- [x] Create `/api/edge-caches` CRUD endpoints
- [x] Create EdgeCachesForm.tsx (replace global Redis form)
- [x] Add DB + Cache name badges to Engine Cards
- [x] Add ReconfigureEngineDialog.tsx

## Phase 2: Provider-Agnostic Bundle Architecture
- [x] Composable Cache adapters (Upstash HTTP, IoRedis TCP, Null -- auto-detected via `FRONTBASE_CACHE_URL` protocol)
- [x] Create `engine/lite.ts` (core + workflows + LiquidJS) -- standalone `liteApp` with root info route
- [x] Create `engine/full.ts` (lite + SSR + React) -- extends `createLiteApp()`, adds page routes
- [x] Adopt Hono middleware: streaming, etag, timing, bodyLimit, secureHeaders, requestId, timeout, cors
- [x] New tsup configs: `tsup.cloudflare.ts` (full), `tsup.cloudflare-lite.ts` (lite)
- [x] Rename env vars: `UPSTASH_REDIS_REST_*` -> `FRONTBASE_CACHE_URL/TOKEN` (provider-agnostic)
- [x] Reconfigure endpoint: CF Settings API PATCH + DELETE legacy secrets
- [x] Root fallback pages: JSON info responses for both lite and full (no-homepage) bundles
- [ ] Composable State DB adapters (Turso, Neon, Supabase, SQLite, Null) -- currently only Turso + LocalSqlite
- [ ] Rewrite provider adapters as thin wrappers (`engine/core.ts` extraction)
- [ ] UI: Engine Type selector in deploy dialog

## Phase 3: Edge Inspector (Mission Control)
- [ ] Backend inspector endpoints (source, secrets, resources, domains)
- [ ] `EdgeInspectorDialog.tsx` (Monaco + 5 tabs)
- [ ] Health & Resource metrics panel
- [ ] Bundle-type awareness (hide tabs for Lite engines)
- [ ] Edge Code Editor (Inspector IDE) -- AI agent + human source editing -> compile -> deploy (see BACKLOG.md)

## Phase 4: Enterprise Secrets Management (Open Question)

### Option A: Infisical Integration
- Integrate Infisical SDK for centralized secrets sync
- Staging/Prod environment separation
- Requires self-hosted Infisical instance (heavy -- Docker, PostgreSQL, Redis, SMTP)

### Option B: Infisical-as-a-Worker (Multi-Tenant Secrets Service)
- Standalone CF Worker (`frontbase-secrets`) as a lightweight, multi-tenant secrets manager
- Each Frontbase instance (self-hosted or cloud) registers as a tenant
- Secrets stored encrypted in Turso/D1, accessed via API key
- No Infisical dependency -- purpose-built for Frontbase's edge-native architecture
- Could serve as a shared service across all Frontbase deployments

### Open Questions
1. Is Infisical too heavyweight for self-hosted community users?
2. Can a custom secrets Worker replace Infisical's core value (versioning, rotation, audit)?
3. Should this be a cloud-only service or also self-hostable?
4. Multi-tenant model: one secrets Worker serving all Frontbase instances -- pricing/operational model?
