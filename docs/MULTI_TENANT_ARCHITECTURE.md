# Multi-Tenant Architecture for Frontbase

## Overview

This document describes the multi-tenant deployment strategy for Frontbase, enabling multiple tenant instances to run side-by-side on a single VPS with automatic port allocation and service isolation.

## Problem Statement

Current limitation: Port conflicts when deploying multiple instances on the same VPS.
```
Error: Bind for 0.0.0.0:8000 failed: port is already allocated
```

## Solution Architecture

### 1. Docker Compose Project Isolation

Each tenant deployment uses a unique **Docker Compose project name**, which automatically creates:
- Unique container names (`tenant1_frontbase-backend-1`)
- Unique network names (`tenant1_frontbase_frontbase`)
- Unique volume names (`tenant1_frontbase_backend_data`)

### 2. Port Configuration Strategy

#### Option A: Environment Variable Override (Recommended)

Each tenant gets custom ports via environment variables:

```yaml
# docker-compose.yml
services:
  backend:
    ports:
      - "${BACKEND_PORT:-8000}:8000"
    environment:
      - BACKEND_PORT=${BACKEND_PORT:-8000}
  
  edge:
    ports:
      - "${EDGE_PORT:-3002}:3002"
    environment:
      - PORT=${EDGE_PORT:-3002}
  
  frontend:
    ports:
      - "${FRONTEND_PORT:-8080}:80"
    environment:
      - VITE_API_URL=http://localhost:${BACKEND_PORT:-8000}
```

#### Option B: Auto-Discovery Port Allocation

Use a simple port allocation script that assigns ports sequentially:

```bash
#!/bin/bash
# allocate_ports.sh
BACKEND_PORT=$((8000 + $TENANT_ID))
EDGE_PORT=$((3002 + $TENANT_ID))
FRONTEND_PORT=$((8080 + $TENANT_ID))
```

#### Option C: Smart Port Allocation (Recommended for Multi-Tenant)

Automatically scan for available ports and deploy with automatic retry logic:

```bash
#!/bin/bash
# deploy_tenant.sh
./scripts/deploy_tenant.sh tenant1
```

The script will:
1. Scan for available ports in configurable ranges
2. Allocate unique ports for each service
3. Retry deployment if ports are already in use
4. Generate secure passwords automatically

### 3. Port Ranges

Each service type has a configurable port range:

| Service | Port Range | Default Ports |
|---------|------------|---------------|
| Backend | 8000-8999 | 8000+ |
| Edge Engine | 3002-3999 | 3002+ |
| Frontend | 8080-8999 | 8080+ |
| Redis HTTP | 8079-8999 | 8079+ |

### 4. Multi-Tenant Deployment Template

```bash
# Tenant 1
export TENANT_ID=1
export TENANT_NAME=tenant1
export BACKEND_PORT=8001
export EDGE_PORT=3003
export FRONTEND_PORT=8081
docker-compose -p tenant1_frontbase -f docker-compose.yml up -d

# Tenant 2
export TENANT_ID=2
export TENANT_NAME=tenant2
export BACKEND_PORT=8002
export EDGE_PORT=3004
export FRONTEND_PORT=8082
docker-compose -p tenant2_frontbase -f docker-compose.yml up -d
```

### 4. Service Discovery Architecture

Each tenant's services communicate via Docker internal network:

```
tenant1_frontbase (network)
├── tenant1_frontbase-backend-1 (port 8001)
├── tenant1_frontbase-edge-1 (port 3003)
├── tenant1_frontbase-frontend-1 (port 8081)
└── tenant1_frontbase-redis-1

tenant2_frontbase (network)
├── tenant2_frontbase-backend-1 (port 8002)
├── tenant2_frontbase-edge-1 (port 3004)
├── tenant2_frontbase-frontend-1 (port 8082)
└── tenant2_frontbase-redis-1
```

### 5. Data Isolation

Each tenant gets isolated volumes:

