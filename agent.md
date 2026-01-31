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

---

## 4. Required Patterns

### 4.1 Frontend State Management

| State Type | Technology | Purpose |
|------------|------------|---------|
| Server State | TanStack Query | API data with caching |
| UI State | Zustand | Builder, canvas, panels |
| Form State | React Hook Form | User input handling |

**React Query Pattern**:
```typescript
const { data, isLoading } = useQuery({
  queryKey: ['pages', pageId],
  queryFn: () => api.getPage(pageId),
  staleTime: 5 * 60 * 1000, // 5 min cache
});
```

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

> [!IMPORTANT]
> `stylesData` is a builder-only structure and **MUST NOT appear in Edge runtime**.

### 4.5 Publish Pipeline

| Step | Function | Description |
|------|----------|-------------|
| 1 | `normalize_binding_location()` | Move `props.binding` → `component.binding` |
| 2 | `map_styles_schema()` | Convert `stylesData` → `styles` |
| 3 | `enrich_binding_with_data_request()` | Pre-compute HTTP request spec |
| 4 | `collect_icons_from_component()` | Gather all icon names |
| 5 | `fetch_icons_batch()` | Pre-render SVGs from CDN |
| 6 | `inject_icon_svg()` | Embed `iconSvg` in props |
| 7 | `remove_nulls()` | Clean for Zod validation |

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

### 5.4 OpenAPI Specification

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

### 6.4 Best Practices

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

*Last Updated: 2026-01-31*
