# Next Session — Planning

> Work continuity file. Completed items are tracked in `progress.md` and `performance-optimization.md`.

**Last session**: 2026-03-07 — Provider Test Connection, Supabase deploy fix (ioredis bundle split), Inspector scope filtering + branding  
**Test coverage**: 160 pytest · 74+ edge vitest (9 files) · 13 frontend vitest = **247+ total**

---

## Priorities

### 0. 🚨 Engine Snapshot Isolation (CRITICAL)

Three related architecture issues discovered during tonight's session:

#### A. Per-Engine Code Isolation
**Problem**: Inspector "Save" writes edits to the **shared** `services/edge/src/` tree. All engines share one source tree → editing one engine's code affects ALL engines on next deploy.

**Fix**: Save writes to `engine.source_snapshot` (DB column, per-engine). "Compile & Deploy" writes the snapshot to a temp dir, builds there, deploys, cleans up.

```
Edit → DB (engine.source_snapshot) → temp dir → tsup build → deploy → cleanup
                   ↑ per-engine, isolated
```

#### B. Core Update vs Custom Code Conflict
**Problem**: When Frontbase releases an engine core update, engines show "outdated". If user clicks "Update" → their custom Inspector edits get overwritten with the new core.

**Fix needed**: Three-way merge or layered approach:
- **Option 1**: Git-style 3-way merge (base snapshot vs user edits vs new core)
- **Option 2**: Layered snapshots — `core_snapshot` (Frontbase-managed) + `user_overrides` (user edits). Deploy = merge layers.
- **Option 3**: Treat user-edited engines as "forked" — show "Forked" badge, skip auto-update prompts, let user manually cherry-pick core updates

#### C. False-Positive Drift Detection
**Problem**: Current drift detection hashes ALL `.ts` source files → `source_hash`. When user edits code in Inspector, their `bundle_checksum` no longer matches the computed `source_hash` → engine shows "outdated" (false positive — it's not outdated, it's *customized*).

**Fix needed**: Separate two concepts:
- `core_version_hash` — hash of Frontbase's baseline code (for "is there a Frontbase update?")
- `engine_checksum` — hash of this engine's actual deployed bundle (for "is the deployed code current?")

Engine is outdated only when `core_version_hash` changes AND user hasn't forked.

---

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

### 3. Inspector IDE Polish (follow-up)
The core IDE is live (Monaco editor + Save All + Compile & Deploy). Remaining polish:
- [ ] Inspector Health & Resource Metrics panel
- [ ] File creation/deletion from within Inspector
- [ ] Multi-file search (Ctrl+Shift+F)
- [ ] TypeScript type-checking feedback in editor
