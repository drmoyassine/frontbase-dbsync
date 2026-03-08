# Unified Integrations Layer — Design Sketch

> **Status**: Design phase — implement in next session
> **Date**: 2026-03-08
> **Goal**: Connect each third-party service ONCE, auto-provision all derived resources

---

## Problem

The same service requires credentials in multiple places:

| Service | Connection 1 | Connection 2 | Connection 3 |
|---------|-------------|-------------|-------------|
| **Supabase** | Data Source (API URL, Anon Key, Service Role Key, DB conn string) | Edge Provider (Access Token, Project Ref) | — |
| **Upstash** | — | Edge Provider (API Token, Email) | Edge Cache (Redis URL, Token) + Edge Queue (QStash Token, Signing Keys) |
| **Cloudflare** | — | Edge Provider (API Token) | — |

User must visit 2–3 different dialogs with different fields for the same service.

---

## Key Insight: Minimal Credentials

Most fields can be **auto-derived** from a single management token:

### Supabase — Access Token is the master key
```
Access Token (sbp_...)
  ├── GET /v1/projects           → project list (pick from dropdown)
  ├── project_ref                → parsed from selection
  ├── api_url                    → https://{ref}.supabase.co
  ├── GET /v1/projects/{ref}/api-keys → anon_key + service_role_key
  └── DB connection string       → needs DB password (user must provide)
```

**User provides**: Access Token + selects project + (optional) DB password
**Frontbase derives**: project_ref, API URL, anon_key, service_role_key

### Upstash — API Key + Email is the master key
```
API Key + Email
  ├── GET /v2/redis/databases    → Redis instances (pick from dropdown)
  │   └── each has: endpoint, password, rest_token → EdgeCache
  ├── QStash is global per account
  │   └── GET /v2/qstash/tokens → current_signing_key, next_signing_key
  └── Edge Provider creds = same API key + email
```

**User provides**: API Key + Email + selects Redis DB
**Frontbase derives**: Redis URL/token, QStash tokens, signing keys

### Cloudflare — API Token is the master key
```
API Token
  ├── GET /client/v4/accounts    → account_id, account_name
  ├── GET /client/v4/accounts/{id}/workers/scripts → existing workers
  └── Edge Provider creds = same token
```

**User provides**: API Token
**Frontbase derives**: account_id, account_name

### Vercel — API Token is the master key
```
API Token
  ├── GET /v2/teams              → team list (auto-detect, dropdown if multiple)
  ├── GET /v9/projects            → project list
  └── personal accounts have no team (omit team_id)
```

**User provides**: API Token
**Frontbase derives**: team_id (or none for hobby accounts), project list

### Netlify — API Token is the master key
```
API Token (nfp_...)
  ├── GET /api/v1/sites           → site list (pick from dropdown)
  ├── GET /api/v1/accounts        → account info
  └── site_id = selected site
```

**User provides**: API Token
**Frontbase derives**: site_id (from dropdown), account info

### Deno Deploy — Organization Token is the master key (v2 API)
```
Organization Token (ddo_...)
  ├── GET /v2/apps                    → app list (token is org-scoped, no org_id needed)
  ├── POST /v2/apps                   → create new app
  ├── POST /v2/apps/{app}/deploy      → deploy revision
  ├── PATCH /v2/apps/{app}            → update env vars
  └── DELETE /v2/apps/{app}           → delete app
```

**User provides**: Organization Token (`ddo_...`)
**Frontbase derives**: app list (dropdown + create new)

> **API base**: `https://api.deno.com/v2` (NOT v1 Subhosting API)
> **OpenAPI spec**: `https://console.deno.com/api/v2/openapi.json`
> **URL format**: `https://{app-slug}.{org-slug}.deno.net` (NOT .deno.dev)
> **Token source**: Organization Settings in dashboard, NOT account access tokens

### Turso — API Token is the master key
```
API Token
  ├── GET /v1/organizations                      → org list (usually 1: personal)
  ├── GET /v1/organizations/{org}/databases       → DB list (dropdown)
  ├── POST /v1/organizations/{org}/databases      → create new DB (name, group, region)
  ├── POST /v1/.../databases/{name}/auth/tokens   → generate scoped auth token
  └── DB URL = libsql://{db-name}-{org}.turso.io
```

**User provides**: API Token + selects DB (or creates new)
**Frontbase derives**: org, DB URL (`libsql://...`), auth token

