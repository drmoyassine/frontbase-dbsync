# Frontbase Edge Architecture — Testing Guide

> Complete testing playbook for all deployment scenarios.
> Run these tests on your VPS after each deployment to verify everything works.

---

## Table of Contents

1. [Scenario 1: Self-Hosted (Default)](#scenario-1-self-hosted-default)
2. [Scenario 2: Cloud BYOE (Turso + Upstash)](#scenario-2-cloud-byoe)
3. [Scenario 3: Standalone Edge Node](#scenario-3-standalone-edge-node)
4. [Scenario 4: Distributed Multi-Machine](#scenario-4-distributed-multi-machine)
5. [Cross-Cutting Tests](#cross-cutting-tests)
6. [Troubleshooting](#troubleshooting)

---

## Scenario 1: Self-Hosted (Default)

> The standard single-machine deployment. All services on one Docker network.

### 1.1 — Deploy

```bash
cd /path/to/Frontbase-
cp .env.example .env
# Edit .env: set SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
docker-compose up -d --build
```

### 1.2 — Health Checks

```bash
# Backend
docker exec frontbase--backend-1 curl -sf http://127.0.0.1:8000/health
# Expected: {"status":"ok","service":"frontbase-backend"}

# Edge Engine
docker exec frontbase--edge-1 wget -qO- http://127.0.0.1:3002/api/health
# Expected: {"status":"healthy","message":"..."}

# Frontend (nginx)
docker exec frontbase--frontend-1 wget -qO- http://127.0.0.1:80/nginx-health
# Expected: ok
```

### 1.3 — Environment Variable Verification

```bash
# Verify new env vars are set with correct defaults
docker exec frontbase--edge-1 printenv FRONTBASE_ENV
# Expected: local

docker exec frontbase--edge-1 printenv FASTAPI_URL
# Expected: http://backend:8000

docker exec frontbase--backend-1 printenv PUBLISH_STRATEGY
# Expected: local

docker exec frontbase--backend-1 printenv EDGE_ENGINE_URL
# Expected: http://edge:3002
```

### 1.4 — Publish Flow Test

```bash
# 1. Login to admin panel
curl -X POST http://YOUR_VPS_IP/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@frontbase.dev","password":"your-password"}'
# Save the token from the response

# 2. Create a test page (from the admin UI at http://YOUR_VPS_IP/frontbase-admin)
# Or via API:
curl -X POST http://YOUR_VPS_IP/api/pages/ \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Page","slug":"test","title":"Test Page"}'

# 3. Publish the page
curl -X POST http://YOUR_VPS_IP/api/pages/PAGE_ID/publish/ \
  -H "Authorization: Bearer TOKEN"
# Expected: {"success":true,"message":"Page 'Test Page' published successfully","previewUrl":"/p/test"}

# 4. Verify SSR rendering
curl -s http://YOUR_VPS_IP/test | head -20
# Expected: HTML with the page content, <title>Test Page</title>

# 5. Verify page in Edge storage
docker exec frontbase--edge-1 wget -qO- http://127.0.0.1:3002/api/data/pages
# Expected: JSON array with the published page
```

### 1.5 — Redis Cache Test

```bash
# Check Redis connectivity
docker exec frontbase--redis-1 redis-cli ping
# Expected: PONG

# Check Redis HTTP (SRH)
curl -s http://YOUR_VPS_IP:8079/health
# Expected: 200 OK or similar
```

### 1.6 — Admin Panel Test

```bash
# Verify admin SPA loads
curl -s http://YOUR_VPS_IP/frontbase-admin | head -5
# Expected: HTML with <!DOCTYPE html> and frontbase admin SPA
```

---

## Scenario 2: Cloud BYOE

> Backend + Edge use Turso (state) and Upstash Redis (cache).

### 2.1 — Prerequisites

```bash
# Create Turso database
turso db create frontbase-edge-test
turso db shell frontbase-edge-test < services/edge/turso-schema.sql

# Get credentials
TURSO_URL=$(turso db show frontbase-edge-test --url)
TURSO_TOKEN=$(turso db tokens create frontbase-edge-test)
echo "TURSO_DB_URL=$TURSO_URL"
echo "TURSO_DB_TOKEN=$TURSO_TOKEN"

# Set up Upstash Redis at https://console.upstash.com
# Get UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN
```

### 2.2 — Deploy

```bash
# Set env vars
cat > .env << EOF
SECRET_KEY=your-secret-key
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your-password
TURSO_DB_URL=libsql://your-db.turso.io
TURSO_DB_TOKEN=your-turso-token
UPSTASH_REDIS_URL=https://your-redis.upstash.io
UPSTASH_REDIS_TOKEN=your-upstash-token
PUBLISH_STRATEGY=turso
EOF

docker-compose -f docker-compose.cloud.yml up -d --build
```

### 2.3 — Verify Cloud Config

```bash
# Edge should be in cloud mode
docker exec frontbase--edge-1 printenv FRONTBASE_ENV
# Expected: cloud

# Edge should have Turso URL
docker exec frontbase--edge-1 printenv FRONTBASE_STATE_DB_URL
# Expected: libsql://your-db.turso.io

# Backend should use turso publish strategy
docker exec frontbase--backend-1 printenv PUBLISH_STRATEGY
# Expected: turso
```

### 2.4 — Test Turso Connection

```bash
# Verify Turso DB is accessible from edge
docker exec frontbase--edge-1 node -e "
  const { createClient } = require('@libsql/client');
  const c = createClient({
    url: process.env.FRONTBASE_STATE_DB_URL,
    authToken: process.env.FRONTBASE_STATE_DB_TOKEN 
  });
  c.execute('SELECT count(*) as n FROM published_pages')
   .then(r => console.log('Turso OK:', JSON.stringify(r.rows)))
   .catch(e => console.error('Turso FAIL:', e.message));
"
# Expected: Turso OK: [{"n":0}]
```

### 2.5 — Test Turso Publish Flow

```bash
# 1. Publish a page through the API
curl -X POST http://YOUR_VPS_IP/api/pages/PAGE_ID/publish/ \
  -H "Authorization: Bearer TOKEN"
# Expected: {"success":true,...}

# 2. Verify the page is in Turso (not local SQLite)
turso db shell frontbase-edge-test "SELECT slug, name FROM published_pages"
# Expected: test | Test Page

# 3. Verify Edge reads from Turso
curl -s http://YOUR_VPS_IP/test | head -20
# Expected: SSR HTML from the page data in Turso
```

### 2.6 — Test Upstash Cache Invalidation

```bash
# Publish a page (triggers cache invalidation)
curl -X POST http://YOUR_VPS_IP/api/pages/PAGE_ID/publish/ \
  -H "Authorization: Bearer TOKEN"

# Check backend logs for cache invalidation
docker logs frontbase--backend-1 2>&1 | grep -i "cache"
# Expected: [PublishStrategy:turso] Cache invalidated: page:test
```

---

## Scenario 3: Standalone Edge Node

> Edge-only deployment — no backend, reads from Turso.

### 3.1 — Deploy

```bash
# Pre-requisite: Turso DB with pages published (from Scenario 2)
docker-compose -f docker-compose.standalone-edge.yml up -d --build
```

### 3.2 — Verify

```bash
# Health check
curl -s http://YOUR_VPS_IP:3002/api/health
# Expected: {"status":"healthy",...}

# Verify FRONTBASE_ENV=cloud
docker exec frontbase--edge-1 printenv FRONTBASE_ENV
# Expected: cloud

# Test SSR rendering (pages must be in Turso from Scenario 2)
curl -s http://YOUR_VPS_IP:3002/test | head -20
# Expected: SSR HTML from Turso data
```

### 3.3 — Verify No Backend Dependency

```bash
# The standalone edge should NOT try to connect to backend (no startup sync)
docker logs frontbase--edge-1 2>&1 | grep -i "fastapi\|backend"
# Expected: No connection errors (or graceful skip if FASTAPI_URL is unset)
```

---

## Scenario 4: Distributed Multi-Machine

> Services split across multiple machines.

### 4.1 — Setup

```bash
# Copy env file
cp docker-compose.distributed/.env.distributed.example .env.distributed

# Edit .env.distributed:
# Replace MACHINE_A_IP with your API server IP
# Replace MACHINE_B_IP with your DB server IP 
# Replace MACHINE_C_IP with your Edge server IP
```

### 4.2 — Deploy Per Machine

```bash
# Machine A (API):
docker-compose -f docker-compose.distributed/docker-compose.api-tier.yml \
  --env-file .env.distributed up -d --build

# Machine B (DB):
docker-compose -f docker-compose.distributed/docker-compose.data-tier.yml \
  --env-file .env.distributed up -d

# Machine C (Edge):
docker-compose -f docker-compose.distributed/docker-compose.edge-tier.yml \
  --env-file .env.distributed up -d --build

# Machine D (Static):
docker-compose -f docker-compose.distributed/docker-compose.static-tier.yml \
  --env-file .env.distributed up -d --build
```

### 4.3 — Verify Cross-Machine Connectivity

```bash
# From Machine A (API), check edge is reachable
curl -sf http://MACHINE_C_IP:3002/api/health
# Expected: {"status":"healthy",...}

# From Machine C (Edge), check backend is reachable
curl -sf http://MACHINE_A_IP:8000/health
# Expected: {"status":"ok",...}

# From Machine D (Static/nginx), check both are reachable through proxy
curl -sf http://MACHINE_D_IP/api/health        # → Backend
curl -sf http://MACHINE_D_IP/api/data/pages    # → Edge
curl -sf http://MACHINE_D_IP/nginx-health      # → Nginx
```

### 4.4 — Publish Across Machines

```bash
# Publish via backend (Machine A) → should reach edge (Machine C)
curl -X POST http://MACHINE_A_IP:8000/api/pages/PAGE_ID/publish/ \
  -H "Authorization: Bearer TOKEN"
# Expected: {"success":true,...}

# Verify page on edge (Machine C)
curl -s http://MACHINE_C_IP:3002/test | head -20
# Expected: SSR HTML
```

---

## Cross-Cutting Tests

### Publish Strategy Verification

```bash
# Check which strategy is active
docker logs frontbase--backend-1 2>&1 | grep "PublishStrategy"
# For local:  [PublishStrategy] Using: local
# For turso:  [PublishStrategy] Using: turso
```

### Storage Provider Verification

```bash
# Check which storage provider is active
docker logs frontbase--edge-1 2>&1 | grep -E "SqliteProvider|TursoProvider|stateProvider"
# For local: 📦 LocalSqliteProvider connected
# For cloud: ☁️ TursoHttpProvider connected
```

### Edge → Backend Startup Sync

```bash
# Verify startup sync works (edge fetches homepage from backend on boot)
docker logs frontbase--edge-1 2>&1 | grep -i "sync"
# Expected: Lines showing startup sync activity
```

### SEO / SSR Quality

```bash
# Verify SSR output includes proper <head> tags
curl -s http://YOUR_VPS_IP/ | grep -E "<title>|<meta|<link.*favicon"
# Expected: title, meta description, favicon link
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs <service_name> --tail=50

# Check if ports are in use
netstat -tlnp | grep -E "8000|3002|80|6379"
```

### Backend can't reach Edge

```bash
# Verify EDGE_ENGINE_URL
docker exec frontbase--backend-1 printenv EDGE_ENGINE_URL

# Test from backend container  
docker exec frontbase--backend-1 curl -sf http://edge:3002/api/health
```

### Edge can't reach Backend

```bash
# Verify FASTAPI_URL
docker exec frontbase--edge-1 printenv FASTAPI_URL

# Test from edge container
docker exec frontbase--edge-1 wget -qO- http://backend:8000/health
```

### Turso connection issues

```bash
# Verify env vars
docker exec frontbase--edge-1 printenv FRONTBASE_STATE_DB_URL
docker exec frontbase--edge-1 printenv FRONTBASE_STATE_DB_TOKEN

# Check if Turso URL is reachable
docker exec frontbase--edge-1 wget -qO- --timeout=5 \
  https://your-db.turso.io/health 2>&1
```

### Publish fails

```bash
# Check backend logs for strategy errors
docker logs frontbase--backend-1 2>&1 | grep -i "publish\|strategy\|error" | tail -20

# Check edge logs for import errors
docker logs frontbase--edge-1 2>&1 | grep -i "import\|upsert\|error" | tail -20
```

### Reset state (nuclear option)

```bash
docker-compose down -v   # WARNING: removes all data volumes
docker-compose up -d --build
```
