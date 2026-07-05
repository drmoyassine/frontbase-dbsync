# Frontbase Admin SPA on a Cloudflare Worker

Host the admin dashboard on a Cloudflare Worker that serves the built SPA and
reverse-proxies API traffic to your VPS **core-tier** `api-gateway`. Pairs with
Supabase (DB + Auth) so the whole stack is: **1 VPS + CF Worker + Supabase**.

## Why a proxy (not just static hosting)

The SPA hardcodes **same-origin** API paths in production
(`src/lib/portConfig.ts` → `baseUrl: ''`) — it always calls `/api/*` on its own
host. There is no build flag to aim it at a different API origin. So the Worker
must serve the assets **and** forward `/api/*` (and `/static/*`, `/edge/*`) to
the VPS gateway. `worker.js` does exactly that.

## 1. Build the SPA (Supabase + cloud)

Vite's `vite.config.ts` reads UN-prefixed env names via `loadEnv(mode, cwd, '')`
and maps them to `import.meta.env.VITE_*`. So the build env file uses the
**backend-style** names (NOT `VITE_...`):

Create `.env.production` at the **repo root**:

```env
VITE_DEPLOYMENT_MODE=cloud
AUTH_PROVIDER=supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
```

- `VITE_DEPLOYMENT_MODE=cloud` → base path `/admin/`, cloud auth flow.
- `AUTH_PROVIDER=supabase` → routes login through Supabase client-side.
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` → baked into the bundle (anon key is
  public by design; never put the service_role key here).

Build:

```bash
npm ci
npm run build      # → dist/  (assets under dist/admin/)
```

## 2. Point the Worker at your gateway

Edit `wrangler.toml` → set `GATEWAY_ORIGIN` to the HTTPS domain EasyPanel
assigned to the **api-gateway** service (e.g. `https://api.yourdomain.com`).

## 3. Deploy (browser OAuth — no raw API token needed)

From the **repo root**:

```bash
npx wrangler login       # opens a browser; authorizes wrangler on your CF account
npx wrangler deploy -c deployment-modes/cloud-deployment/cloudflare-worker-frontend/wrangler.toml
```

Then in the Cloudflare dashboard: **Workers → frontbase-frontend → Triggers →
Custom Domains** → add `app.yourdomain.com`.

## 4. Cross-wire the three sides

| Setting | Value | Where |
|---|---|---|
| `GATEWAY_ORIGIN` | `https://api.yourdomain.com` | this `wrangler.toml` |
| `CORS_ORIGINS` | `https://app.yourdomain.com` | VPS core-tier env |
| Supabase **Site URL** | `https://app.yourdomain.com` | Supabase dashboard → Auth → URL Config |
| `FERNET_KEY` | pinned (generated once) | VPS — REQUIRED with external DB |

## 5. Verify

Through the gateway, the backend is only reachable under `/api/*`. Everything
else falls through nginx's catch-all to the **edge** (SSR page handler), so
`/health` returns an edge "page not found" — that endpoint is backend-internal
(Docker healthcheck on 127.0.0.1:8000), NOT publicly routed. Use an `/api`
route to prove the chain:

```bash
# Proxied /api route reaching the backend. 401 is the CORRECT answer when
# unauthenticated, and proves the /api/* → backend path works end to end:
curl https://api.yourdomain.com/api/auth/me      # → {"detail":"Not authenticated"}

# Same through the Worker (once deployed):
curl https://app.yourdomain.com/api/auth/me
```

Open `https://app.yourdomain.com` → it redirects to `/admin/` → sign up →
Supabase auth + tenant provisioning end-to-end.

## Notes

- **Published SSR sites** are served by the VPS gateway/edge, not this Worker.
  Give them their own domains pointed at the edge; keep this Worker for the
  admin SPA.
- Assets are content-hashed per build — a redeploy of the Worker with a fresh
  `dist/` invalidates them automatically.
