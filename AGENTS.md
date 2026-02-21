# Frontbase Builder — Agent Protocol

> **Authority Level**: This document defines non-negotiable architectural rules and patterns. It takes precedence over all other documentation including memory-bank files. Changes to core invariants require updating this file first.

> [!CAUTION]
> ⚠️ **Violations of this protocol are considered architectural defects, not stylistic issues.**

---

## Agent Fallback Rules (When Unsure)

If an agent is uncertain about an implementation decision:

1. Prefer **backward compatibility** over new features
2. Prefer **additive schema changes** over modifications
3. Prefer **publish-time computation** over runtime logic
4. Prefer **existing patterns** over introducing new abstractions
5. Prefer **explicit code** over clever or dynamic behavior

When still uncertain:
→ **Stop and request clarification** rather than guessing.

---

## 1. Overview

Frontbase is an open-source, edge-native platform for deploying AI-powered apps and edge services with no-code. The system consists of three main components:

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | React 18, Vite, Tailwind, Zustand | Visual page builder & admin dashboard |
| **Backend** | FastAPI, SQLAlchemy, Alembic | API, design-time operations, publishing |
| **Edge Engine** | Hono, Drizzle ORM | Runtime SSR, workflows, self-sufficient |

---

## 2. Core Architectural Invariants

### 2.1 Edge Runtime Self-Sufficiency (HARD RULE)

> [!CAUTION]
> **The Edge Engine MUST run independently after publication.** It relies ONLY on its local database (SQLite/Turso) and Redis. It does NOT call back to FastAPI at runtime.

**The published page bundle is treated as an immutable runtime artifact.**
Runtime code may interpret it, but must not reshape or enrich it.

```
┌─────────────────────────────────────────────────────────────┐
│                    DESIGN TIME (Builder)                     │
│  React ←→ FastAPI ←→ PostgreSQL/SQLite                      │
│                           ↓ Publish                          │
└───────────────────────────┼─────────────────────────────────┘
                            ↓
┌───────────────────────────┼─────────────────────────────────┐
│                    RUNTIME (Edge)                            │
│  Browser ←→ Hono ←→ SQLite/Turso + Redis                    │
│             (NO calls to FastAPI!)                           │
└─────────────────────────────────────────────────────────────┘
```

**Implication**: All data needed at runtime MUST be pre-computed at publish time and stored in the published page bundle.

### 2.2 Backward Compatibility of Published Pages

- Published pages MUST continue to render correctly after codebase updates
- Schema changes to published data require migration paths
- Never break the `/api/import` contract without versioning

### 2.3 Dual Database Compatibility

| Environment | Database | Driver |
|-------------|----------|--------|
| Development | SQLite | `aiosqlite` (async) |
| Production | PostgreSQL | `asyncpg` (async) |
| Migrations | Both | Sync drivers via Alembic |

**Rule**: All SQL operations must work on both dialects. Use `render_as_batch=True` for SQLite ALTER TABLE compatibility.

### 2.4 Zero Runtime Coupling

The Edge Engine has no knowledge of:
- FastAPI internal APIs
- Builder-specific component logic
- Supabase SDK (uses pre-computed `DataRequest` instead)

---

## 3. Forbidden Actions

> [!WARNING]
> These actions will break the system's architecture. Never do them.

