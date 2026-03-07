# Next Session — Planning

> Work continuity file. Completed items are tracked in `progress.md` and `performance-optimization.md`.

**Last session**: 2026-03-07 — Housekeeping batch (refactoring, schema parity tests P1 #5+#6)  
**Test coverage**: 142 pytest · 74+ edge vitest (9 files) · 10 frontend vitest = **226+ total**

---

## Priorities

### 1. Add More Edge Engine Providers
Currently only **Cloudflare Workers** and **Docker** deploy paths exist.

**Candidates to add** (categorized):

**Ecosystem partners** (already integrated elsewhere in Frontbase):
- [ ] **Supabase Edge Functions** — Deno-based, already have Supabase credentials, natural fit
- [ ] **Upstash Workflows** — durable serverless workflows, already have Upstash creds for cache/queue

**Serverless edge** (similar to existing Cloudflare path):
- [ ] **Vercel Edge Functions** — large user base, Hono-compatible
- [ ] **Deno Deploy** — native Hono support, minimal adaptation
- [ ] **Netlify Edge Functions** — Deno runtime, simple deploy API
- [ ] **Fastly Compute** — Wasm-based, high-performance edge

**Container-based** (similar to existing Docker path):
- [ ] **Fly.io** — global containers, simple CLI/API deploy
- [ ] **Railway** — simple deploy API, Docker support
- [ ] **Render** — auto-deploy from Docker, free tier

**Hyperscalers**:
- [ ] **AWS Lambda@Edge / Lambda + CloudFront** — complex but widest reach
- [ ] **Azure Functions** — enterprise, broad tooling
- [ ] **Google Cloud Run** — container-based serverless, scales to zero
- [ ] **IBM Code Engine** — Knative-based, container serverless
- [ ] **Oracle Cloud Functions** — Fn Project-based, always-free tier

**Implementation per provider**:
- Backend: `services/engine_deploy_<provider>.py` — deploy/redeploy/teardown
- Backend: Update `adapter_type` Literal in `schemas/edge_engines.py` 
- Frontend: Add provider card in Edge Infrastructure wizard (Step 1 provider picker)
- Edge: Provider-specific env vars (API tokens, project IDs)

**Current adapter_type values**: `"edge" | "pages" | "automations" | "full"`  
**Current deploy paths**: `_deploy_cloudflare()` in `engine_deploy.py`, Docker `/api/update` endpoint

### 2. Connected Accounts Tab in Settings
New tab in `SettingsPanel` showing all connected 3rd-party accounts in one place.

**Known accounts across Frontbase**:
| Provider | Where Stored | Scope |
|----------|-------------|-------|
| Supabase | `ProjectSettings.supabase_url` + keys | Database, Auth |
| Cloudflare | `ProjectSettings.cloudflare_*` | Edge Deploy |
| Upstash Redis | `EdgeCache.cache_url` + token | Caching |
| Upstash QStash | `EdgeQueue.queue_url` + token | Queues |
| AI Providers | `ProjectSettings` / env | Inference |
| Email (Resend/SendGrid) | `ProjectSettings.email_*` | Notifications |

**Implementation**:
- [ ] Backend: `GET /api/settings/connected-accounts` — aggregates all provider connection status
- [ ] Frontend: `ConnectedAccountsTab.tsx` — card per provider with status badge, scope tags, and link to configure
- [ ] Add `'accounts'` to `VALID_TABS` in `SettingsPanel.tsx`
- [ ] Each card shows: provider logo, connection status (✅/❌), scope, last verified, actions (disconnect/refresh)
