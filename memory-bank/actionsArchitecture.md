# Actions Engine Architecture

> Last Updated: 2026-01-07

## Overview

The Actions Engine enables workflow automation in Frontbase. It uses a **split architecture** with FastAPI handling design-time operations and Hono handling runtime execution.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTBASE STUDIO                               │
│                        (React Frontend :5173)                            │
│                                                                          │
│   ┌──────────────────┐                    ┌──────────────────────┐      │
│   │  Workflow Editor │────────────────────│  Component Builder   │      │
│   │   (React Flow)   │                    │  (Action Bindings)   │      │
│   └────────┬─────────┘                    └──────────┬───────────┘      │
└────────────┼────────────────────────────────────────┼───────────────────┘
             │                                        │
             ▼                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      FASTAPI BACKEND (:8000)                            │
│                                                                         │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│   │ /api/actions/   │  │  /api/sync/     │  │   /api/pages/   │        │
│   │    drafts       │  │  datasources    │  │     project     │        │
│   └────────┬────────┘  └─────────────────┘  └─────────────────┘        │
│            │                                                            │
│            │ POST /drafts/{id}/publish                                  │
│            ▼                                                            │
│   ┌─────────────────┐           ┌──────────────────────────────────┐   │
│   │ AutomationDraft │           │          unified.db               │   │
│   │ AutomationExec  │◄─────────►│  (Pages, Datasources, Drafts)    │   │
│   └────────┬────────┘           └──────────────────────────────────┘   │
└────────────┼───────────────────────────────────────────────────────────┘
             │
             │ HTTP POST /deploy
             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     HONO ACTIONS ENGINE (:3002)                         │
│                                                                         │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│   │   /deploy       │  │   /execute/:id  │  │  /webhook/:id   │        │
│   │   (receive)     │  │   (run flow)    │  │  (triggers)     │        │
│   └─────────────────┘  └────────┬────────┘  └─────────────────┘        │
│                                 │                                       │
│                                 ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    Workflow Execution Engine                     │  │
│   │  ┌──────┐  ┌──────────┐  ┌───────────┐  ┌──────────────────┐   │  │
│   │  │Trigger│─►│  Action  │─►│ Condition │─►│   HTTP Request   │   │  │
│   │  └──────┘  └──────────┘  └───────────┘  └──────────────────┘   │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                 │                                       │
│                                 ▼                                       │
│   ┌──────────────────────────────────────────────────────────────────┐ │
│   │                      data/actions.db                              │ │
│   │        (Published Workflows, Execution Logs)                      │ │
│   └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

## Database Separation

| Database | Location | Services | Contents |
|----------|----------|----------|----------|
| `unified.db` | `fastapi-backend/unified.db` | FastAPI, DB-Sync | Pages, Projects, Datasources, Drafts |
| `actions.db` | `services/actions/data/actions.db` | Hono Actions Engine | Published Workflows, Executions |

**Why separate?**
- Actions Engine is edge-deployable (Cloudflare Workers, Vercel Edge)
- Runtime can scale independently of builder
- Clear separation: design-time vs runtime data

## Services

### FastAPI Backend (Python)
- **Port**: 8000
- **Purpose**: Builder API, draft management, publishing
- **Database**: `unified.db` (SQLite, async via aiosqlite)
- **Key Routes**:
  - `POST /api/actions/drafts` - Create workflow draft
  - `PATCH /api/actions/drafts/{id}` - Update draft
  - `POST /api/actions/drafts/{id}/publish` - Deploy to Hono
  - `POST /api/actions/drafts/{id}/test` - Test execution

### Hono Actions Engine (TypeScript)
- **Port**: 3002
- **Purpose**: Workflow runtime, execution, webhooks
- **Database**: `data/actions.db` (SQLite via libsql)
- **Key Routes**:
  - `POST /deploy` - Receive published workflow
  - `POST /execute/{id}` - Execute workflow
  - `POST /webhook/{id}` - External trigger
  - `GET /executions/{id}` - Execution status

### Frontend (Vite/React)
- **Port**: 5173
- **Purpose**: UI, workflow editor, component builder
- **Proxy**: `/api/*` → FastAPI, `/actions/*` → Hono

## Startup Procedure

### Local Development

```bash
# Terminal 1: FastAPI Backend
cd fastapi-backend
python -m uvicorn main:app --reload --port 8000

# Terminal 2: Actions Engine
cd services/actions
npm run dev

# Terminal 3: Frontend
npm run dev
```

### Docker (Production)

```bash
docker-compose up -d
```

Docker Compose includes:
- `backend` (FastAPI) - runs migrations via `docker_entrypoint.sh`
- `frontend` (Nginx serving built React)
- `redis` (for Celery/caching)
- **Note**: Actions Engine should be added to docker-compose for full deployment

## Database Migrations

### FastAPI (Alembic)
```bash
cd fastapi-backend

# Generate migration after model changes
alembic revision --autogenerate -m "Add xyz column"

# Apply migrations
alembic upgrade head
```

**Docker**: Migrations run automatically via `docker_entrypoint.sh` on container start.

### Hono Actions Engine (Drizzle)
```bash
cd services/actions

# Generate migration
npm run db:generate

# Apply migration
npm run db:push
```

## Environment Variables

### FastAPI
| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./unified.db` | Main database |
| `ACTIONS_ENGINE_URL` | `http://localhost:3002` | Hono endpoint |
| `SECRET_KEY` | (required) | JWT signing key |