| ❌ Forbidden | Reason |
|--------------|--------|
| Edge calling FastAPI at runtime | Violates Edge Self-Sufficiency |
| Publishing secrets to Edge | Security risk |
| Using `CURRENT_TIMESTAMP` in migrations | Not portable (use `func.now()` or dialect check) |
| Holding DB connection during slow I/O | Causes QueuePool exhaustion |
| Using `native_enum=True` for PostgreSQL | Creates migration issues |
| Changing Pydantic schema without updating Zod | Breaks API contract |
| Adding required fields to published page schema | Breaks backward compatibility |
| Dropping `viewportOverrides` during publish transform | Breaks responsive styling |
| Hardcoding CSS in Edge instead of using cssBundle | Causes builder/SSR parity drift |
| **Modifying SQLAlchemy models without Alembic migration** | **Causes production schema drift** |
| **Editing deployed Alembic migrations** | **Create a NEW migration instead** |
| **Hardcoded aesthetic styles in Builder renderers** | **Use `stylesData.values` defaults instead** |
| **Enriching publish data without updating both schemas** | **Pydantic AND Zod must accept the enriched shape** |
| **Assuming all components store config in `binding`** | **Form/InfoList store in `props`; always check both** |
| **Passing raw SQLAlchemy data to edge without normalization** | **FK format (`constrained_columns`) differs from edge format (`column`/`referencedTable`)** |
| **Using default `extra='ignore'` (Pydantic) or `z.object()` (Zod) on publish schemas** | **Silently strips enriched fields. Use `extra='allow'` / `.passthrough()` for schemas that carry enriched data** |
| **Zustand store action called by multiple components without in-flight dedup** | **Causes N×N re-render cascades. Use module-level promise dedup (`let _promise = null`) for any store action that does `set()` and is called from `useEffect` in multiple components** |
| **Putting Zustand state in `useEffect` deps when it triggers `set()` on that same state** | **Creates infinite loop. Remove from deps array or add early-return guard inside the action** |
| **Moving API routes between services without updating proxy rules** | **Must update `vite.config.ts` (dev) AND `nginx.conf` (prod) when a route moves from Edge to FastAPI or vice versa** |
| **Adding new API route prefixes without checking `TrailingSlashMiddleware`** | **Add the prefix to `EXCLUDE_PREFIXES` in `main.py` or the middleware will cause 307 redirect loops** |
| **`useQuery` without `retry` and `refetchOnWindowFocus` limits** | **Default React Query settings flood the backend on errors. Always set `retry: 1` and `refetchOnWindowFocus: false` for non-critical queries** |
| **Assuming Supabase keys are always JWTs (`eyJ...`)** | **Newer Supabase keys use `sb_secret_` prefix. Never validate key format by counting dots** |
| **`decrypt_data` returning raw encrypted blob on failure without flag** | **Callers must compare output to input to detect silent failures: `if decrypted != encrypted_input`** |

---

## 4. Required Patterns

### 4.1 Frontend State Management

| State Type | Technology | Purpose |
|------------|------------|---------|
| Server State | TanStack Query | API data with caching |
| UI State | Zustand | Builder, canvas, panels |
| Form State | React Hook Form | User input handling |

**React Query Pattern** (mandatory defaults for all new queries):
```typescript
const { data, isLoading } = useQuery({
  queryKey: ['pages', pageId],
  queryFn: () => api.getPage(pageId),
  staleTime: 5 * 60 * 1000, // 5 min cache
  retry: 1,                  // REQUIRED: prevent request flooding on errors
  refetchOnWindowFocus: false, // REQUIRED: prevent tab-switch request storms
});
```

> [!CAUTION]
> **Every `useQuery` MUST have `retry` and `refetchOnWindowFocus` set.** Default React Query settings (3 retries + refetch on focus) will DDoS your own backend when an endpoint returns errors. This freezes the FastAPI terminal and makes `Ctrl+C` unresponsive.

**Store Init Dedup Pattern** (required for any Zustand action called from multiple components):
```typescript
// Module-level — outside the store
let _initPromise: Promise<void> | null = null;

// Inside the store
initialize: () => {
  if (_initPromise) return; // Already in-flight
  _initPromise = (async () => {
    try {
      // ... do work, call set() ...
    } finally {
      _initPromise = null;
    }
  })();
},
```

> **Rule**: Any async Zustand action that (a) calls `set()` and (b) is called from `useEffect` in 2+ components **MUST** use this module-level promise dedup pattern. Additionally, `set()` calls should check if the value actually changed before writing (e.g., `if (current.x !== newX) set({x: newX})`), to avoid triggering subscriber re-renders on no-op updates.

### 4.2 Component System (Builder)

**One File Per Component**:
```
src/components/builder/renderers/
├── basic/          # Text, Heading, Button, etc.
├── layout/         # Container, Row, Column, Grid
├── data/           # DataTable, Chart
└── landing/        # Hero, Features, Pricing
```

**Central Registry**: `src/components/builder/registry/componentRegistry.tsx`
```typescript
const COMPONENT_REGISTRY: Record<string, ComponentType<any>> = {
  Text: TextRenderer,
  Button: ButtonRenderer,
  // ...
};
```

**Lego-Style Composition**: Renderers MUST recursively delegate children:
```typescript
// Builder (React)
{component.children?.map(child => (
  <ComponentRenderer key={child.id} component={child} />
))}

// SSR (Hono)
const childrenHtml = children.map(c => renderComponent(c)).join('');
```

