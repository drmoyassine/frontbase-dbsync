# Distributed Deployment Overview

Deploy Frontbase services across multiple machines for high availability,
scalability, and security isolation.

> This is the high-level overview. For the canonical, step-by-step per-tier
> instructions, env files, and security notes see
> **[distributed-cloud-deployment/distributed_deployment_guide.md](distributed-cloud-deployment/distributed_deployment_guide.md)**.

## Architecture

```
Machine A (API)        Machine B (Data)       Machine C (Edge)       Machine D (Static)
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ Backend :8000   │   │ PostgreSQL :5432│   │ Edge :3002      │   │ Nginx :80       │
│ Redis   :6379   │   │                 │   │                 │   │ Admin SPA       │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │                     │
         │ DATABASE_URL ───────┘                     │                     │
         │ EDGE_URL ─────────────────────────────────┘                     │
         │                                          BACKEND_URL            │
         │ BACKEND_HOST / EDGE_HOST (nginx envsubst) ──────────────────────┘
```

Each tier has its **own** compose file and its **own** `.env` file under
[`distributed-cloud-deployment/`](distributed-cloud-deployment), so no machine
receives secrets it doesn't need (the Static tier never sees the DB password;
the Edge tier never sees your email API keys).

| Tier | Machine | Compose file | Starts after |
|---|---|---|---|
| Data   | B | `docker-compose.data-tier.yml`   | — (first) |
| API    | A | `docker-compose.api-tier.yml`    | Data |
| Edge   | C | `docker-compose.edge.yml` (repo root) | API |
| Static | D | `docker-compose.static-tier.yml` | API + Edge |

### Core-tier hybrid (optional)

Run backend + edge together on one VPS with **no Builder UI** (host the Admin
SPA elsewhere, e.g. Cloudflare Pages) — see
[`docker-compose.core-tier.yml`](distributed-cloud-deployment/docker-compose.core-tier.yml).

## Quick start

```bash
cd docs/cloud-deployment/distributed-cloud-deployment

# 1. Prepare per-tier env files (one per machine)
cp .env.data-tier.example   .env.data-tier      # set DB_PASSWORD
cp .env.api-tier.example    .env.api-tier       # set MACHINE_B_IP/C_IP + SaaS keys
cp .env.edge-tier.example   .env.edge-tier      # set FRONTBASE_SYSTEM_KEY
cp .env.static-tier.example .env.static-tier    # set MACHINE_A_IP/C_IP

# 2. Boot per tier, in dependency order — on each respective machine:
docker-compose -f docker-compose.data-tier.yml   --env-file .env.data-tier   up -d
docker-compose -f docker-compose.api-tier.yml    --env-file .env.api-tier    up -d
docker-compose -f ../../../docker-compose.edge.yml --env-file .env.edge-tier up -d
docker-compose -f docker-compose.static-tier.yml --env-file .env.static-tier up -d
```

## Env var reference

The vars that wire tiers together across machines:

| Variable | Set on | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | API (Machine A) | — | Backend → Postgres on Machine B (or Supabase pooler) |
| `EDGE_URL` | API (Machine A) | `http://edge:3002` | Backend → Edge on Machine C |
| `BACKEND_URL` | Edge (Machine C) | `http://localhost:8000` | Edge → Backend on Machine A (startup sync) |
| `REDIS_URL` | API (Machine A) | `redis://redis:6379` | Backend → Redis (local to API tier) |
| `BACKEND_HOST` / `BACKEND_PORT` | Static (Machine D) | `backend` / `8000` | Nginx upstream → Machine A |
| `EDGE_HOST` / `EDGE_PORT` | Static (Machine D) | `edge` / `3002` | Nginx upstream → Machine C |

> The backend reads `EDGE_URL` (not `EDGE_ENGINE_URL`); the edge reads
> `BACKEND_URL` (not `FASTAPI_URL`). Older docs used those retired names.

## Nginx templating

The Static tier proxies to remote upstreams, so it cannot use the baked-in
`nginx.conf` (which hardcodes the in-network hostnames `backend`/`edge`). It
mounts [`nginx.conf.template`](distributed-cloud-deployment/nginx.conf.template)
and `Dockerfile.frontend`'s entrypoint runs `envsubst` at container start,
expanding only `${BACKEND_HOST}`, `${BACKEND_PORT}`, `${EDGE_HOST}`,
`${EDGE_PORT}` (nginx's own `$host`/`$remote_addr` are left intact).

## Network & security

- **Firewall:** open only the ports each machine actually needs between tiers
  (`5432` B←A, `8000` A←D, `3002` C←A/D, `6379` only on A). **Expose only
  Machine D to the public internet** (ports `80`/`443`).
- **TLS:** terminate HTTPS at Machine D (or a cloud load balancer / Caddy /
  Traefik in front of it).
- **Least privilege:** never share a `.env` file across tiers.

## Alternative: Easypanel / Dokploy

Deploy each tier as a separate service in the panel and set the env vars above
through the panel UI instead of these compose files.