> Currently each Turso DB is connected separately in the Edge DB tab.
> Unified integration replaces this with: one token → auto-list all DBs → select/create → auto-provision EdgeDatabase.

---

## Architecture

### New: `service_accounts` table

```sql
CREATE TABLE service_accounts (
  id              TEXT PRIMARY KEY,
  provider        TEXT NOT NULL,       -- 'supabase', 'upstash', 'cloudflare', 'vercel', 'netlify', 'deno'
  name            TEXT NOT NULL,       -- 'My Supabase Project', auto-named on connect
  credentials     TEXT NOT NULL,       -- JSON, encrypted — master credentials
  derived_data    TEXT,                -- JSON — auto-fetched metadata (project list, account info)
  status          TEXT DEFAULT 'active', -- 'active', 'expired', 'error'
  last_verified   TEXT,                -- ISO timestamp of last successful health check
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
```

### Updated: existing tables get `service_account_id` FK

```sql
-- All optional, backward-compatible
ALTER TABLE edge_providers_accounts ADD COLUMN service_account_id TEXT REFERENCES service_accounts(id);
ALTER TABLE datasources            ADD COLUMN service_account_id TEXT REFERENCES service_accounts(id);
ALTER TABLE edge_caches            ADD COLUMN service_account_id TEXT REFERENCES service_accounts(id);
ALTER TABLE edge_queues            ADD COLUMN service_account_id TEXT REFERENCES service_accounts(id);
```

Existing standalone connections (without a service account) continue to work.

### Credential storage per provider

```json
// Supabase
{
  "access_token": "sbp_xxx",
  "project_ref": "abcdefghij",
  "db_password": "optional"
}

// Upstash
{
  "api_key": "xxx",
  "email": "user@example.com",
  "redis_db_id": "selected-db-uuid"
}

// Cloudflare
{
  "api_token": "xxx",
  "account_id": "auto-detected"
}
```

---

## Connect Flow (UX)

### Step 1: Settings → Integrations tab

New tab alongside existing Edge settings tabs. Shows connected services as cards:

```
┌─────────────────────────────────────────┐
│ 🔗 Connected Services                   │
│                                         │
│ [+ Connect Service]                     │
│                                         │
│ ┌─── Supabase: My Project ────────┐    │
│ │ ✓ Data Source    ✓ Edge Deploy   │    │
│ │ Last verified: 2 min ago         │    │
│ └──────────────────────────────────┘    │
│                                         │
│ ┌─── Cloudflare: Personal ────────┐    │
│ │ ✓ Edge Deploy                    │    │
│ │ Last verified: 5 min ago         │    │
│ └──────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Step 2: Connect dialog — smart multi-step

```
┌─────────────────────────────────────────┐
│  Connect Service                        │
│                                         │
│  Service:  [Supabase ▼]                 │
│                                         │
│  Access Token *                         │
│  [sbp_xxxxxxxxxxxxxxxxx          ]      │
│  ○ Generate at supabase.com/dashboard/  │
│    account/tokens                       │
│                                         │
│  [Fetch Projects →]                     │
│           ↓                             │
│  Project: [My App (abcdefghij)  ▼]      │
│  ✓ API keys auto-fetched                │
│                                         │
│  DB Password (optional)                 │
│  [••••••••••••                   ]      │
│  ○ Only needed for direct SQL queries   │
│                                         │
│       [Cancel]  [Test]  [Connect]       │
└─────────────────────────────────────────┘

### Resource Selection Pattern (all providers)

Whenever a provider manages infrastructure resources (Redis DBs, sites, projects),
the connect dialog shows a **"Select or Create"** pattern:

```
┌─────────────────────────────────────────┐
│  Redis Database                         │
│  ┌─────────────────────────────────┐    │
│  │  ● my-production-redis       ▼ │    │
│  │  ──────────────────────────── │    │
│  │    my-production-redis         │    │
│  │    staging-cache               │    │
│  │    dev-local                   │    │
│  │  ──────────────────────────── │    │
│  │  ＋ Create New Redis Database  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

This applies to:

| Provider | Resource | List API | Create API |
|----------|----------|----------|------------|
| **Supabase** | Project | `GET /v1/projects` | `POST /v1/projects` |
| **Upstash** | Redis DB | `GET /v2/redis/databases` | `POST /v2/redis/database` |
| **Upstash** | QStash | Global (1 per account) | Auto (no selection needed) |
| **Netlify** | Site | `GET /api/v1/sites` | `POST /api/v1/sites` |
| **Vercel** | Project | `GET /v9/projects` | `POST /v10/projects` |
| **Deno** | App | `GET /v2/apps` | `POST /v2/apps` |
| **Cloudflare** | Worker | Auto-created on deploy | — |
| **Turso** | Database | `GET /v1/organizations/{org}/databases` | `POST /v1/organizations/{org}/databases` |

**"Create New"** flow:
- User clicks "Create New" in dropdown
- Inline form expands: name + region (where applicable)
- Frontbase calls the provider's create API
- Newly created resource auto-selects in dropdown
- Continues connect flow
```