### 4.3 Data Layer

**Automatic FK Joins**: `useDatabase.ts` automatically resolves foreign key relationships in data binding.

**Release-Before-IO Pattern** (prevents connection pool exhaustion):
```python
# 1. Fetch data quickly
db = SessionLocal()
try:
    page = db.query(Page).filter(Page.id == page_id).first()
    db.expunge(page)  # Detach from session
finally:
    db.close()  # RELEASE CONNECTION

# 2. Slow I/O without holding connection
async with httpx.AsyncClient() as client:
    await client.post(edge_url, json=payload)  # Now safe!
```

### 4.4 Styling System

**Visual CSS Engine**: Metadata-driven styling from `src/lib/styles/configs.ts`
- Preset properties (colors, spacing, typography)
- Responsive breakpoints (mobile/tablet/desktop)
- `stylesData` in Builder → `styles` after publish

**Visibility Settings**:
```typescript
visibility: {
  mobile: boolean,   // Show on mobile?
  tablet: boolean,   // Show on tablet?
  desktop: boolean   // Show on desktop?
}
```

**Viewport Overrides** (in `stylesData`):
```typescript
stylesData: {
  values: { fontSize: '16px', color: '#000' },  // Base (desktop)
  viewportOverrides: {
    mobile: { fontSize: '14px' },               // Mobile override
    tablet: { fontSize: '15px' }                // Tablet override
  }
}
```

**CSS Bundling**:
- CSS Registry: `app/services/css_registry.py` defines all component CSS
- Tree-shaking: Only CSS for used components is bundled
- Bundle stored in `cssBundle` field of published page
- Edge uses `page.cssBundle` with fallback for legacy pages

> [!IMPORTANT]
> `stylesData` is a builder-only structure. After publish, it is transformed to `styles` with `viewportOverrides` preserved.

### 4.5 Publish Pipeline

| Step | Function | Description |
|------|----------|-------------|
| 1 | `normalize_binding_location()` | Move `props.binding` → `component.binding` |
| 2 | `map_styles_schema()` | Convert `stylesData` → `styles` (preserving `viewportOverrides`) |
| 3a | `enrich_binding_with_data_request()` | Pre-compute HTTP request spec |
| 3b | Form/InfoList column baking | Bake `columns`, `foreignKeys`, `fieldOverrides`, `fieldOrder` into binding AND `props._columns` (Zod-safe) |
| 4 | `collect_icons_from_component()` | Gather all icon names |
| 5 | `fetch_icons_batch()` | Pre-render SVGs from CDN |
| 6 | `inject_icon_svg()` | Embed `iconSvg` in props |
| 7 | `bundle_css_for_page_minified()` | Tree-shake CSS, generate bundle |
| 8 | `remove_nulls()` | Clean for Zod validation |

> [!IMPORTANT]
> **Step 3b dual-path**: Enriched data is stored in BOTH `component.binding` (for edge components that read binding) AND `component.props._columns` (as a Zod-safe fallback via `z.record`). The `renderForm` SSR function reads `_columns` from props and reconstructs the binding for React hydration.

**CSS Bundling (Tree-Shaken)**:
- CSS Registry: `app/services/css_registry.py` (single source of truth)
- CSS Bundler: `app/services/css_bundler.py` (multi-tier caching)
- Caching: L1 Memory → L2 Redis (24h TTL) → L3 Generate from registry

**Icon Caching (L1/L2/L3)**:
- L1: In-memory `_ICON_CACHE` (instant)
- L2: Redis with 30-day TTL
- L3: CDN fetch (`unpkg.com/lucide-static`)

### 4.6 Variable Scopes (LiquidJS Templating)

| Scope | Description | Example |
|-------|-------------|---------|
| `page` | Page-level variables | `{{ page.title }}` |
| `session` | Supabase session | `{{ session.user.email }}` |
| `cookies` | Browser cookies | `{{ cookies.theme }}` |
| `visitor` | Client context | `{{ visitor.country }}` |
| `query` | URL parameters | `{{ query.utm_source }}` |

---

## 5. API Contract (Pydantic ↔ Zod)

### 5.1 Mirrored Schema Files

| FastAPI | Edge | 
|---------|------|
| `fastapi-backend/app/schemas/publish.py` | `services/edge/src/schemas/publish.ts` |

