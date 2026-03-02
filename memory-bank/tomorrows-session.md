# Tomorrow's Session — Living Document

> Last updated: 2026-03-02

## Priority Items

### 1. Lazy-Load Node Execution Details on Expand
**Status:** Planned  
**Context:** The global execution log (`/api/executions/all`) strips `nodeExecutions` and `triggerPayload` to keep payloads small. When a user expands a row, we need to fetch the full execution detail.

**Plan:**
- Add a backend proxy endpoint: `GET /api/actions/executions/{execution_id}/detail?engine_url=...`
- Backend calls the Edge's existing `GET /api/executions/:id` (which already returns full detail including `nodeExecutions`)
- Frontend: on row expand in `ExecutionLogTable`, fetch detail via React Query and render per-node results (input/output, timing, status)
- Cache individual execution details in React Query (they're immutable once completed)

### 2. Automation Canvas — Execution Log Not Wired
**Status:** Needs Investigation  
**Context:** The execution log panel inside the workflow editor canvas (per-workflow view) does not appear to be properly connected to the data source right now. Likely uses the per-workflow endpoint which may not be pulling from the Edge correctly.

**Investigate:**
- Check which hook/endpoint the canvas execution log uses (likely `useExecutionsByDraft` or similar)
- Determine if it calls the Edge's `GET /api/executions/workflow/:workflowId` or the PostgreSQL-only backend endpoint
- Wire it to pull from the correct Edge endpoint (similar fan-out pattern but filtered by workflow ID)
- Ensure test runs (from backend) and edge runs (from Edge) are both shown

### 3. Redeploy CF Worker
**Status:** Pending  
**Context:** The Edge route reordering fix (`/all` before `/:id`) needs to be deployed to Cloudflare Workers. Currently only the local dev server has the fix. CF Worker returns 404 for `/api/executions/all`.

---

## Completed Today (2026-03-02)

- ✅ Pull-based execution log: backend fans out to edges with deployed workflows
- ✅ Redis L2 cache (20min TTL) with `?fresh=true` bypass
- ✅ Refresh button in UI
- ✅ Export CSV dialog with multi-select filters (Edge, Workflow, Status, Date Range)
- ✅ Fixed Edge route ordering (`/all` before `/:id`)
- ✅ Fixed `_collect_edge_urls` to use `EdgeEngine` table (canonical URLs) instead of stale `deployed_engines` URLs
- ✅ Removed 10s polling from `useAllExecutions`

## Notes / Ideas
- Consider adding a "last synced" timestamp to the execution log header
- The export CSV also refreshes the Redis cache — good for data freshness