### Step 3: On "Connect" → auto-provision

Backend `POST /api/service-accounts` does:

1. Validate & store credentials
2. **Auto-create derived resources**:
   - Supabase → creates `datasources` row + `edge_providers_accounts` row
   - Upstash → creates `edge_caches` row + `edge_queues` row + `edge_providers_accounts` row
   - Cloudflare → creates `edge_providers_accounts` row (same as today, just linked)
3. Return the service account + list of provisioned resources

---

## Backend API

```
POST   /api/service-accounts                    — Connect new service
GET    /api/service-accounts                    — List all
GET    /api/service-accounts/{id}               — Get with provisioned resources
DELETE /api/service-accounts/{id}               — Disconnect (cascades to children)
POST   /api/service-accounts/{id}/verify        — Re-test connection
POST   /api/service-accounts/fetch-projects     — Given provider + token, return project list
```

### Auto-provision logic (per provider)

```python
# supabase
def provision_supabase(sa: ServiceAccount):
    creds = sa.credentials
    ref = creds["project_ref"]
    
    # Fetch API keys via Management API
    keys = supabase_mgmt.get_api_keys(creds["access_token"], ref)
    
    # Create Data Source
    create_datasource(
        name=sa.name,
        type="supabase",
        api_url=f"https://{ref}.supabase.co",
        anon_key=keys["anon"],
        service_role_key=keys["service_role"],
        db_connection=build_db_url(ref, creds.get("db_password")),
        service_account_id=sa.id,
    )
    
    # Create Edge Provider
    create_edge_provider(
        name=sa.name,
        provider="supabase",
        credentials={"access_token": creds["access_token"], "project_ref": ref},
        service_account_id=sa.id,
    )

# turso
def provision_turso(sa: ServiceAccount):
    creds = sa.credentials
    org = turso_api.get_default_org(creds["api_token"])
    db = creds["database"]  # selected or created
    auth_token = turso_api.create_token(creds["api_token"], org, db)
    
    # Create Edge Database
    create_edge_database(
        name=f"{sa.name}: {db}",
        provider="turso",
        db_url=f"libsql://{db}-{org}.turso.io",
        db_token=auth_token,
        service_account_id=sa.id,
    )
```

---

## Migration Path

### Phase 1: Add service_accounts table + FK columns (non-breaking)
- New migration: `service_accounts` table
- Add `service_account_id` nullable FK to 4 tables
- Existing connections keep working unchanged

### Phase 2: Build Integrations UI
- New `IntegrationsSection.tsx` component in Settings
- Smart connect dialog with provider-specific flows
- Auto-provision on connect

### Phase 3: Simplify existing dialogs
- "Add Data Source" dialog gets a "From Integration" option at top
- "Connect Edge Provider" shows linked integrations (disable duplicate creation)
- Deletion cascade: disconnect service → deletes all derived resources

### Phase 4 (future): Credential refresh & health monitoring
- Periodic token validation
- Auto-refresh for expiring tokens
- Status badges: healthy / warning / expired

---

## Provider Credential Matrix (final)

| Provider | User Provides | Frontbase Auto-Fetches | Resources Provisioned |
|----------|--------------|-------------------|----------------------|
| **Supabase** | Access Token, Project (dropdown or create), DB password (opt) | anon_key, service_role_key, project_ref, api_url | Data Source + Edge Provider |
| **Upstash** | API Key, Email, Redis DB (dropdown or create) | redis_url, redis_token, qstash_token, signing_keys | Edge Cache + Edge Queue + Edge Provider |
| **Cloudflare** | API Token | account_id, account_name | Edge Provider |
| **Vercel** | API Token | team_id (auto), project list | Edge Provider |
| **Netlify** | API Token, Site (dropdown or create) | site_id, account_name | Edge Provider |
| **Deno Deploy** | Organization Token (ddo_), App (dropdown or create) | app list | Edge Provider |
| **Turso** | API Token, Database (dropdown or create) | org, db_url, auth_token | Edge Database |

