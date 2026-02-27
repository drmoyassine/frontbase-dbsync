# Frontbase Backlog

## 🐛 Known Bugs

- [ ] **SSR page width issue** — Page content does not span the full viewport width in SSR output.

  **Symptom:** Published pages show content narrower than the viewport. On widescreen, the page body appears centered with visible background bleed on the sides. The Navbar, Hero, and section backgrounds don't reach the viewport edges.

  **Investigation done (2026-02-22, ~3 hours):**

  **Fixes applied (these resolved related but distinct issues):**
  1. ✅ **Tailwind `.container` conflict** — Layout type `Container` was generating the raw CSS class `container`, which triggers Tailwind's built-in `.container { max-width: 640px/768px/1024px/1280px }`. Fixed by prefixing all layout types with `fb-` (e.g. `fb-container`).
  2. ✅ **Padding `[object Object]`** — Builder padding objects like `{ top: 100, bottom: 50 }` were being stringified to `[object Object]`. Fixed with explicit box-model expansion in `renderPage()`.
  3. ✅ **Unit-less numeric values** — `gap: 30` was missing `px`. Fixed with auto-append logic in `renderPage()`.
  4. ✅ **rawCSS stripping** — `transforms.py` was dropping the `rawCSS` artifact during publish. Fixed to pass it through.

  **What still doesn't work:**
  The page wrapper `.fb-page` renders at less than full viewport width on large screens. The navbar and sections appear bounded rather than edge-to-edge.

  **Likely root causes (not yet verified):**
  1. **`renderPage()` root `size` object** (line 371–381) — If `containerStyles.values.size.width` is set (e.g. `1280` with `widthUnit: 'px'`), it injects `width:1280px` on the `.fb-page` wrapper, constraining the entire page. **Check:** Log `layoutData.root.containerStyles.values` to see if a `size` object with explicit width exists.
  2. **Container `margin:0 auto`** (line 288, 292) — Every `Container` and grid container gets `style="margin:0 auto;width:100%"`. The `width:100%` is relative to the parent's content box. If the parent `.fb-page` has an explicit width or padding, children don't reach the viewport edge.
  3. **`fb-page` in `baseStyles.ts`** (line 58) — `.fb-page { min-height:100vh; display:flex; flex-direction:column; }` — This is correct but does NOT set `width:100%`. If `renderPage()` doesn't inject a width, the flex column may collapse to content width depending on browser defaults.
  4. **Interaction between layers** — `containerStyles` from the builder may set `horizontalAlign: 'center'` (line 395–406), which adds `margin-left:auto; margin-right:auto` to the root `fb-page` div. Combined with no explicit `width:100%`, this could create the centering/narrowing effect.

  **Recommended next steps:**
  - Add `console.log(JSON.stringify(layoutData.root, null, 2))` to `renderPage()` and inspect the actual root data being processed
  - Check if the builder sets a `size.width` in `containerStyles.values` by default
  - Verify whether adding `width:100%` to the `.fb-page` style in `renderPage()` line 470 resolves the issue
  - Compare the builder's `CanvasWrapper` root styles with what `renderPage()` generates

## 🔴 Edge Auth & Private Pages (HIGH PRIORITY)

Infrastructure exists (`auth.ts`, `context.ts`, `@supabase/supabase-js` already in Edge) but is not wired up. Implementation is phased:

### Phase 1: Login/Signup Form Component
- [ ] **Auth Form component** — New builder component (Login/Signup form) that renders via Edge SSR
- [ ] **Client-side auth** — Hydrated form calls `supabase.auth.signInWithPassword()` / `signUp()` directly from browser
- [ ] **Session cookie setting** — After successful auth, store JWT in `httpOnly` cookie via Hono endpoint (not localStorage)
- [ ] **Redirect after login** — Configurable redirect URL per form instance

### Phase 2: Private Page Enforcement
- [ ] **Uncomment and implement page gating** — `pages.ts:360` — check `page.isPublic`, redirect unauthenticated users to a configured login page
- [ ] **Auth middleware in Hono** — Extract and verify JWT from cookie before SSR, populate `context.user`
- [ ] **Configurable login redirect** — Project-level setting: "When unauthorized, redirect to: [slug]"

### Phase 3: Role-Based Visibility
- [ ] **Component-level access rules** — Builder property: "Visible to roles: [admin, user, ...]"
- [ ] **Server-side filtering** — Exclude components from SSR output if user role doesn't match (not CSS `display:none`)
- [ ] **User-scoped data queries** — Pass user JWT when fetching `record`/`records` context so Supabase RLS filters data

