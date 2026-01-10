# Universal Edge Implementation Plan
*Consolidated Architecture & Implementation Details*

**Last Updated:** 2026-01-10

---

## 1. Executive Summary
Frontbase uses a **Dual-Runtime Architecture**:

| Runtime | Role | Technology | Status |
| :--- | :--- | :--- | :--- |
| **FastAPI** | Design-Time (Builder) | Python/Pydantic | ✅ No Changes Needed |
| **Hono** | Publish-Time (Pages/Actions) | TypeScript/Zod | ✅ Core Implemented |

**Key Principle:** The Hono Engine runs autonomously on the Edge with zero runtime dependency on FastAPI.

```
Design Time (Dev)                  Publish Time (Runtime)
┌─────────────────┐               ┌───────────────────────┐
│ React Builder UI│               │      Hono Engine      │
└────────┬────────┘               └───────────┬───────────┘
         │ POST /deploy                       │
         ▼                                    ▼
┌─────────────────┐               ┌───────────────────────┐
│ FastAPI Backend │               │     HTTP Database     │
│    (Pydantic)   │               │      S3 Storage       │
└────────┬────────┘               └───────────────────────┘
         │
         ▼
    Database
```

---

## 2. The FastAPI ↔ Hono Contract

### 2.1 How It Works
1. **FastAPI (Pydantic)** defines schemas for Workflows, Pages, etc.
2. **Hono (Zod)** defines the same schemas using `@hono/zod-openapi`.
3. **Contract:** Both speak **OpenAPI 3.x JSON**.

### 2.2 Evidence in Codebase
| Side | Library | Key Files |
| :--- | :--- | :--- |
| **Hono** | `@hono/zod-openapi` | `workflow.ts`, `deploy.ts` |
| **FastAPI** | Pydantic (Native) | `fastapi-backend/app/services/sync/models/` |

---

## 3. Universal Edge Strategy (Write Once, Run Anywhere)

> [!IMPORTANT]
> Avoid "Platform Primitives". Use HTTP-based infrastructure so code runs on Cloudflare, Vercel, Netlify, AWS Lambda without adapters.

### 3.1 The 3 Pillars
| Pillar | Current State | Universal Solution |
| :--- | :--- | :--- |
| **Web Server** | Hono | ✅ Already Universal |
| **Database** | `postgres` (TCP), `fs` (SQLite) | ⚠️ Swap to HTTP Drivers |
| **Storage** | None | ⚠️ Add S3-compatible client |

### 3.2 Universal HTTP Drivers
| Type | Provider | Package |
| :--- | :--- | :--- |
| **Postgres** | Neon | `@neondatabase/serverless` |
| **MySQL** | PlanetScale | `@planetscale/database` |
| **SQLite** | Turso | `@libsql/client` |
| **Redis/Queue** | Upstash | `@upstash/redis`, `@upstash/qstash` |

### 3.3 Implementation: Refactor `db/index.ts`
```typescript
// services/actions/src/db/index.ts (Universal)
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

### 3.4 Storage: `s3-lite-client`
| Feature | Detail |
| :--- | :--- |
| **Package** | `s3-lite-client` |
| **Why?** | Lightweight, zero-dependency, works on Edge. |
| **Compatible With** | AWS S3, Cloudflare R2, MinIO, Supabase Storage |

---

## 4. Hono Middleware & Helpers Adoption

### 4.1 Global Middleware Stack
Apply in `src/index.ts`:

```typescript
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { logger } from 'hono/logger';
import { timeout } from 'hono/timeout';
import { bodyLimit } from 'hono/body-limit';

app.use('*', requestId());
app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', compress());
app.use('*', timeout(29000)); // Cloudflare limit
app.use('*', bodyLimit({ maxSize: 1024 * 1024 })); // 1MB
app.use('/api/*', cors());
```

### 4.2 Feature Adoption Matrix (Scored)

**Helpers & Utilities**
| Module | Score | Use Case |
| :--- | :--- | :--- |
| `factory` | 5/5 | Use `createFactory` to structure handlers with type safety. |
| `websocket` | 5/5 | Real-time streaming of Workflow Execution Logs to Builder UI. |
| `html` | 4/5 | SSR page shell (`<head>`, meta tags). |
| `cookie` | 4/5 | Read `sb-access-token` for SSR auth. |
| `jwt` (Helper) | 3/5 | Generate temporary tokens (e.g., signed URLs). |

**Authentication & Security**
| Module | Score | Use Case |
| :--- | :--- | :--- |
| `cors` | 5/5 | Mandatory. Frontend-to-Edge communication. |
| `jwt` (Auth) | 5/5 | Mandatory. Verify Supabase JWT in Authorization header. |
| `csrf` | 4/5 | Protect SSR forms from cross-site posting. |
| `bearer-auth` | 4/5 | API Keys for external developers triggering workflows. |
| `ip-restriction` | 3/5 | Limit webhook access to known IPs (e.g., GitHub). |
| `jwk` | 3/5 | Advanced JWT verification (Auth0, Cognito). |

**Performance & Core**
| Module | Score | Use Case |
| :--- | :--- | :--- |
| `context-storage` | 5/5 | Critical. Per-request DB connection/user context (`AsyncLocalStorage`). |
| `request-id` | 5/5 | Mandatory. Correlate logs in Axiom/Sentry. |
| `cache` | 5/5 | Edge caching for public pages/static assets. |
| `jsx-renderer` | 5/5 | Critical. SSR engine for published pages. |
| `combine` | 3/5 | Group complex middleware chains. |

**Streaming & RPC**
| Module | Score | Use Case |
| :--- | :--- | :--- |
| `streaming` | 5/5 | Long-running AI actions, avoid Worker timeouts. |
| `hono/client` | 5/5 | Core Connector. Type-safe React-to-Hono communication. |

---

## 5. SSR Implementation

### 5.1 Pattern
```typescript
import { renderToString } from 'hono/jsx/dom'; // or react-dom/server
import { jsxRenderer } from 'hono/jsx-renderer';

app.use('/p/*', jsxRenderer());

app.get('/p/:slug', async (c) => {
  const page = await db.query.pages.findFirst({
    where: eq(pages.slug, c.req.param('slug'))
  });
  
  const html = renderToString(<PageRenderer schema={page.layout} />);
  return c.html(html);
});
```

### 5.2 Streaming SSR
```typescript
import { streamText } from 'hono/streaming';

app.get('/ai-response', (c) => {
  return streamText(c, async (stream) => {
    await stream.writeln('Thinking...');
    // AI logic here
    await stream.writeln('Done!');
  });
});
```

---

## 6. Observability

| Concern | Tool | Implementation |
| :--- | :--- | :--- |
| **Logs** | Axiom | HTTP-first. Simple `fetch()` to ingest. |
| **Tracing** | OpenTelemetry | OTLP/HTTP exporter. |
| **Errors** | Sentry | REST API integration. |

> [!TIP]
> Start with Axiom only for logs. Add Sentry when error alerting is needed.

---

## 7. Checklist

| Requirement | Status |
| :--- | :--- |
| FastAPI handles design/dev? | ✅ |
| Hono handles published pages? | ✅ |
| Hono handles actions/automations? | ✅ |
| Runs locally? | ✅ (`@hono/node-server`) |
| Runs on any Edge provider? | ⚠️ (After DB driver swap) |
| Pydantic→Zod contract? | ✅ |
| No FastAPI changes? | ✅ |
| SSR Ready? | ⚠️ (Implement `jsx-renderer`) |
| WebSocket Ready? | ⚠️ (Implement for logs) |