---

## Files to Create/Modify

### Backend
- `[NEW]  app/models/service_account.py` — ServiceAccount model
- `[NEW]  app/routers/service_accounts.py` — CRUD + provision endpoints
- `[NEW]  app/services/integrations/` — per-provider provisioning logic
  - `supabase_integration.py`
  - `upstash_integration.py`
  - `cloudflare_integration.py`
- `[MOD]  app/models/edge.py` — add `service_account_id` FK to 3 models
- `[MOD]  app/services/sync/models/datasource.py` — add `service_account_id` FK
- `[MOD]  main.py` — mount new router
- `[NEW]  alembic/versions/0029_add_service_accounts.py`

### Frontend
- `[NEW]  src/components/dashboard/settings/shared/IntegrationsSection.tsx`
- `[NEW]  src/hooks/useServiceAccounts.ts` — React Query hooks
- `[MOD]  src/components/dashboard/settings/SettingsPage.tsx` — add Integrations tab
- `[MOD]  EdgeProvidersSection.tsx` — show linked integration badge, prevent duplicates

---

## Open Questions

1. **Encryption**: Should `service_accounts.credentials` use the same encryption as `datasources.password_encrypted`? (Yes — same pattern, Fernet key from env)
2. **Cascade delete**: When disconnecting a service, delete the derived Data Source / Edge Provider? Or just unlink? (Recommend: soft-unlink first, hard-delete behind a "Remove all data" checkbox)
3. **Multiple projects**: Should one Supabase token be able to connect multiple projects (i.e. multiple service accounts from one token)? (Probably yes — each project = separate service account)

---

## Pipeline Audit — All Providers

> **Status**: TODO (next session)
> Each provider pipeline must be audited end-to-end against official API docs.

### Audit Checklist (per provider)

| # | Check | Description |
|---|-------|-------------|
| 1 | **Official API docs** | Read official docs/OpenAPI spec, confirm endpoint URLs, auth scheme, payload format |
| 2 | **test-connection** | Validate the provider's test-connection endpoint works against real API |
| 3 | **deploy** | Confirm deploy payload matches current API version (v1→v2 drift) |
| 4 | **env vars** | Confirm env var push mechanism matches API (flat dict vs structured array) |
| 5 | **delete** | Confirm remote resource deletion works |
| 6 | **URL format** | Confirm generated URL matches actual routable domain |
| 7 | **credential flow** | Confirm where credentials are read from (provider_credentials vs engine_config) |

### Provider Status

| Provider | Docs URL | API Version | Audited? | Notes |
|----------|----------|-------------|----------|-------|
| **Cloudflare** | `developers.cloudflare.com/api` | v4 | ❌ | Baseline — assumed working |
| **Supabase** | `supabase.com/docs/reference/api` | v1 mgmt | ❌ | |
| **Vercel** | `vercel.com/docs/rest-api` | v2-v13 | ❌ | Multiple API versions |
| **Netlify** | `docs.netlify.com/api` | v1 | ❌ | |
| **Deno Deploy** | `console.deno.com/api/v2/openapi.json` | **v2** | ⚠️ | Migrated from v1, needs live test |
| **Upstash** | `upstash.com/docs/devops/developer-api` | v2 | ❌ | |
| **Turso** | `docs.turso.tech/api-reference` | v1 | ❌ | Not yet implemented |

### Deno Deploy — Known Issues (fixed, needs test)

- [x] test-connection: switched to `GET /v2/apps` (was `/v1/organizations/{orgId}`)
- [x] deploy: switched to `POST /v2/apps/{app}/deploy` with `config.runtime` (was `/v1/projects/{name}/deployments` with `entryPointUrl`)
- [x] env vars: switched to `PATCH /v2/apps/{app}` with `env_vars` array (was `/v1/projects/{name}/env` with flat dict)
- [x] delete: switched to `DELETE /v2/apps/{app}` (was `/v1/projects/{name}`)
- [x] project_name: now read from `engine_config` not `provider_credentials`
- [x] Dockerfile: now copies all `tsup.*.ts` configs (was only cloudflare)
- [x] Edge build handler: now reads `provider` param (was hardcoded to cloudflare)
- [ ] URL format: currently `.deno.dev`, dashboard shows `.{orgSlug}.deno.net` — **NEEDS VERIFICATION**
- [ ] Live end-to-end deploy test with real org token
