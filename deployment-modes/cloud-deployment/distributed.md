# Frontbase Distributed Deployment Guide

Deploy Frontbase services across multiple machines for high availability, scalability, and security isolation. Instead of running all services on a single machine, Frontbase can be split into distinct "tiers".

## Architecture

```text
Machine A (API)        Machine B (Data)       Machine C (Edge)       Machine D (Static)
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ Backend :8000   │   │ PostgreSQL :5432│   │ Edge :3002      │   │ Nginx :80       │
│ Redis   :6379   │   │                 │   │                 │   │ Admin SPA       │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │                     │
         │ DATABASE_URL ───────┘                     │                     │
         │ EDGE_URL ─────────────────────────────────┘                     │
         │                                      EDGE_BACKEND_URL           │
         │ BACKEND_HOST / EDGE_HOST (nginx envsubst) ──────────────────────┘
```

Each tier has its **own** compose file and its **own** `.env` file under [`distributed-cloud-deployment/`](distributed-cloud-deployment), so no machine receives secrets it doesn't need (the Static tier never sees the DB password; the Edge tier never sees your email API keys).

### The 4 Tiers

| Tier | Machine | Role | Compose file | Starts after |
|---|---|---|---|---|
| **Data** | **B** | Runs the primary PostgreSQL database. | `docker-compose.data-tier.yml` | — (first) |
| **API** | **A** | Runs the FastAPI backend control plane and Redis. | `docker-compose.api-tier.yml` | Data |
| **Edge** | **C** | Runs Edge Engine SSR & Webhooks. Scale horizontally. | `docker-compose.edge.yml` (repo root) | API |
| **Static** | **D** | Nginx reverse proxy & Admin Dashboard SPA. | `docker-compose.static-tier.yml` | API + Edge |

### Core-tier hybrid (optional)

Run backend + edge together on one VPS with **no Builder UI** (host the Admin SPA elsewhere, e.g. Cloudflare Pages) — see [`docker-compose.core-tier.yml`](distributed-cloud-deployment/docker-compose.core-tier.yml).

---

## Deployment Steps

To set up your distributed cluster, follow these steps on each respective machine:

### 1. Prepare Environment Files
On each machine, copy the respective example environment file and fill in the missing IP addresses and secrets.

```bash
cd deployment-modes/cloud-deployment/distributed-cloud-deployment

# For the Data Tier (Machine B):
cp .env.data-tier.example .env.data-tier
# Edit to set your secure DB_PASSWORD

# For the API Tier (Machine A):
cp .env.api-tier.example .env.api-tier
# Edit to set Machine B's IP, and configure your SaaS keys (Emails, Sentry, etc.)

# For the Edge Tier (Machine C):
cp .env.edge-tier.example .env.edge-tier
# Edit to point EDGE_BACKEND_URL to Machine A's IP

# For the Static Tier (Machine D):
cp .env.static-tier.example .env.static-tier
# Edit to point BACKEND_HOST to Machine A's IP, and EDGE_HOST to Machine C's IP
```

### 2. Start the Services
Boot the tiers in order of their dependencies on each respective machine:

**Machine B (Data Tier):**
```bash
docker-compose -f docker-compose.data-tier.yml --env-file .env.data-tier up -d
```

**Machine A (API Tier):**
```bash
docker-compose -f docker-compose.api-tier.yml --env-file .env.api-tier up -d
```

**Machine C (Edge Tier):**
```bash
# Note: the Edge tier uses the unified repo-root compose file
docker-compose -f ../../../docker-compose.edge.yml --env-file .env.edge-tier up -d
```

**Machine D (Static Tier):**
```bash
docker-compose -f docker-compose.static-tier.yml --env-file .env.static-tier up -d
```

---

## Env Var Reference

The variables that wire tiers together across machines:

| Variable | Set on | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | API (Machine A) | — | Backend → Postgres on Machine B (or Supabase pooler) |
| `EDGE_URL` | API (Machine A) | `http://edge:3002` | Backend → Edge on Machine C |
| `EDGE_BACKEND_URL` | Edge (Machine C) | `http://backend:8000` | Edge → Backend on Machine A (startup sync) |
| `REDIS_URL` | API (Machine A) | `redis://redis:6379` | Backend → Redis (local to API tier) |
| `BACKEND_HOST` / `BACKEND_PORT` | Static (Machine D) | `backend` / `8000` | Nginx upstream → Machine A |
| `EDGE_HOST` / `EDGE_PORT` | Static (Machine D) | `edge` / `3002` | Nginx upstream → Machine C |

---

## Authentication Provider

The distributed tiers (`docker-compose.api-tier.yml`, `docker-compose.core-tier.yml`) default to **`AUTH_PROVIDER=supabase`** and do **not** ship a SuperTokens container. This is intentional for cloud SaaS deployments backed by Supabase Auth.

If you need SuperTokens in a distributed setup, add the `supertokens` and `postgres` services (and the `supertokens` compose profile) modeled on [`standard-cloud-deployment/docker-compose.cloud.yml`](../standard-cloud-deployment/docker-compose.cloud.yml), set `AUTH_PROVIDER=supertokens` in `.env.api-tier`, and run the Data Tier Postgres with a `supertokens` schema. For most cloud deployments, Supabase Auth is the simpler choice and requires no extra containers.

---

## Network & Security Best Practices

- **Firewall:** Open only the ports each machine actually needs between tiers (`5432` B←A, `8000` A←D, `3002` C←A/D, `6379` only on A). **Expose only Machine D to the public internet** (ports `80`/`443`).
- **TLS:** Terminate HTTPS at Machine D (or a cloud load balancer / Caddy / Traefik in front of it).
- **Least Privilege Environment Variables:** Never share a `.env` file across tiers. The separated `.env` setup enforces this strictly.

---

## Nginx Templating

The Static tier proxies to remote upstreams, so it cannot use the baked-in `nginx.conf` (which hardcodes the in-network hostnames `backend`/`edge`). It mounts [`nginx.conf.template`](distributed-cloud-deployment/nginx.conf.template) and `Dockerfile.frontend`'s entrypoint runs `envsubst` at container start, expanding only `${BACKEND_HOST}`, `${BACKEND_PORT}`, `${EDGE_HOST}`, `${EDGE_PORT}` (nginx's own `$host`/`$remote_addr` are left intact).

---

## Alternative: Easypanel / Dokploy

Deploy each tier as a separate service in the panel and set the env vars above through the panel UI instead of these compose files.
