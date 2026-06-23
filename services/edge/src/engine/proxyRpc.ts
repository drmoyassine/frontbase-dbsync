/**
 * proxy-rpc fulfillment (Phase 2 / Route A)
 *
 * Calls the portable `frontbase_get_rows` / `frontbase_aggregate` PL/pgSQL
 * functions installed on a Neon/Postgres datasource, via its /sql HTTP endpoint.
 * Builds a parameterized `SELECT frontbase_get_rows($1, …)` call from the
 * Phase-0 contract (no SQL string-building of user input).
 *
 * Prerequisite: the portable query functions must be provisioned on the target
 * datasource (see supabase_portable_setup.sql — the 4 portable fns, no auth.*).
 */

import type { StructuredQuery, RowsQuery, AggregateQuery } from '@frontbase/types';
import { cached } from '../cache/redis.js';
import { isMultiTenantSlug } from '../storage/IStateProvider.js';

interface RpcCredentials {
    type?: string;
    httpUrl?: string;
    apiUrl?: string;
    apiKey?: string;
}

interface DispatchableRequest {
    datasourceId?: string | null;
    body?: Record<string, unknown> | null;
    tenantSlug?: string | null;
    [key: string]: unknown;
}

let _datasourcesCache: Record<string, RpcCredentials> | null = null;

async function getDatasourceCredentials(
    datasourceId: string,
    tenantSlug?: string | null,
): Promise<RpcCredentials | null> {
    const normalized = tenantSlug ?? undefined;
    if (isMultiTenantSlug(normalized)) {
        const { getTenantSecret } = await import('../config/tenantSecrets.js');
        const blob = await getTenantSecret('datasources', normalized);
        if (blob && typeof blob === 'object') {
            return (blob as Record<string, RpcCredentials>)[datasourceId] || null;
        }
        return null;
    }

    if (!_datasourcesCache) {
        const raw = process.env.FRONTBASE_DATASOURCES || '';
        if (!raw) return null;
        try { _datasourcesCache = JSON.parse(raw); } catch { return null; }
    }
    return _datasourcesCache?.[datasourceId] || null;
}

export function __setDatasourcesCacheForTests(map: Record<string, RpcCredentials> | null) {
    _datasourcesCache = map;
}

/** Map a RowsQuery to the positional args of frontbase_get_rows. */
function rowsArgs(q: RowsQuery): unknown[] {
    return [
        q.table,
        q.columns || '*',
        JSON.stringify(q.joins || []),
        q.sort?.column || null,
        q.sort?.direction || 'asc',
        (q.page || 0) + 1, // RPC is 1-based
        q.pageSize || 100,
        JSON.stringify(q.filters || []),
    ];
}

/** Map an AggregateQuery to the args of frontbase_aggregate. */
function aggregateArgs(q: AggregateQuery): unknown[] {
    return [q.table, q.category, q.aggregation, q.value || null, JSON.stringify(q.filters || []), q.sort || 'none', q.limit || 10];
}

function buildCall(spec: StructuredQuery): { sql: string; params: unknown[] } {
    if (spec.kind === 'aggregate') {
        const params = aggregateArgs(spec);
        const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
        return { sql: `SELECT * FROM frontbase_aggregate(${placeholders})`, params };
    }
    const params = rowsArgs(spec);
    const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
    return { sql: `SELECT * FROM frontbase_get_rows(${placeholders})`, params };
}

/** Test-only: build the RPC call without executing. */
export function __buildCallForTests(spec: StructuredQuery) {
    return buildCall(spec);
}

/**
 * Execute a proxy-rpc request against a Neon/Postgres /sql endpoint.
 * @param injectFetch test seam.
 */
export async function executeProxyRpc(
    req: DispatchableRequest,
    opts: { fetchImpl?: typeof fetch } = {}
): Promise<{ data: unknown[]; total: number | null }> {
    const datasourceId = req.datasourceId;
    if (!datasourceId) throw new Error('proxy-rpc: missing datasourceId');

    const creds = await getDatasourceCredentials(datasourceId, req.tenantSlug);
    if (!creds) throw new Error(`proxy-rpc: no credentials for datasource ${datasourceId}`);

    const httpUrl = creds.httpUrl || creds.apiUrl;
    const apiKey = creds.apiKey;
    if (!httpUrl || !apiKey) throw new Error(`proxy-rpc: datasource ${datasourceId} missing httpUrl/apiKey`);

    const body = (req.body || {}) as Record<string, unknown>;
    const spec = (body.query ?? body.spec ?? body) as unknown as StructuredQuery;
    if (!spec || (spec.kind !== 'rows' && spec.kind !== 'aggregate')) {
        throw new Error('proxy-rpc: body must contain a RowsQuery or AggregateQuery');
    }

    const call = buildCall(spec);
    const fetchImpl = opts.fetchImpl || fetch;
    const cacheKey = `proxy-rpc:${datasourceId}:${call.sql}:${JSON.stringify(call.params)}`;

    const run = async (): Promise<{ data: unknown[]; total: number | null }> => {
        const response = await fetchImpl(`${httpUrl}/sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ query: call.sql, params: call.params }),
        });
        if (!response.ok) throw new Error(`proxy-rpc: datasource returned ${response.status}`);
        const json = (await response.json()) as Record<string, unknown>;
        // frontbase_get_rows returns {rows, total}; frontbase_aggregate returns [{category,value}]
        if (spec.kind === 'aggregate') {
            const rows = (json.rows ?? json) as unknown[];
            return { data: Array.isArray(rows) ? rows : [], total: null };
        }
        const rowsObj = json as { rows?: unknown[]; total?: number };
        const rows = rowsObj.rows ?? [];
        return { data: Array.isArray(rows) ? rows : [], total: typeof rowsObj.total === 'number' ? rowsObj.total : Array.isArray(rows) ? rows.length : 0 };
    };

    return cached<{ data: unknown[]; total: number | null }>(cacheKey, run, 60);
}
