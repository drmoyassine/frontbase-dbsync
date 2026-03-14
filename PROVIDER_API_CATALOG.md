# Edge Provider API Catalog

> **This file is the single source of truth for every external HTTP call Frontbase makes to edge providers.**
> Keep it updated whenever a new provider or operation is added.

---

## Overview

Every edge engine operation (deploy, delete, inspect, etc.) dispatches to provider-specific external APIs.
This catalog maps **each Frontbase operation → the external HTTP call(s) per provider**.

### Providers

| Provider | Base URL | Auth Header | Credential Keys |
|----------|----------|-------------|------------------|
| **Cloudflare** | `https://api.cloudflare.com/client/v4` | `Bearer {api_token}` | `api_token`, `account_id` |
| **Supabase** | `https://api.supabase.com/v1` | `Bearer {access_token}` | `access_token`, `project_ref` |
| **Deno Deploy** | `https://api.deno.com/v2` | `Bearer {access_token}` | `access_token` |
| **Vercel** | `https://api.vercel.com` | `Bearer {api_token}` | `api_token`, `team_id` (optional) |
| **Docker/Self-Hosted** | `{engine_url}` (dynamic) | None | Engine URL only |

### Engine Config Key (stored in `engine_config` JSON)

| Provider | Key | Example |
|----------|-----|---------|
| Cloudflare | `worker_name` | `"frontbase-edge"` |
| Supabase | `function_name` | `"extract-from-url"` |
| Deno | `project_name` | `"my-edge-app"` |
| Vercel | `project_name` | — |
| Netlify | `site_name` | — |

---

## 1. Deploy (Create or Update)

### Cloudflare
**File:** `services/cloudflare_api.py` → called from `services/engine_deploy.py`

| Step | Method | URL | Body | Notes |
|------|--------|-----|------|-------|
| Upload bundle | `PUT` | `/accounts/{account_id}/workers/scripts/{worker_name}` | Multipart: `metadata` (JSON) + `{filename}` (JS module) | `metadata` includes `main_module`, `compatibility_date`, `compatibility_flags`, optional `bindings` (e.g. AI) |
| Enable subdomain | `POST` | `/accounts/{account_id}/workers/scripts/{worker_name}/subdomain` | `{"enabled": true}` | Retries 3× with 2s delay |
| Get subdomain | `GET` | `/accounts/{account_id}/workers/subdomain` | — | Returns `{result: {subdomain: "..."}}` for URL construction |
| Set secrets | `PUT` | `/accounts/{account_id}/workers/scripts/{worker_name}/secrets` | `{"name": "KEY", "text": "val", "type": "secret_text"}` | Called per-secret sequentially |

### Supabase
**File:** `services/supabase_deploy_api.py`

| Step | Method | URL | Body | Notes |
|------|--------|-----|------|-------|
| Update function | `PATCH` | `/projects/{ref}/functions/{slug}` | `{"body": script, "verify_jwt": false}` | Tries update first |
| Create function | `POST` | `/projects/{ref}/functions` | `{"slug": name, "name": name, "body": script, "verify_jwt": false}` | Fallback if PATCH returns 404 |
| Set project secrets | `POST` | `/projects/{ref}/secrets` | `[{"name": "KEY", "value": "val"}, ...]` | Project-level (shared across all functions) |

### Deno Deploy
**File:** `services/deno_deploy_api.py`

| Step | Method | URL | Body | Notes |
|------|--------|-----|------|-------|
| Ensure app exists | `GET` | `/apps/{slug}` | — | Check if app exists |
| Create app | `POST` | `/apps` | `{"slug": name}` | If app doesn't exist; retries with `-{hex}` suffix on 409 |
| Deploy function | `POST` | `/apps/{slug}/deploy` | `{assets: {file: {kind, content, encoding}}, config: {runtime: {type, entrypoint}}, env_vars?: [...]}` | Env vars included inline |

### Docker / Self-Hosted
**File:** `services/engine_deploy.py`

| Step | Method | URL | Body | Notes |
|------|--------|-----|------|-------|
| Health check | `GET` | `{engine_url}/api/health` | — | Must return 200 |
| Push update | `POST` | `{engine_url}/api/update` | `{"script_content": js, "source_hash": hash, "version": "latest"}` | Engine writes to disk and restarts |
| Post-deploy health | `GET` | `{engine_url}/api/health` | — | 6 retries × 3s wait |

---

## 2. Redeploy

Same as Deploy — `engine_deploy.redeploy()` routes to the same provider-specific deployer.
Additionally calls:

| Step | Method | URL | Notes |
|------|--------|-----|-------|
| Flush cache | `POST` | `{engine_url}/api/cache/flush` | Only if `edge_cache_id` is set |

---

## 3. Reconfigure (Live Binding Update)

### Cloudflare (Settings PATCH — no redeploy needed)
**File:** `services/engine_reconfigure.py`

| Step | Method | URL | Body | Notes |
|------|--------|-----|------|-------|
| Get current settings | `GET` | `/accounts/{account_id}/workers/scripts/{worker_name}/settings` | — | Reads existing bindings to preserve non-Frontbase ones |
| Patch settings | `PATCH` | `/accounts/{account_id}/workers/scripts/{worker_name}/settings` | Multipart: `settings` JSON with merged bindings | Preserves non-Frontbase bindings |
| Delete stale secrets | `DELETE` | `/accounts/{account_id}/workers/scripts/{worker_name}/secrets/{name}` | — | Per removed binding |

### Other Providers (Supabase, Deno, etc.)
Triggers a full **redeploy** (Section 1) since these providers don't support live binding updates.

---

## 4. Test Connectivity

**File:** `services/engine_test.py`

| Provider | Method | URL | Notes |
|----------|--------|-----|-------|
| **All** | `GET` | `{engine_url}/api/health` | Provider-agnostic; measures latency |

---

## 5. Delete (Remote Resource)

**File:** `services/engine_test.py` → `delete_remote_resource()`

| Provider | Method | URL | Notes |
|----------|--------|-----|-------|
| **Cloudflare** | `DELETE` | `/accounts/{account_id}/workers/scripts/{worker_name}` | |
| **Supabase** | `DELETE` | `/projects/{ref}/functions/{slug}` | |
| **Vercel** | `DELETE` | `/v13/deployments/{id}?teamId={tid}` | Requires `deployment_id` in config |
| **Deno** | `DELETE` | `/apps/{slug}` | |
| **Netlify** | `DELETE` | `https://api.netlify.com/api/v1/sites/{site_id}` | |

---

## 6. List / Fetch Engines

**File:** `routers/edge_providers.py`

### Cloudflare
Uses `cloudflare_api.list_workers()` (sync `requests` lib for Windows compatibility):

| Step | Method | URL | Notes |
|------|--------|-----|-------|
| List scripts | `GET` | `/accounts/{account_id}/workers/scripts` | Returns `{result: [{id, modified_on, created_on}, ...]}` |
| Get subdomain | `GET` | `/accounts/{account_id}/workers/subdomain` | For URL construction |

### Supabase

| Method | URL | Response |
|--------|-----|----------|
| `GET` | `/projects/{ref}/functions` | `[{name, slug, created_at, updated_at}, ...]` — timestamps are epoch (ms/μs) |

### Deno Deploy

| Method | URL | Response | Notes |
|--------|-----|----------|-------|
| `GET` | `/apps?limit=30&cursor=...` | `[{slug, created_at, updated_at}, ...]` | Paginates via `Link` header; up to 5 pages |

### Vercel

| Method | URL | Response | Notes |
|--------|-----|----------|-------|
| `GET` | `/v10/projects?teamId={tid}&limit=50` | `{projects: [{name, id, framework, createdAt, updatedAt}]}` | Timestamps are epoch milliseconds |

---

## 7. Inspect (Source / Settings / Secrets)

**File:** `routers/engine_inspector.py`

### Source Code

| Provider | Method | URL | Response | Notes |
|----------|--------|-----|----------|-------|
| **Cloudflare** | `GET` | `/accounts/{account_id}/workers/scripts/{worker_name}` | JS source text | Readable source |
| **Supabase** | `GET` | `/projects/{ref}/functions/{slug}/body` | Compiled ESZIP bundle (binary) | ⚠️ Not readable — returns informational placeholder |
| **Vercel** | `GET` | `/v6/deployments/{id}/files` + `/v7/deployments/{id}/files/{fileId}` | File tree + content | Resolves latest deployment first |
| **Deno** | — | — | — | Not supported |

### Settings / Config

| Provider | Method | URL | Response Fields |
|----------|--------|-----|-----------------|
| **Cloudflare** | `GET` | `/accounts/{account_id}/workers/scripts/{worker_name}/settings` | `{bindings, routes, compatibility_date, compatibility_flags, ...}` |
| **Supabase** | `GET` | `/projects/{ref}/functions/{slug}` | `{verify_jwt, status, version, entrypoint_path, import_map, import_map_path}` |
| **Vercel** | `GET` | `/v9/projects/{name}?teamId={tid}` | `{framework, nodeVersion, buildCommand, installCommand, outputDirectory, rootDirectory, region}` |