Both files explicitly state: *"These mirror the [Zod/Pydantic] schemas in [Hono/FastAPI]"*

### 5.2 Key Schemas

| Schema | Purpose |
|--------|---------|
| `PublishPageRequest` / `PublishPageSchema` | Page bundle to Edge |
| `DataRequest` / `DataRequestSchema` | Pre-computed HTTP fetch |
| `ComponentBinding` / `ComponentBindingSchema` | Data bindings |
| `PageComponent` / `PageComponentSchema` | Recursive component tree |

### 5.3 Contract Rules

| Rule | Description |
|------|-------------|
| **Mirror Changes** | Any Pydantic change MUST update Zod |
| **Use Aliases** | `Field(..., alias="camelCase")` for JSON compatibility |
| **Nullish Matching** | Zod `.nullish()` = Pydantic `Optional[...] = None` |
| **No Secrets** | Only `anonKey` and `secretEnvVar` name published |
| **Validate Contracts** | Run `validate_contract.py` before releases |
| **Enrichment Safety** | When baking new data shapes at publish time (e.g., column objects vs column strings), update both `ComponentBinding` (Pydantic) and `ComponentBindingSchema` (Zod) to accept the enriched types. Use `List[Any]` / `z.union()` or `extra="allow"` / `.passthrough()` |
| **Dual-Path Data** | For data that may be stripped by strict schema validation, also store in `component.props` (which uses `z.record(z.string(), z.unknown())` — passes through both Pydantic and Zod without stripping) |
| **FK Normalization** | SQLAlchemy returns `{constrained_columns, referred_table, referred_columns}`. Edge expects `{column, referencedTable, referencedColumn}`. Always normalize in the publish pipeline before baking. |
| **Props-First Priority** | On re-publish, `props` (fresh from builder) MUST take priority over `binding` (stale from previous publish). Never let stale binding data shadow the user's latest selections. |
| **Loud Validation** | Always log validation errors on the publish boundary. Use `extra='allow'` (Pydantic) / `.passthrough()` (Zod) on schemas carrying enriched data. When using `safeParse()`, always log `result.error.issues` on failure. |

### 5.4 Contract Validation Scripts

| File | Purpose |
|------|---------|
| `fastapi-backend/scripts/validate_contract.py` | Validate Pydantic schemas have required fields |
| `services/edge/scripts/validate-contract.ts` | Validate Zod schemas match Pydantic |
| `fastapi-backend/contracts/publish-contract.json` | JSON Schema snapshot for comparison |

### 5.5 OpenAPI Specification

- Edge uses `@hono/zod-openapi` with OpenAPI 3.1.0
- API docs: `GET /api/openapi.json`
- Swagger UI: `GET /api/docs`

---

## 6. Database Migrations (Alembic)

### 6.1 Single Migration System

Alembic is the ONLY migration system. Located in `fastapi-backend/alembic/versions/`.

> [!NOTE]
> Migrations are written assuming SQLAlchemy models may be async, but **Alembic operations are always synchronous**. Never use `await` inside migration files.

### 6.2 Auto-Deployment

```bash
# docker_entrypoint.sh runs on container start
alembic upgrade head
```

### 6.3 Dialect-Agnostic Rules

```python
def upgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name  # 'sqlite' or 'postgresql'
    now_func = "datetime('now')" if dialect == 'sqlite' else "NOW()"
```

| Rule | SQLite | PostgreSQL |
|------|--------|------------|
| DateTime | `datetime('now')` | `NOW()` |
| Boolean | Python `True`/`False` | Same |
| Enum | `native_enum=False` | Avoids type issues |
| ALTER TABLE | `render_as_batch=True` | Direct OK |

### 6.4 Mandatory Migration Rule

> [!CAUTION]
> **EVERY SQLAlchemy model change MUST have a corresponding Alembic migration.**

Whenever you:
- Add a column to a model → Create migration with `op.add_column()`
- Remove a column → Create migration with `op.drop_column()`
- Rename a table/column → Create migration with `op.rename_table()` or `op.alter_column()`
- Change column type/constraints → Create migration with `op.alter_column()`

**The migration MUST be created in the same commit as the model change.** Do not wait for deployment errors to create migrations.

Example workflow:
1. Modify `models.py` (e.g., add `logo_url` column)
2. Immediately create `alembic/versions/XXXX_add_logo_url.py`
3. Test locally with `alembic upgrade head`
4. Commit both files together

