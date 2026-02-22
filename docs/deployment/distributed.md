# Distributed Deployment Guide

Deploy Frontbase services across multiple machines for high availability, scalability, and isolation.

## Architecture

```
Machine A (API)        Machine B (Data)       Machine C (Edge)       Machine D (Static)
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ Backend :8000   │   │ PostgreSQL :5432│   │ Edge :3002      │   │ Nginx :80       │
│ Redis   :6379   │   │                 │   │                 │   │ Admin SPA       │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │                     │
         ├─────────────────────┘                     │                     │
         │  DATABASE_URL                             │                     │
         ├───────────────────────────────────────────┘                     │
         │  EDGE_ENGINE_URL                  FASTAPI_URL                   │
         ├────────────────────────────────────────────────────────────────┘
         │  BACKEND_HOST / EDGE_HOST (nginx envsubst)
```

## Quick Start

### 1. Copy environment file

```bash
cp docker-compose.distributed/.env.distributed.example .env.distributed
```

### 2. Edit `.env.distributed`

Replace `MACHINE_*_IP` placeholders with actual IPs or hostnames:
- `MACHINE_A_IP` → API server address
- `MACHINE_B_IP` → Database server address
- `MACHINE_C_IP` → Edge server address

### 3. Deploy each tier

On **Machine A** (API):
```bash
docker-compose -f docker-compose.distributed/docker-compose.api-tier.yml \
  --env-file .env.distributed up -d
```

On **Machine B** (Database):
```bash
docker-compose -f docker-compose.distributed/docker-compose.data-tier.yml \
  --env-file .env.distributed up -d
```

On **Machine C** (Edge):
```bash
docker-compose -f docker-compose.distributed/docker-compose.edge-tier.yml \
  --env-file .env.distributed up -d
```

On **Machine D** (Static/CDN):
```bash
docker-compose -f docker-compose.distributed/docker-compose.static-tier.yml \
  --env-file .env.distributed up -d
```

## Env Var Reference

| Variable | Used By | Default | Description |
|---|---|---|---|
| `EDGE_ENGINE_URL` | Backend | `http://edge:3002` | Remote edge address |
| `FASTAPI_URL` | Edge | `http://backend:8000` | Remote backend address |
| `BACKEND_HOST` | Nginx | `backend` | Backend hostname for proxy_pass |
| `BACKEND_PORT` | Nginx | `8000` | Backend port for proxy_pass |
| `EDGE_HOST` | Nginx | `edge` | Edge hostname for proxy_pass |
| `EDGE_PORT` | Nginx | `3002` | Edge port for proxy_pass |
| `REDIS_URL` | Backend | `redis://redis:6379` | Remote Redis address |

## Nginx Template

The distributed setup uses `nginx.conf.template` instead of `nginx.conf`. The template uses `${BACKEND_HOST}`, `${BACKEND_PORT}`, `${EDGE_HOST}`, and `${EDGE_PORT}` which are substituted via `envsubst` at container start.

To enable this in `Dockerfile.frontend`, add to the entrypoint:
```dockerfile
CMD envsubst '${BACKEND_HOST} ${BACKEND_PORT} ${EDGE_HOST} ${EDGE_PORT}' \
    < /etc/nginx/conf.d/default.conf.template \
    > /etc/nginx/conf.d/default.conf \
    && nginx -g 'daemon off;'
```

## Network & Security

- **Firewall:** Open only required ports between machines (8000, 3002, 5432, 6379)
- **TLS:** Use a reverse proxy (Traefik, Caddy) or cloud load balancer for HTTPS
- **DNS:** Use internal DNS or `/etc/hosts` for service discovery

## Alternative: Easypanel / Dokploy

If using a panel like Easypanel or Dokploy, deploy each tier as a separate service and configure the env vars through the panel UI instead of compose files.