### Phase 4: Admin User Management (Dashboard)
- [ ] **Users panel** — List, search, invite, delete Supabase auth users from the FastAPI dashboard
- [ ] **Decision: `supabase-py` vs raw `httpx`** — GoTrue Admin API for user CRUD (invite, list, delete, update roles)
- [ ] **Contacts sync** — Ensure `contacts` table stays in sync with auth users

## 🟠 Edge Data Resilience & Status (MEDIUM-HIGH PRIORITY)

Covers provider state mismatch, quota fallback, and operational visibility.

### Provider State Mismatch
- [ ] **Auto-migrate on Turso connect** — When Turso is first enabled, bulk-push all previously published pages from backend → Turso so "Published" status stays accurate
- [ ] **Publish-state sync check** — On Settings save (Turso toggle), compare backend published pages vs Turso rows, warn about drift
- [ ] **Skip redundant publishes (content hash)** — Hash `layoutData + cssBundle`, store as `content_hash` column. If unchanged, skip Turso write + Upstash invalidation entirely

### Quota Exhaustion & Fallback
- [ ] **Turso quota guard** — Monitor row reads/writes. If nearing limit, warn in UI. If exceeded, auto-fallback to local SQLite with banner
- [ ] **Upstash quota guard** — Monitor commands/month. If nearing limit, reduce TTL or disable L2 cache gracefully
- [ ] **Graceful provider downgrade** — If Turso/Upstash connection fails at runtime, fall back to local SQLite/no-cache without crashing. Log and surface in status panel

### UI Indicators
- [ ] **Edge vs Local badge** — Show "☁️ Turso" or "💾 Local SQLite" badge on published pages in the builder, so the user knows where data lives
- [ ] **Live status panel** — Settings page widget showing Turso (rows used / quota, connection status) and Upstash (commands used / quota, hit rate) live stats
- [ ] **Provider switch confirmation** — When toggling Turso on/off, show confirmation dialog explaining data migration implications

## Performance
- [x] **Replace Tailwind CDN with build-time CSS generation** — ~~Currently SSR pages load `cdn.tailwindcss.com` (~300KB JS) for runtime class compilation.~~ Implemented via `tailwind_cli.py` auto-provisioning + `@source inline()` in `css_bundler.py`. Classes are extracted from `layoutData` at publish time and compiled into a static `cssBundle`.
- [ ] **Backend Redis Caching** — Extend Redis caching to FastAPI backend for data source operations. Cache table/column metadata (Schema Discovery), external API caching, and rate limiting.

## Data Layer & Tables
- [ ] **User-configurable FK display columns** — Allow users to select which columns to display for foreign key relationships.
- [ ] **Optimized fetching** — Select specific columns instead of `*` for better performance.
- [ ] **Heuristic FK detection fallback** — Auto-detect foreign keys based on column names if DB schema lacks explicit FKs.
- [ ] **Multi-level relation support** — Support fetching data for nested foreign key relationships.