### 6.5 Best Practices

1. Check table existence before CREATE
2. Include both `upgrade()` and `downgrade()`
3. Never edit deployed migrations
4. Test locally before deploying

---

## 7. Performance & Reliability

### 7.1 Database Pool Management

**Problem**: Holding connections during slow I/O exhausts the pool.
**Solution**: Release-Before-IO pattern (see Section 4.3).

### 7.2 Redis Caching

**Strategy**: HTTP-First Unified via `@upstash/redis`

| Cache Layer | Location | TTL |
|-------------|----------|-----|
| React Query | Browser | 5 min (stale) |
| Edge Redis | L2 | 60s (data), 30d (icons) |

### 7.3 Icon Pre-rendering

Icons are fetched at publish time, NOT at Edge runtime. This eliminates CDN latency for page renders.

### 7.4 SSR Hydration Strategy

The edge uses two different React mounting strategies depending on the component type:

| Component | Strategy | Reason |
|-----------|----------|--------|
| **DataTable** | `hydrateRoot` | SSR output matches client render |
| **Form** | `createRoot` | SSR is a skeleton placeholder; client renders real fields |

> [!WARNING]
> **Never use `hydrateRoot` for components whose SSR is intentionally a placeholder/skeleton.** This causes a hydration mismatch error. Use `createRoot` instead — it clears the skeleton children and does a fresh render.

Implemented in `services/edge/src/client/entry.tsx`:
```typescript
if (componentName === 'Form' || componentName === 'form') {
    element.innerHTML = ''; // Clear SSR skeleton
    const root = createRoot(element);
    root.render(reactTree);
} else {
    hydrateRoot(element, reactTree);
}
```

---

## 8. Tech Stack

### Frontend
- React 18, TypeScript, Vite
- Tailwind CSS, shadcn/ui
- Zustand, TanStack Query
- @dnd-kit (drag & drop)

### Backend
- FastAPI, Python 3.11+
- SQLAlchemy (async), Alembic
- Pydantic v2

### Edge Engine
- Hono (OpenAPI)
- Drizzle ORM, SQLite/Turso
- LiquidJS (templating)
- @upstash/redis (HTTP)

---

## 9. Directory Structure

```
frontbase/
├── src/                          # React frontend
│   ├── components/
│   │   ├── builder/              # Page builder
│   │   │   ├── registry/         # Component registry
│   │   │   ├── renderers/        # Component renderers
│   │   │   └── panels/           # Properties, layers, etc.
│   │   └── dashboard/            # Admin UI
│   ├── hooks/                    # React Query hooks
│   ├── stores/                   # Zustand stores
│   └── lib/styles/               # Visual CSS engine
├── fastapi-backend/              # Python backend
│   ├── app/
│   │   ├── routers/              # API routes
│   │   ├── schemas/              # Pydantic schemas
│   │   ├── models/               # SQLAlchemy models
│   │   └── services/             # Business logic
│   └── alembic/                  # Database migrations
├── services/edge/                # Hono Edge Engine
│   └── src/
│       ├── routes/               # API handlers
│       ├── schemas/              # Zod schemas
│       ├── ssr/                  # SSR rendering
│       ├── cache/                # Redis module
│       └── storage/              # File storage
└── memory-bank/                  # Project documentation
```

---

## 10. API Routes

### FastAPI Backend (`:8000`)
| Route | Purpose |
|-------|---------|
| `POST /api/auth/login` | Authentication |
| `GET /api/pages` | List pages |
| `POST /api/pages/{id}/publish/` | Publish to Edge |
| `GET /api/database/tables` | List tables |
| `GET /api/project` | Project settings |

### Edge Engine (`:3002`)
| Route | Purpose |
|-------|---------|
| `GET /api/health` | Health check |
| `POST /api/import` | Receive published page |
| `POST /api/data/execute` | Execute DataRequest |
| `GET /{slug}` | Render SSR page |
| `GET /api/docs` | Swagger UI |

---

## 11. Development Workflow

### Local Development

```bash
# Terminal 1: Backend
cd fastapi-backend
.\venv\Scripts\activate
python -m uvicorn main:app --reload --port 8000

# Terminal 2: Frontend
npm run dev

# Terminal 3: Edge (optional)
cd services/edge
npm run dev
```

### Docker (Production)

