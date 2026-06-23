/**
 * Structured-Query Dispatch (Phase 0)
 *
 * Single dispatch point that selects how a DataRequest is fulfilled based on
 * its `queryConfig.mode` (the Phase-0 contract). Phases 1–2 fill in the
 * proxy-rpc / proxy-sql / proxy-http fulfillment; until then those modes raise
 * a clear, structured error (no request carries them yet — FastAPI's publish
 * layer only emits direct/proxy today).
 *
 * The legacy `direct`/`proxy` fetchStrategy paths are unchanged: when no
 * recognized `mode` is present, callers fall back to the existing
 * `executeDataRequest()` (direct-rpc / legacy-proxy). This keeps Phase 0 a
 * pure no-behavior-change foundation.
 */

import type { QueryMode } from '@frontbase/types';
import { executeProxyHttp } from './proxyHttp.js';
import { executeProxySql } from './proxySql.js';
import { executeProxyRpc } from './proxyRpc.js';

export type LegacyMode = 'legacy';
export type ResolvedMode = QueryMode | LegacyMode;

interface DispatchableRequest {
    fetchStrategy?: string;
    queryConfig?: Record<string, unknown> | null;
    datasourceId?: string | null;
    [key: string]: unknown;
}

/**
 * Resolve the fulfillment mode for a DataRequest.
 *
 * - Honors an explicit `queryConfig.mode` when it's one of the contract modes.
 * - Otherwise maps the legacy `fetchStrategy` to a mode: `direct` → `direct-rpc`,
 *   `proxy` (SQL credential-forwarding) → `legacy` (handled by executeDataRequest).
 */
export function resolveQueryMode(req: DispatchableRequest): ResolvedMode {
    const explicit = (req.queryConfig as { mode?: unknown } | undefined)?.mode;
    if (
        explicit === 'direct-rpc' ||
        explicit === 'proxy-rpc' ||
        explicit === 'proxy-sql' ||
        explicit === 'proxy-http'
    ) {
        return explicit;
    }

    // Legacy mapping (backward compatible)
    if (req.fetchStrategy === 'direct') return 'direct-rpc';
    return 'legacy';
}

/**
 * Whether a request targets one of the not-yet-fulfilled new modes.
 * The /execute handler uses this to route to dispatchByMode() vs the legacy path.
 */
export function isNewMode(req: DispatchableRequest): boolean {
    const mode = resolveQueryMode(req);
    return mode === 'proxy-rpc' || mode === 'proxy-sql' || mode === 'proxy-http';
}

/**
 * Fulfill a request whose mode is one of the new contract modes.
 *
 *  - proxy-http (Phase 1 / B):  edge POSTs {secret, action, query} to Sheets Web App / REST
 *  - proxy-rpc  (Phase 2 / A1): edge builds `SELECT frontbase_get_rows($1,…)` → Neon /sql
 *  - proxy-sql  (Phase 2 / A2): edge queryBuilder (mysql/sqlite) → dialect HTTP
 */
export async function dispatchByMode(
    req: DispatchableRequest,
    tenantSlug?: string
): Promise<{ data: unknown[]; total: number | null }> {
    const mode = resolveQueryMode(req);

    // Attach the tenant slug so each executor can resolve per-tenant
    // datasource credentials from the state-DB on shared workers.
    const reqWithTenant = tenantSlug ? { ...req, tenantSlug } : req;

    if (mode === 'proxy-http') {
        return executeProxyHttp(reqWithTenant);
    }
    if (mode === 'proxy-sql') {
        return executeProxySql(reqWithTenant);
    }
    if (mode === 'proxy-rpc') {
        return executeProxyRpc(reqWithTenant);
    }

    throw new Error(
        `Query mode "${mode}" is recognized but not yet fulfilled.`
    );
}
