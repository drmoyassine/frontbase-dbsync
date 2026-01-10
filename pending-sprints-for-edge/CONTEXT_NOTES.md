# Context Notes for Next Session

## Where We Left Off
Sprint 3 plan is **approved and ready for implementation**. User went to sleep at 3:04 AM on 2026-01-10.

## Critical Production Fixes Made Today

### 1. 307 Redirect Issue (FIXED)
- **Root Cause**: FastAPI routes had trailing slashes, causing 307 redirects
- **Fix**: Removed trailing slashes from `/login/`, `/logout/`, `/me/` in `auth.py`
- **Also Added**: `--proxy-headers --forwarded-allow-ips='*'` to uvicorn for HTTPS redirects

### 2. Mixed Content Issue (FIXED)
- **Root Cause**: Frontend was using absolute URLs with `http://`
- **Fix**: Updated `getApiBase()` in `auth.ts` to use relative URLs on HTTPS

### 3. Production Environment Variables
User configured in Easypanel:
- `ADMIN_EMAIL=admin@yourdomain.com`
- `ADMIN_PASSWORD=change-this-secure-password`
- `VITE_API_URL=""` (empty for relative URLs)

## Key Architecture Decisions

### Variable Scopes
- **Page Variables**: In-memory, temp UI state
- **Session Variables**: localStorage, tied to login session
- **Cookies**: Persistent, server-readable

### SSR Strategy
- Local: Hono → FastAPI → SQLite/Postgres
- Edge: Hono → D1/KV (NO FastAPI!)

### Caching
- Client: Zustand (Builder) + React Query (data)
- Server: HTTP Cache-Control headers
- Edge: CDN caching via headers

## Files Changed Today
- `fastapi-backend/app/routers/auth.py` - Removed trailing slashes
- `fastapi-backend/docker_entrypoint.sh` - Added proxy headers
- `src/stores/auth.ts` - Fixed relative URLs
- `docker-compose.yml` - VITE_API_URL build arg

## Starting Point for Tomorrow
Open `pending-sprints-for-edge/sprint3_ssr_plan.md` and begin with:
1. Create `services/actions/src/routes/pages.ts`
2. Create `services/actions/src/ssr/store.ts`

Good night! 🌙
