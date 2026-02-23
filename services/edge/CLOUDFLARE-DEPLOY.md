# Deploying Frontbase Edge to Cloudflare Workers

## Prerequisites

1. **Cloudflare account** — [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Turso database** — [turso.tech](https://turso.tech) (Workers have no filesystem — local SQLite not available)
3. **Upstash Redis** (optional) — [upstash.com](https://upstash.com) for L2 caching
4. **Node.js 18+** and `npm` installed locally

## 1. Install wrangler

```bash
cd services/edge
npm install
```

Wrangler is included as a devDependency in `package.json`.

## 2. Login to Cloudflare

```bash
npx wrangler login
```

## 3. Configure Secrets

Set your database and cache credentials as Worker secrets:

```bash
# Required — Turso edge database
npx wrangler secret put FRONTBASE_STATE_DB_URL
# Enter: libsql://your-db-name.turso.io

npx wrangler secret put FRONTBASE_STATE_DB_TOKEN
# Enter: your Turso auth token

# Optional — Upstash Redis cache
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN

# Optional — Control Plane (for startup sync)
npx wrangler secret put BACKEND_URL
# Enter: https://your-backend.example.com
```

## 4. Build & Deploy

```bash
# Build the client assets + Worker bundle
npm run build:cf

# Deploy to Cloudflare
npm run deploy:cf
```

Your Worker will be available at `https://frontbase-edge.<your-account>.workers.dev`.

## 5. Custom Domain (optional)

1. Go to **Cloudflare Dashboard → Workers & Pages → frontbase-edge → Settings → Domains**
2. Add your custom domain (e.g., `www.mysite.com`)
3. Cloudflare will configure DNS and SSL automatically

## 6. Register in Frontbase

After deploying, register the target in Frontbase Settings:

1. Open the Frontbase dashboard
2. Go to **Settings → Deployment Targets**
3. Click **Add Target**
4. Fill in:
   - **Name**: e.g., "Production Cloudflare"
   - **Provider**: cloudflare
   - **URL**: `https://www.mysite.com` (or `https://frontbase-edge.<account>.workers.dev`)
   - **Scope**: pages

## 7. Publish a Page

After registration, publishing a page from the builder will automatically push it to your Cloudflare Worker.

## Troubleshooting

| Issue | Solution |
|---|---|
| `Error: No Turso credentials` | Run `wrangler secret put FRONTBASE_STATE_DB_URL` |
| Bundle too large (>25MB) | Audit dependencies, ensure no Node.js-only packages |
| SSR pages not rendering | Check Turso has published pages (run `/api/health` first) |
| `compress is not a function` | Ensure you're using `build:cf`, not `build` |

## Development

```bash
# Local Worker dev server (simulates Cloudflare Worker runtime)
npm run dev:cf
```

This uses `wrangler dev` which runs your Worker locally with the same API as production.
