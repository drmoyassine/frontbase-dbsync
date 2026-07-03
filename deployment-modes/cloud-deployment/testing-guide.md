# Frontbase Cloud Deployment — Testing Guide

> Post-deploy verification playbook for the supported cloud deployment scenarios.
> Run the relevant section on your host(s) after each deployment.
>
> Note: the earlier "Cloud BYOE (Turso + Upstash)" and "Standalone Edge Node"
> scenarios have been removed — those modes (`PUBLISH_STRATEGY`, `FRONTBASE_ENV`,
> `docker-compose.standalone-edge.yml`) are no longer in the codebase.

---

## Table of Contents

1. [Scenario 1: Standard Cloud (single machine)](#scenario-1-standard-cloud-single-machine)
2. [Scenario 2: Distributed Multi-Machine](#scenario-2-distributed-multi-machine)
3. [Cross-Cutting Tests](#cross-cutting-tests)
4. [Troubleshooting](#troubleshooting)

---

## Scenario 1: Standard Cloud (single machine)

> All services on one Docker host via
> [`standard-cloud-deployment/docker-compose.cloud.yml`](standard-cloud-deployment/docker-compose.cloud.yml).

### 1.1 — Deploy

```bash
cd docs/cloud-deployment/standard-cloud-deployment
cp .env.cloud.example .env
# Edit .env: set SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, FRONTEND_URL, BACKEND_URL
docker compose -f docker-compose.cloud.yml --env-file .env up -d --build
```

> The commands below use `docker compose -f docker-compose.cloud.yml exec <svc> …`,
> which is independent of the generated container names. Run them from the same
> directory you deployed from.

### 1.2 — Health Checks

```bash
# Backend
curl -sf http://YOUR_HOST/health
# Expected: {"status":"healthy","message":"API is operational","test_mode":true}

# Edge Engine
docker compose -f docker-compose.cloud.yml exec edge wget -qO- http://127.0.0.1:3002/api/health
# Expected: JSON with status "healthy"

# Frontend (nginx)
curl -sf http://YOUR_HOST/nginx-health
# Expected: ok
```

### 1.3 — Environment Variable Verification

```bash
# Backend is in cloud mode and knows where Edge is
docker compose -f docker-compose.cloud.yml exec backend printenv DEPLOYMENT_MODE
# Expected: cloud
docker compose -f docker-compose.cloud.yml exec backend printenv EDGE_URL
# Expected: http://edge:3002

# Edge is in cloud mode and reaches the backend on the internal network
docker compose -f docker-compose.cloud.yml exec edge printenv FRONTBASE_DEPLOYMENT_MODE
# Expected: cloud
docker compose -f docker-compose.cloud.yml exec edge printenv BACKEND_URL
# Expected: http://backend:8000
```

### 1.4 — Publish Flow Test

Publishing is now engine-scoped. The simplest path is via the Admin UI
(`http://YOUR_HOST/admin`): create a page, then publish it to an Edge engine.
To drive it from the CLI instead, first list engines to get an `ENGINE_ID`,
then publish:

```bash
# 1. Log in and save the token from the response
curl -X POST http://YOUR_HOST/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"your-password"}'

# 2. Publish the page to a specific engine
curl -X POST http://YOUR_HOST/api/pages/PAGE_ID/publish/ENGINE_ID/ \
  -H "Authorization: Bearer TOKEN"
# Expected: {"success":true, ...}

# 3. Verify SSR rendering of the published page
curl -s http://YOUR_HOST/SLUG | head -20
# Expected: HTML with the page content

# 4. Verify the page landed in Edge storage
docker compose -f docker-compose.cloud.yml exec edge \
  wget -qO- http://127.0.0.1:3002/api/data/pages
# Expected: JSON array containing the published page
```

### 1.5 — Cache Test

```bash
# Redis (control-plane cache, runs under the redis/dragonfly profile)
docker compose -f docker-compose.cloud.yml --profile redis exec redis redis-cli ping
# Expected: PONG
```

### 1.6 — Admin Panel Test

```bash
# Verify the SPA shell loads
curl -s http://YOUR_HOST/admin | head -5
# Expected: <!DOCTYPE html> ... (Frontbase admin SPA)
```

---

## Scenario 2: Distributed Multi-Machine

> Services split across the four tiers. See
> [`distributed-cloud-deployment/distributed_deployment_guide.md`](distributed-cloud-deployment/distributed_deployment_guide.md)
> for full setup.

### 2.1 — Prepare env files (once, per machine)

```bash
cd docs/cloud-deployment/distributed-cloud-deployment
cp .env.data-tier.example   .env.data-tier      # Machine B — set DB_PASSWORD
cp .env.api-tier.example    .env.api-tier       # Machine A — set MACHINE_B_IP/C_IP + SaaS keys
cp .env.edge-tier.example   .env.edge-tier      # Machine C — set FRONTBASE_SYSTEM_KEY
cp .env.static-tier.example .env.static-tier    # Machine D — set MACHINE_A_IP/C_IP
```

### 2.2 — Boot per tier (in dependency order)

```bash
# Machine B (Data):
docker compose -f docker-compose.data-tier.yml   --env-file .env.data-tier   up -d

# Machine A (API):
docker compose -f docker-compose.api-tier.yml    --env-file .env.api-tier    up -d --build

# Machine C (Edge) — uses the repo-root unified edge file:
docker compose -f ../../../docker-compose.edge.yml --env-file .env.edge-tier up -d --build

# Machine D (Static):
docker compose -f docker-compose.static-tier.yml --env-file .env.static-tier up -d --build
```

### 2.3 — Verify Cross-Machine Connectivity

```bash
# From Machine A (API), Edge on Machine C is reachable
curl -sf http://MACHINE_C_IP:3002/api/health
# Expected: JSON with status "healthy"

# From Machine C (Edge), Backend on Machine A is reachable
curl -sf http://MACHINE_A_IP:8000/health
# Expected: {"status":"healthy","message":"API is operational",...}

# Through the Machine D reverse proxy
curl -sf http://MACHINE_D_IP/health           # → Backend
curl -sf http://MACHINE_D_IP/api/data/pages   # → Edge
curl -sf http://MACHINE_D_IP/nginx-health     # → Nginx itself
```

### 2.4 — Publish Across Machines

Publish from the backend (Machine A); the page should be served by Edge
(Machine C) and reachable through the static proxy (Machine D):

```bash
# Publish via backend (Machine A) → reaches Edge (Machine C)
curl -X POST http://MACHINE_A_IP:8000/api/pages/PAGE_ID/publish/ENGINE_ID/ \
  -H "Authorization: Bearer TOKEN"
# Expected: {"success":true, ...}

# Verify SSR through the public entry point (Machine D)
curl -s http://MACHINE_D_IP/SLUG | head -20
# Expected: SSR HTML
```

---

## Cross-Cutting Tests

### Edge → Backend Startup Sync

```bash
# Edge fetches state from the backend on boot (if BACKEND_URL is reachable)
docker compose -f docker-compose.cloud.yml logs edge 2>&1 | grep -i "sync"
# Expected: lines showing startup sync activity (absent if Edge ran standalone)
```

### SEO / SSR Quality

```bash
# SSR output should include proper <head> tags
curl -s http://YOUR_HOST/ | grep -E "<title>|<meta|<link.*favicon"
# Expected: title, meta description, favicon link
```

---

## Troubleshooting

### A container won't start

```bash
# Tail the failing service's logs
docker compose -f docker-compose.cloud.yml logs <service_name> --tail=50

# Check for port conflicts
netstat -tlnp | grep -E "8000|3002|80|6379"
```

### Backend can't reach Edge

```bash
docker compose -f docker-compose.cloud.yml exec backend printenv EDGE_URL
docker compose -f docker-compose.cloud.yml exec backend \
  wget -qO- http://edge:3002/api/health   # in-cluster name
```

### Edge can't reach Backend

```bash
docker compose -f docker-compose.cloud.yml exec edge printenv BACKEND_URL
docker compose -f docker-compose.cloud.yml exec edge \
  wget -qO- http://backend:8000/health
```

> In the distributed Static tier, if proxied routes 502, confirm the templated
> nginx config was expanded: the container should have a real
> `/etc/nginx/conf.d/default.conf` with resolved host:port upstreams (not
> `${BACKEND_HOST}` literals). If literals remain, `gettext`/envsubst did not run.

### Publish fails

```bash
docker compose -f docker-compose.cloud.yml logs backend 2>&1 \
  | grep -i "publish\|error" | tail -20
docker compose -f docker-compose.cloud.yml logs edge 2>&1 \
  | grep -i "import\|upsert\|error" | tail -20
```

### Reset state (nuclear option)

```bash
docker compose -f docker-compose.cloud.yml down -v   # WARNING: removes all volumes
docker compose -f docker-compose.cloud.yml --env-file .env up -d --build
```