## Integration & Deployment
- [ ] **Multi-Database Support** — Neon/PlanetScale HTTP drivers, Self-hosted Postgres/MySQL support.
- [ ] **Local Data Proxy (Hybrid Edge)** — Connect Edge workers to local/private infrastructure (Redis, SQL) without public IPs using tools like `serverless-redis-http` or Cloudflare Tunnels.
- [ ] **One-Click Integrations** — Simplify connecting third-party services (Upstash auto-create, Supabase project selector, Vercel auto-deploy).
- [x] **Conditional Service Deployment** — Implemented via `docker-compose.standalone-edge.yml` and `docker-compose.distributed/` tier-based compose files.
- [x] **Cloudflare Workers/Pages Deployment** — Adapter pattern (`IEdgeAdapter`) with Docker (default) and Cloudflare adapters. `deployment_targets` table for multi-provider publish registry. See `services/edge/CLOUDFLARE-DEPLOY.md`.
- [ ] **Multi-Provider Load Balancing** — DNS-level weighted routing across multiple edge providers (Cloudflare + Vercel + Netlify). Uses `deployment_targets` table hooks (add `weight`, `quota_limit`, `quota_used` columns). Advanced feature for high-traffic deployments.
- [ ] **Vercel Edge Adapter** — New `IEdgeAdapter` implementation for Vercel Edge Functions.
- [ ] **Netlify Edge Adapter** — New `IEdgeAdapter` implementation for Netlify Edge Functions.
- [ ] **Automations-Only Bundle Template** — Separate Worker bundle for workflow-only deployments. Strips React + ReactDOM (~500 KB), LiquidJS (~150 KB), SSR routes, component renderers (~100 KB), client hydration bundle, page store, and Tailwind processing (~100 KB). Keeps: Hono, Drizzle + libsql, Upstash, workflow engine, execute/webhook/health routes. Estimated ~1.1 MB vs ~2.2 MB full bundle. Needs new `cloudflare-automations.ts` adapter entry point + `tsup.cloudflare-automations.ts` config. UI: scope selector when connecting Cloudflare (Full / Pages Only / Automations Only).
- [ ] **Extract Shared Edge Core** — Refactor `cloudflare-lite.ts` into `shared/edge-core.ts` (Hono app, routes, DB/cache logic) + thin adapter wrappers per provider (CF, Vercel, Netlify, Supabase Edge). Each wrapper is ~3 lines.
- [ ] **Edge `/api/config` Endpoint** — Receive project settings updates (favicon, analytics ID, custom domain) without redeploying the Worker.
- [ ] **Edge CORS Origin Configuration** — Currently allows all origins. Should be configurable per deployment target via project settings.
- [ ] **Edge Request Logging** — Structured `console.log` with timestamp, slug, response time, cache hit/miss. Lightweight, no external deps.
- [ ] **Edge Inspector Dialog (`EdgeInspectorDialog.tsx`)** — Provider-agnostic inspector popup for any deployment target. Click an inspect icon on a target row → opens a dialog with split-pane layout: left panel shows files (worker source) + secrets (names only, not values) + bindings (KV/D1/R2); right panel shows a Monaco Editor (read-only) for viewing the actual edge function code. Works across all providers (Cloudflare Workers, Supabase Edge Functions, Vercel Edge, etc.) via provider-specific backend endpoints. CF Workers are single-file bundles; Supabase Edge Functions have multi-file Deno projects. **Dependencies already available:** Monaco (`@monaco-editor/react` in package.json), Dialog (`@radix-ui/react-dialog`), FileBrowser pattern (`src/components/dashboard/FileBrowser/`). **Needs:** 3 backend endpoints per provider (content, secrets, settings), the `EdgeInspectorDialog` component itself, and an icon button on each target row in `DeploymentTargetsForm.tsx`.

## SEO & Discoverability
- [ ] **`/robots.txt` on Edge** — Auto-generated from project settings. Served by the Edge Worker, configurable (allow/disallow paths).
- [ ] **`/sitemap.xml` on Edge** — Auto-generated from published page slugs in Turso. Served by the Edge Worker, updated on each publish.

## Enterprise & Security
- [ ] **Enterprise Secrets Management** — Self-hosted Infisical integration for deploy-time secrets injection, E2E encrypted storage, audit logs.
- [ ] **GDPR Compliance Enhancements** — Cookie Consent Banner, IP Anonymization Toggle (`anonymizeIPs`), auto-generated Privacy Policy Template, Data Retention Controls.

## Storage & Assets
- [ ] **Storage Architecture Refactor** — Move admin storage APIs to FastAPI. On-demand edge shipping (tree-shaking storage routes from edge bundle).
- [ ] **Storage Provider Selector** — Dropdown in Settings to select default storage provider (multi-provider support: Supabase, S3, R2).

## Enhancements & App Experience
- [ ] **PWA Support for Published Apps** — Dynamic Manifest, Service Worker (Cache-first for static, Network-first for API), offline support, "Add to Home Screen" prompt.
- [ ] **Custom WebSockets** — Custom WebSocket implementation for real-time workflow execution streaming (replacing Supabase Realtime).
- [ ] **Observability** — Axiom/Sentry logging integration, OpenTelemetry tracing.

## Edge DX & Tooling
- [ ] **Edge Code Editor (Inspector IDE)** — Turn the Edge Inspector into a lightweight code editor for the edge codebase:
  - Inspector displays the **source TypeScript files** from the local `services/edge/src/` directory (served by the backend, NOT uploaded to CF).
  - User can **browse and edit** source files in the Monaco editor (routes, engine, cache, storage, adapters, etc.).
  - "Compile & Deploy" action: backend writes modified files → compiles via existing Docker/local `_build_worker()` → deploys compiled `worker.js` to CF.
  - **CF Worker only ever contains `worker.js`** (compiled bundle). Source code stays local.
  - **No paid plan needed** — uses existing compilation infrastructure. No new services required.
  - **Primary consumer: AI coding agent** living inside the dashboard — reads source, modifies files, compiles & deploys autonomously.
  - **Prerequisite:** The edge source codebase (`services/edge/src/`) must maintain a clean, well-commented, human-readable structure with JSDoc comments on all exports, clear file/folder naming, and architectural comments. This serves as context for both the AI agent and human reviewers inspecting deployed Workers.