### Hono Actions Engine
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3002` | Server port |
| `DB_TYPE` | `sqlite` | Database type |
| `SQLITE_PATH` | `./data/actions.db` | SQLite file path |

## Deployment Options

### Option 1: VPS / Docker (Current)
- All services on same server via docker-compose
- Nginx proxies `/api/*` → FastAPI, `/actions/*` → Hono
- Simplest setup, good for small-medium scale

### Option 2: Hybrid (VPS + Edge)
- FastAPI + Frontend on VPS
- Hono deployed to Cloudflare Workers / Vercel Edge
- Best performance for global users

### Option 3: Full Cloud
- FastAPI on AWS Lambda / Cloud Run
- Hono on edge
- Frontend on Vercel/Netlify

---

## Edge Migration Path

This section documents how to migrate the Hono Actions Engine from Docker to edge deployment.

### Current Architecture (Docker)

```
┌─────────────────────────────────────────────────────────────────┐
│  Nginx (Frontend Container :8080)                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  /              → Static React App                          ││
│  │  /api/*         → Backend (FastAPI :8000)                   ││
│  │  /actions/*     → Actions Engine (Hono :3002)               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
         ↓                    ↓                    ↓
   Static Files          FastAPI             Hono Runtime
   (Same Host)          (Same Host)          (Same Host)
```

### Target Architecture (Edge)

```
                       ┌──────────────────┐
                       │  Your Domain     │
                       │  frontbase.io    │
                       └────────┬─────────┘
                                │
           ┌────────────────────┼────────────────────┐
           ↓                    ↓                    ↓
    frontbase.io/*      api.frontbase.io    actions.frontbase.io
    (CDN/Vercel)         (VPS/Cloud Run)    (Cloudflare Workers)
    
    Static React         FastAPI Backend     Hono Runtime
    - index.html         - Drafts CRUD       - Workflow Execution  
    - JS/CSS bundles     - Publishing        - Webhook Triggers
                         - DB-Sync           - ~50ms global latency
```

### Migration Steps

#### Step 1: Database Migration (Required for Edge)
Edge runtimes can't use local SQLite. Choose an edge-compatible database:

| Provider | Type | Latency | Notes |
|----------|------|---------|-------|
| **Turso** | SQLite (distributed) | ~5ms | Drizzle-compatible, same schema |
| **Cloudflare D1** | SQLite | ~2ms | Workers-only |
| **PlanetScale** | MySQL | ~10ms | Generous free tier |
| **Neon** | Postgres | ~15ms | Serverless Postgres |

**Update Drizzle config:**
```ts
// services/actions/drizzle.config.ts
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_URL!,        // libsql://your-db.turso.io
  authToken: process.env.TURSO_TOKEN!, // Your auth token
});
```

#### Step 2: Update Hono for Workers
Hono is already edge-native. Minimal changes needed:

```ts
// services/actions/src/index.ts
// Current (Node.js):
import { serve } from '@hono/node-server';
serve({ fetch: app.fetch, port: 3002 });

// Edge (Cloudflare Workers):
export default app;  // That's it!
```

Create `wrangler.toml`:
```toml
name = "frontbase-actions"
main = "dist/index.js"
compatibility_date = "2024-01-01"

[vars]
TURSO_URL = "libsql://your-db.turso.io"

[[d1_databases]]
binding = "DB"
database_name = "actions"
database_id = "your-db-id"
```

#### Step 3: Update Frontend API Client
```ts
// src/lib/actionsClient.ts
const ACTIONS_URL = import.meta.env.VITE_ACTIONS_URL || '/actions';

// In production, set VITE_ACTIONS_URL=https://actions.frontbase.io
```

#### Step 4: Update FastAPI Publish Endpoint
```python
# fastapi-backend/app/routers/actions.py
import os

ACTIONS_ENGINE_URL = os.getenv(
    "ACTIONS_ENGINE_URL", 
    "http://actions:3002"  # Docker default
    # Production: "https://actions.frontbase.io"
)
```

#### Step 5: Remove Nginx Proxy (Edge Only)
When Actions Engine is on edge, remove `/actions/*` from nginx.conf.
Frontend calls the edge URL directly via `VITE_ACTIONS_URL`.

### Deployment Commands

**Cloudflare Workers:**
```bash
cd services/actions
npm run build
npx wrangler deploy
```

**Vercel Edge:**
```bash
cd services/actions
vercel --prod
```

### Environment Variables Comparison

| Variable | Docker | Edge (Workers) |
|----------|--------|----------------|
| `DATABASE_URL` | `file:/app/data/actions.db` | `libsql://...turso.io` |
| `TURSO_TOKEN` | N/A | Required |
| `PORT` | `3002` | N/A (managed) |

### Rollback Plan
If edge deployment has issues:
1. Revert `VITE_ACTIONS_URL` to `/actions`
2. Restore `/actions/*` in nginx.conf
3. Redeploy Docker containers

### Performance Expectations

| Metric | Docker (Single VPS) | Edge (Global) |
|--------|---------------------|---------------|
| Workflow execution latency | ~100-300ms | ~20-50ms |
| Cold start | N/A | ~5-20ms |
| Geographic coverage | Single region | 300+ PoPs |
| Scaling | Manual/vertical | Automatic |

## Workflow Lifecycle

1. **Create**: User designs workflow in editor → saved as draft in FastAPI
2. **Test**: FastAPI sends draft to Hono → executes → returns result
3. **Publish**: FastAPI sends final version to Hono → stored permanently
4. **Execute**: Components trigger via webhook/API → Hono runs workflow
5. **Monitor**: View execution history in FastAPI UI