```bash
docker-compose up -d
```

---

## 12. Documentation Discipline

### Authority Hierarchy

1. **agent.md** — Non-negotiable rules (this file)
2. **memory-bank/*.md** — Implementation patterns and details
3. **Code comments & README** — Local implementation context

### Maintenance Rules

| Action | Update Required |
|--------|-----------------|
| New invariant discovered | This file + memory-bank/decisionLog.md |
| Pattern changed | memory-bank/systemPatterns.md |
| Schema changed | Both Pydantic AND Zod files |
| Feature completed | memory-bank/progress.md |

### Memory Bank Files

| File | Purpose | Update Trigger |
|------|---------|----------------|
| `activeContext.md` | Current session state | Every session |
| `progress.md` | Feature completion log | Per feature |
| `systemPatterns.md` | Recurring code patterns | Pattern changes |
| `decisionLog.md` | Architectural decisions | Major decisions |
| `database_patterns.md` | SQLite/PostgreSQL patterns | DB changes |
| `edgeArchitecture.md` | Edge Engine details | Edge changes |
| `redisArchitecture.md` | Redis strategy | Cache changes |
| `sprints.md` | Sprint planning | Sprint updates |

---

## 13. References

For detailed implementation patterns, see:

| Topic | File |
|-------|------|
| System Patterns | `memory-bank/systemPatterns.md` |
| Edge Architecture | `memory-bank/edgeArchitecture.md` |
| Database Patterns | `memory-bank/database_patterns.md` |
| Redis Architecture | `memory-bank/redisArchitecture.md` |
| Development Patterns | `memory-bank/developmentPatterns.md` |
| LiquidJS Templating | `memory-bank/liquidjs_templating_guide.md` |
| Alembic Migrations | `fastapi-backend/MIGRATIONS.md` |
| Storage Providers | `services/edge/src/storage/README.md` |
| Redis Cache Module | `services/edge/src/cache/README.md` |

---

## 10. API Migration Checklist

> [!IMPORTANT]
> When moving API routes between services (e.g., Edge → FastAPI), follow this checklist. Writing the new code is ~30% of the work. The other 70% is updating the surrounding infrastructure.

### 10.1 Pre-Implementation Audit

Before writing any code, trace the **full request path** end-to-end:

```
Browser → Vite Proxy (vite.config.ts) → Target Service → External API
Browser → Nginx (nginx.conf)           → Target Service → External API
```

| Step | Check | File(s) |
|------|-------|---------|
| 1 | Which proxy rules currently route to the OLD service? | `vite.config.ts`, `nginx.conf` |
| 2 | Does `TrailingSlashMiddleware` have an exclude list? Does my new prefix need to be in it? | `fastapi-backend/main.py` |
| 3 | What does the stored auth key actually look like? Query the DB and decrypt it. | `unified.db` → `project` table |
| 4 | Are there middleware or CORS settings that affect the new routes? | `main.py` |
| 5 | What does the frontend `useQuery` config look like? Does it have retry limits? | Component files |

### 10.2 Implementation Touchpoints

Every migration must update **all** of these:

| Layer | What to update |
|-------|----------------|
| **Backend routes** | New router file with endpoints |
| **Dev proxy** | `vite.config.ts` — update target for the migrated prefix |
| **Prod proxy** | `nginx.conf` — update upstream for the migrated prefix |
| **Middleware excludes** | `TrailingSlashMiddleware.EXCLUDE_PREFIXES` in `main.py` |
| **Frontend queries** | Add `retry: 1`, `staleTime`, `refetchOnWindowFocus: false` |
| **Local DB** | Run `alembic upgrade head` and verify columns exist |

### 10.3 Post-Implementation Smoke Tests

Before calling the migration done, run these exact tests:

```bash
# 1. Direct backend test (no proxy)
curl http://localhost:8000/api/<new-prefix>/<endpoint>
# Expect: 200 with real data (NOT a 307 redirect)

# 2. Through Vite proxy (dev)
curl http://localhost:5173/api/<new-prefix>/<endpoint>
# Expect: 200 (same as above, proxied)

# 3. Open browser, navigate to the page that uses the endpoint
# Expect: Data loads, no "Network Error", no "Failed to fetch"

# 4. Kill FastAPI, reload browser page
# Expect: Clean error message (NOT a terminal freeze)
```

---

*Last Updated: 2026-02-21*