### Secrets

| Provider | Method | URL | Response |
|----------|--------|-----|----------|
| **Cloudflare** | `GET` | `/accounts/{account_id}/workers/scripts/{worker_name}/settings` | Extracted from `bindings` where `type == "secret_text"` |
| **Supabase** | `GET` | `/projects/{ref}/secrets` | `[{name: "KEY"}, ...]` — project-level, names only |
| **Vercel** | `GET` | `/v10/projects/{name}/env?teamId={tid}` | `{envs: [{key, type, target}]}` — values hidden for `encrypted` type |

---

## 8. Logs

**File:** `services/edge_logs.py`

| Provider | Method | URL | Query Params | Notes |
|----------|--------|-----|--------------|-------|
| **Cloudflare** | `POST` | `https://api.cloudflare.com/client/v4/graphql` | GraphQL `workersInvocationsAdaptive` query | Invocation-level telemetry (status, colo, wall time) |
| **Supabase** | `GET` | `/projects/{ref}/analytics/endpoints/logs.all` | `?sql=SELECT ... FROM function_logs ...` | SQL query on analytics endpoint |
| **Deno** | `GET` | `/apps/{slug}/logs` | `?start={iso}&limit={n}&cursor=...&level=...` | Standard REST pagination |
| **Vercel** | `GET` | `/v3/deployments/{id}/events?teamId={tid}` | — | Build/runtime events; resolves latest deployment first |

### Log Retention (hours)

| Provider | Free | Paid |
|----------|------|------|
| Cloudflare | 72h (3d) | 720h (30d) |
| Supabase | 24h (1d) | 168h (7d) |
| Deno | 24h (1d) | 168h (7d) |
| Vercel | 1h | 24h (1d) |

---

## 9. Pre-Deploy Hooks

**File:** `services/engine_provisioner.py`

| Provider | Hook | External Calls | Purpose |
|----------|------|----------------|---------|
| **Cloudflare** | `_cf_pre_deploy` | `GET /accounts` (detect account_id), `GET /accounts/{id}/workers/subdomain` | Auto-detect account ID and build workers.dev URL |
| **Deno** | `_deno_pre_deploy` | `detect_org_subdomain()` → `GET /apps` + health probe | Detect org vs personal subdomain pattern |
| **Supabase** | None | — | URL is deterministic: `https://{ref}.supabase.co/functions/v1/{slug}` |

---

## 10. Credentials Schema

**File:** `core/security.py`

### Secret Keys (encrypted in DB)

| Provider | Keys |
|----------|------|
| Cloudflare | `api_token` |
| Supabase | `access_token`, `anon_key`, `service_role_key` |
| Deno | `access_token` |
| Vercel | `api_token` |

### Metadata Keys (plaintext for UI)

| Provider | Keys |
|----------|------|
| Cloudflare | `account_id` |
| Supabase | `project_ref`, `api_url` |
| Deno | `org_id` |
| Vercel | `team_id` |

---

## Implementation File Index

| File | Purpose |
|------|---------|
| `services/cloudflare_api.py` | CF Workers v4 API helpers |
| `services/supabase_deploy_api.py` | Supabase Management API deploy/secrets/delete |
| `services/deno_deploy_api.py` | Deno Deploy v2 API deploy/delete/env vars |
| `services/vercel_deploy_api.py` | Vercel REST API deploy/delete/env/list/inspect |
| `services/engine_deploy.py` | Provider-agnostic deploy router |
| `services/engine_test.py` | Health test + multi-provider remote delete |
| `services/engine_reconfigure.py` | Live CF settings PATCH + non-CF redeploy fallback |
| `services/engine_provisioner.py` | Per-provider pre-deploy hooks |
| `services/engine_serializer.py` | ORM → API dict (no external calls) |
| `services/engine_manifest.py` | Manifest sync (no external calls) |
| `services/provider_registry.py` | Labels, config keys, URL builders |
| `services/edge_logs.py` | Multi-provider log fetching + L1/L2 cache |
| `routers/engine_inspector.py` | Multi-provider inspect (source/settings/secrets) |
| `routers/edge_providers.py` | List engines from provider accounts |
| `core/security.py` | Credential encryption + provider schemas |
| `core/credential_resolver.py` | Unified credential resolution |
