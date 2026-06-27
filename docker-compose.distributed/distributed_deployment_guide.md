# Frontbase Distributed Deployment Guide

This guide explains how to deploy Frontbase across a multi-node cluster for high availability, security isolation, and scale. Instead of running all services on a single machine, Frontbase can be split into 4 distinct "tiers".

## The 4 Tiers Architecture

Frontbase's distributed architecture is composed of 4 main tiers. You can run these on 4 separate physical or virtual machines, or combine them as needed (e.g., combining API and Data on one machine, while isolating Edge on another).

### 1. Data Tier (Machine B)
- **Role:** Runs the primary PostgreSQL database.
- **Compose File:** `docker-compose.data-tier.yml`
- **Env File:** `.env.data-tier`
- **Dependencies:** None (must be started first).

### 2. API Tier (Machine A)
- **Role:** Runs the FastAPI backend control plane and the Redis caching server.
- **Compose File:** `docker-compose.api-tier.yml`
- **Env File:** `.env.api-tier`
- **Dependencies:** Requires the Data Tier to be running.

### 3. Edge Tier (Machine C)
- **Role:** Runs the Edge Engine SSR and Webhook worker nodes. You can horizontally scale this by deploying this tier on multiple physical machines behind a load balancer.
- **Compose File:** `docker-compose.edge.yml` (Unified root file)
- **Env File:** `.env.edge-tier`
- **Dependencies:** Requires the API Tier.

### 4. Static Tier (Machine D)
- **Role:** Runs Nginx as a reverse proxy and serves the pre-compiled Admin Dashboard SPA.
- **Compose File:** `docker-compose.static-tier.yml`
- **Env File:** `.env.static-tier`
- **Dependencies:** Requires both the API Tier and Edge Tier.

---

## Deployment Steps

To set up your distributed cluster, follow these steps on each respective machine:

### Step 1: Prepare the Environment Files
On each machine, copy the respective example environment file and fill in the missing IP addresses and secrets.

**For the Data Tier (Machine B):**
```bash
cp .env.data-tier.example .env.data-tier
# Edit .env.data-tier to set your secure DB_PASSWORD
```

**For the API Tier (Machine A):**
```bash
cp .env.api-tier.example .env.api-tier
# Edit .env.api-tier to set Machine B's IP, and configure your SaaS keys (Emails, Sentry, etc.)
```

**For the Edge Tier (Machine C):**
```bash
cp .env.edge-tier.example .env.edge-tier
# Edit .env.edge-tier to point to Machine A's IP
```

**For the Static Tier (Machine D):**
```bash
cp .env.static-tier.example .env.static-tier
# Edit .env.static-tier to point to Machine A's and Machine C's IPs
```

### Step 2: Start the Services

Boot the tiers in order of their dependencies:

**1. On Machine B (Data Tier):**
```bash
docker-compose -f docker-compose.data-tier.yml --env-file .env.data-tier up -d
```

**2. On Machine A (API Tier):**
```bash
docker-compose -f docker-compose.api-tier.yml --env-file .env.api-tier up -d
```

**3. On Machine C (Edge Tier):**
```bash
docker-compose -f docker-compose.edge.yml --env-file .env.edge-tier up -d
```

**4. On Machine D (Static Tier):**
```bash
docker-compose -f docker-compose.static-tier.yml --env-file .env.static-tier up -d
```

---

## Security Best Practices
- **Least Privilege Environment Variables:** Do not share environment files across machines. The Static Tier does not need your database password, and the Edge Tier does not need your email API keys. The separated `.env` setup enforces this strictly.
- **Firewall Rules:** Ensure that Machine A can communicate with Machine B on port `5432`, and Machine D can communicate with Machine A on port `8000` and Machine C on port `3002`. **Expose only Machine D to the public internet** (Port `80` / `443`).
