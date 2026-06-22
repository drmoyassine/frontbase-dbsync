# Load testing (Sprint 3A)

k6 scripts validating the platform can take the AppSumo spike:
**~10k req/min sustained, 5k signups in 48h, p95 < 500ms, error rate < 1%.**

## Prerequisites

Install k6 (Go binary — not an npm package):

- macOS: `brew install k6`
- Windows: `choco install k6` (or download from <https://k6.io/docs/get-started/installation/>)
- Docker: `docker run --rm -i grafana/k6 run - < tests/load/k6/signup.js`

## Scripts

| Script | Target | Goal |
|--------|--------|------|
| `signup.js` | `POST {BASE_URL}/api/auth/signup` | 5k signups, p95 < 2s, errors < 1% |
| `published-page.js` | `GET {EDGE_URL}/p/:slug` | 500 req/s, p95 < 500ms, cache HIT > 95% |
| `dashboard.js` | authed dashboard reads | 100 concurrent, p95 < 500ms, errors < 1% |

## Run

```bash
# 1. Bring up a prod-like stack (Docker edge + backend)
docker-compose up -d

# 2. Publish a page to test against (or set PAGE_SLUG to an existing one)

# 3. Run a scenario
npm run test:load:signup
BASE_URL=http://localhost:8000 EDGE_URL=http://localhost:8787 PAGE_SLUG=home npm run test:load:page
DASHBOARD_TOKEN=<jwt> npm run test:load:dashboard
```

All config is env-driven (`BASE_URL`, `EDGE_URL`, `PAGE_SLUG`, `DASHBOARD_TOKEN`),
so the same scripts run against localhost or a deploy.

## Output

k6 prints a summary to stdout; add `--out json=results.json` for machine-readable
output and `K6_WEB_DASHBOARD=true` for a local web UI. Record baseline + post-fix
results in [`docs/load-test-results.md`](../../docs/load-test-results.md).

## Fix loop (if thresholds fail)

- **DB pool exhaustion** (checkout wait > 100ms) → tune pool (Sprint 3B, `config.py`).
- **Email provider rate-limiting** signup → move send to the async queue
  (`services/queue/`).
- **Edge cache miss storm** on pages → verify tenant-prefixed keys + TTLs (Sprint 3C).