| Volume | Tenant 1 | Tenant 2 |
|--------|----------|----------|
| `tenant1_frontbase_backend_data` | Backend SQLite/PostgreSQL | - |
| `tenant1_frontbase_edge_data` | Edge engine data | - |
| `tenant1_frontbase_redis_data` | Redis cache | - |
| `tenant2_frontbase_backend_data` | - | Backend SQLite/PostgreSQL |
| `tenant2_frontbase_edge_data` | - | Edge engine data |
| `tenant2_frontbase_redis_data` | - | Redis cache |

## Port Allocation Matrix

| Tenant ID | Backend Port | Edge Port | Frontend Port | Notes |
|-----------|--------------|-----------|---------------|-------|
| 1 | 8001 | 3003 | 8081 | Default + offset |
| 2 | 8002 | 3004 | 8082 | Default + offset |
| 3 | 8003 | 3005 | 8083 | Default + offset |
| N | 8000+N | 3002+N | 8080+N | Sequential |

## Implementation

### Step 1: Update docker-compose.yml

Add configurable ports and environment variables:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./fastapi-backend
      dockerfile: Dockerfile
    ports:
      - "${BACKEND_PORT:-8000}:8000"
    environment:
      - BACKEND_PORT=${BACKEND_PORT:-8000}
      - DATABASE_URL=${DATABASE_URL:-sqlite+aiosqlite:////app/data/frontbase.db}
      # Internal service URLs
      - EDGE_URL=http://edge:3002
      - FASTAPI_URL=http://backend:8000
    volumes:
      - backend_data:/app/data
    depends_on:
      postgres:
        condition: service_healthy
        required: false

  edge:
    build:
      context: ./services/edge
      dockerfile: Dockerfile
    expose:
      - "3002"
    environment:
      - EDGE_PORT=${EDGE_PORT:-3002}
      - PORT=${EDGE_PORT:-3002}
      - DATABASE_URL=file:/app/data/edge.db
      - PAGES_DB_URL=file:/app/data/pages.db
      - FASTAPI_URL=http://backend:8000
    volumes:
      - edge_data:/app/data
    depends_on:
      backend:
        condition: service_healthy

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
      args:
        - VITE_API_URL=http://localhost:${BACKEND_PORT:-8000}
    ports:
      - "${FRONTEND_PORT:-8080}:80"
    environment:
      - FRONTEND_PORT=${FRONTEND_PORT:-8080}
    depends_on:
      - backend
      - edge

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: frontbase
      POSTGRES_PASSWORD: ${DB_PASSWORD:-frontbase-dev-password}
      POSTGRES_DB: frontbase
    volumes:
      - postgres_data:/var/lib/postgresql/data
    profiles:
      - postgres

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  redis-http:
    image: hiett/serverless-redis-http:latest
    environment:
      SRH_MODE: env
      SRH_TOKEN: ${REDIS_TOKEN:-dev_token}
      SRH_CONNECTION_STRING: "redis://redis:6379"
    ports:
      - "${REDIS_HTTP_PORT:-8079}:80"

volumes:
  postgres_data:
  backend_data:
  edge_data:
  redis_data:
```

### Step 2: Create Deployment Script

```bash
#!/bin/bash
# deploy_tenant.sh

set -e

# Configuration
TENANT_ID=${TENANT_ID:-$1}
TENANT_NAME=${TENANT_NAME:-$2}
DB_PASSWORD=${DB_PASSWORD:-$(openssl rand -base64 16)}
REDIS_TOKEN=${REDIS_TOKEN:-$(openssl rand -base64 16)}

# Port allocation (sequential)
BACKEND_PORT=$((8000 + TENANT_ID))
EDGE_PORT=$((3002 + TENANT_ID))
FRONTEND_PORT=$((8080 + TENANT_ID))
REDIS_HTTP_PORT=$((8079 + TENANT_ID))

# Docker Compose project name
COMPOSE_PROJECT_NAME="${TENANT_NAME}_frontbase"

# Environment file
ENV_FILE=".env.${TENANT_NAME}"

# Create environment file
cat > ${ENV_FILE} << EOF
TENANT_ID=${TENANT_ID}
TENANT_NAME=${TENANT_NAME}
BACKEND_PORT=${BACKEND_PORT}
EDGE_PORT=${EDGE_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
REDIS_HTTP_PORT=${REDIS_HTTP_PORT}
DATABASE_URL=sqlite+aiosqlite:////app/data/frontbase.db
DB_PASSWORD=${DB_PASSWORD}
REDIS_TOKEN=${REDIS_TOKEN}
EOF

echo "Deploying tenant: ${TENANT_NAME}"
echo "Backend port: ${BACKEND_PORT}"
echo "Edge port: ${EDGE_PORT}"
echo "Frontend port: ${FRONTEND_PORT}"

# Deploy
docker-compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml \
  --env-file ${ENV_FILE} \
  up -d

echo "Tenant deployed successfully!"
echo "Environment file: ${ENV_FILE}"
```

### Step 3: Create Cleanup Script

```bash
#!/bin/bash
# cleanup_tenant.sh

TENANT_NAME=${TENANT_NAME:-$1}
COMPOSE_PROJECT_NAME="${TENANT_NAME}_frontbase"

echo "Stopping and removing tenant: ${TENANT_NAME}"
docker-compose -p ${COMPOSE_PROJECT_NAME} -f docker-compose.yml down -v
```

## Usage Examples

### Deploy Tenant 1 (Smart Port Allocation)

```bash
./scripts/deploy_tenant.sh tenant1
```

**Output:**
```
========================================
  Port Scanner for Multi-Tenant
========================================

Scanning for available backend port in range 8000-8999...
✓ Available port found: 8001
Scanning for available edge port in range 3002-3999...
✓ Available port found: 3003
Scanning for available frontend port in range 8080-8999...
✓ Available port found: 8081
Scanning for available redis-http port in range 8079-8999...
✓ Available port found: 8080

========================================
  Port Allocation Summary
========================================

BACKEND: 8001
EDGE: 3003
FRONTEND: 8081
REDIS HTTP: 8080

========================================
  Frontbase Tenant Deployment
========================================

Tenant Name:    tenant1
Project Name:   tenant1_frontbase
Max Retries:    3

Scanning for available ports...

========================================
  Port Allocation Summary
========================================

Backend:      8001
Edge Engine:  3003
Frontend:     8081
Redis HTTP:   8080

========================================
  ✓ Deployment Successful!
========================================

Access URLs:
  Frontend:  http://localhost:8081
  Backend:   http://localhost:8001
  Edge:      http://localhost:3003
```

### Deploy Tenant 2 (Different Name)

```bash
./scripts/deploy_tenant.sh tenant2
```

**Note:** No TENANT_ID needed! The script automatically finds available ports.

### Deploy with Custom Options

```bash
# Custom database type
./scripts/deploy_tenant.sh mytenant --database postgres

# Custom password
./scripts/deploy_tenant.sh mytenant --db-password mysecret

# Custom max retries
./scripts/deploy_tenant.sh mytenant --max-retries 5
```

### Deploy with Existing Port

```bash
# If ports are already in use, the script will retry automatically
./scripts/deploy_tenant.sh mytenant
# It will scan again and find the next available ports
```

### List All Tenants

```bash
docker ps --filter "label=com.docker.compose.project" --format "table {{.Names}}\t{{.Ports}}"
```

### Access Tenant Frontend

- Tenant 1: http://your-vps:8081
- Tenant 2: http://your-vps:8082
- Tenant N: http://your-vps:8080+N

### Access Tenant Backend API

- Tenant 1: http://your-vps:8001
- Tenant 2: http://your-vps:8002
- Tenant N: http://your-vps:8000+N

## PostgreSQL Multi-Tenant Configuration

For production with PostgreSQL, each tenant needs a separate database:

```bash
# Update docker-compose.yml for postgres profile
postgres:
  environment:
    POSTGRES_USER: frontbase
    POSTGRES_PASSWORD: ${DB_PASSWORD}
    POSTGRES_DB: frontbase_${TENANT_ID}  # Unique DB per tenant
```

## Nginx Reverse Proxy Configuration

For external access, use Nginx as a reverse proxy:

```nginx
# /etc/nginx/sites-available/tenant1
server {
    listen 8081;
    server_name tenant1.yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Smart Port Allocation

### How It Works

The smart port allocation system automatically scans for available ports and deploys with retry logic:

1. **Port Scanning**: Each service scans its configured port range for availability
2. **Automatic Retry**: If ports are in use, the script retries up to `--max-retries` times
3. **Secure Passwords**: Auto-generates strong passwords for databases and Redis tokens
4. **Environment Files**: Creates isolated `.env.{tenant_name}` files for each deployment

### Port Ranges

| Service | Port Range | Description |
|---------|------------|-------------|
| Backend | 8000-8999 | API server |
| Edge Engine | 3002-3999 | SSR & workflows |
| Frontend | 8080-8999 | Nginx web server |
| Redis HTTP | 8079-8999 | Upstash-compatible proxy |

### Retry Logic

If a port is already in use, the script:
1. Scans for the next available port in the range
2. Retries deployment with the new ports
3. Continues until successful or max retries reached

### Example: Port Conflict Resolution

```bash
# Scenario: Port 8080 is already in use
./scripts/deploy_tenant.sh tenant1

# Output:
# Scanning for available redis-http port in range 8079-8999...
# ✓ Available port found: 8081  <-- Uses 8081 instead of 8080
# ...
# ✓ Deployment Successful!
```

### Customization

**Modify port ranges** in `scripts/deploy_tenant.sh`:

```bash
PORT_RANGES=(
    ["backend"]="8000:8999"
    ["edge"]="3002:3999"
    ["frontend"]="8080:8999"
    ["redis-http"]="8079:8999"
)
```

**Increase retry attempts**:

```bash
./scripts/deploy_tenant.sh tenant1 --max-retries 10
```

## Security Considerations

1. **Database Isolation**: Each tenant gets unique database and volumes
2. **API Keys**: Generate unique API keys per tenant
3. **Environment Variables**: Never commit `.env` files to version control
4. **Network Isolation**: Each tenant has its own Docker network
5. **Port Randomization**: Use strong random passwords for Redis tokens

## Monitoring

### Check Tenant Status

```bash
docker-compose -p tenant1_frontbase -f docker-compose.yml ps
```

### View Tenant Logs

```bash
docker-compose -p tenant1_frontbase -f docker-compose.yml logs -f backend
```

### Restart Tenant

```bash
docker-compose -p tenant1_frontbase -f docker-compose.yml restart
```

## Troubleshooting

### Port Already Allocated

The smart deployment script handles this automatically:

```bash
# Old way (manual)
lsof -i :8001
# Kill process or use different port

# New way (automatic)
./scripts/deploy_tenant.sh tenant1
# Script finds next available port automatically
```

### Deployment Fails After Max Retries

```bash
# Check what's using the ports
netstat -an | grep LISTEN

# Clean up existing tenants
./scripts/cleanup_tenant.sh tenant1

# Redeploy
./scripts/deploy_tenant.sh tenant1
```

### Check All Running Projects

```bash
docker compose ls
```

### Remove All Tenant Data (Careful!)

```bash
# List all volumes
docker volume ls --filter "label=com.docker.compose.project"

# Remove specific tenant volumes
docker volume rm tenant1_frontbase_backend_data
```

## Future Enhancements

1. **Docker Swarm**: For horizontal scaling across multiple VPS nodes
2. **Kubernetes**: For production-grade multi-tenant orchestration
3. **Service Mesh**: For advanced traffic management and security
4. **Load Balancing**: For distributing traffic across multiple instances
5. **Auto-scaling**: Based on tenant request metrics
6. **Port Reservation API**: REST API to reserve/allocate ports before deployment
7. **Port Management Dashboard**: Web UI for managing tenant deployments
