/**
 * proxy-sql fulfillment (Phase 2 / Route B)
 *
 * Builds parameterized SQL in the edge from the Phase-0 contract via the
 * dialect-aware queryBuilder, then executes it against the datasource's HTTP
 * endpoint (MySQL / Turso-sqlite). Credentials resolve server-side from
 * FRONTBASE_DATASOURCES — never shipped to the browser.
 */

import type { StructuredQuery } from '@frontbase/types';
import { buildRowsQuery, buildAggregateQuery, type Dialect, type BuiltQuery } from '../db/queryBuilder.js';
import { cached } from '../cache/redis.js';

interface SqlCredentials {
    type?: string;
    httpUrl?: string;
    apiUrl?: string;
    apiKey?: string;
    authToken?: string;
}

interface DispatchableRequest {
    datasourceId?: string | null;
    queryConfig?: Record<string, unknown> | null;
    body?: Record<string, unknown> | null;
    [key: string]: unknown;
}

let _datasourcesCache: Record<string, SqlCredentials> | null = null;

function getDatasourceCredentials(datasourceId: string): SqlCredentials | null {
    if (!_datasourcesCache) {
        const raw = process.env.FRONTBASE_DATASOURCES || '';
        if (!raw) return null;
        try { _datasourcesCache = JSON.parse(raw); } catch { return null; }
    }
    return _datasourcesCache?.[datasourceId] || null;
}

export function __setDatasourcesCacheForTests(map: Record<string, SqlCredentials> | null) {
    _datasourcesCache = map;
}

function dialectOf(creds: SqlCredentials): Dialect {
    const t = (creds.type || '').toLowerCase();
    return t === 'turso' || t === 'sqlite' ? 'sqlite' : 'mysql';
}

function buildFromSpec(spec: StructuredQuery, dialect: Dialect): BuiltQuery {
    return spec.kind === 'aggregate' ? buildAggregateQuery(spec, dialect) : buildRowsQuery(spec, dialect);
}

/** Map a MySQL HTTP /query response → {data, total}. */
function mapMysqlResult(rows: unknown[]): { data: unknown[]; total: number | null } {
    return { data: Array.isArray(rows) ? rows : [], total: Array.isArray(rows) ? rows.length : 0 };
}

/**
 * Execute a proxy-sql request. @param injectFetch test seam.
 */
export async function executeProxySql(
    req: DispatchableRequest,
    opts: { fetchImpl?: typeof fetch } = {}
): Promise<{ data: unknown[]; total: number | null }> {
    const datasourceId = req.datasourceId;
    if (!datasourceId) throw new Error('proxy-sql: missing datasourceId');

    const creds = getDatasourceCredentials(datasourceId);
    if (!creds) throw new Error(`proxy-sql: no credentials for datasource ${datasourceId}`);

    const httpUrl = creds.httpUrl || creds.apiUrl;
    if (!httpUrl) throw new Error(`proxy-sql: datasource ${datasourceId} has no httpUrl`);

    const body = (req.body || {}) as Record<string, unknown>;
    const spec = (body.query ?? body.spec ?? body) as unknown as StructuredQuery;
    if (!spec || (spec.kind !== 'rows' && spec.kind !== 'aggregate')) {
        throw new Error('proxy-sql: body must contain a RowsQuery or AggregateQuery');
    }

    const dialect = dialectOf(creds);
    const built = buildFromSpec(spec, dialect);
    const token = creds.apiKey || creds.authToken;

    const fetchImpl = opts.fetchImpl || fetch;
    const cacheKey = `proxy-sql:${datasourceId}:${built.sql}:${JSON.stringify(built.params)}`;

    const run = async (): Promise<{ data: unknown[]; total: number | null }> => {
        const response = await fetchImpl(`${httpUrl}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ query: built.sql, params: built.params }),
        });
        if (!response.ok) throw new Error(`proxy-sql: datasource returned ${response.status}`);
        const json = (await response.json()) as Record<string, unknown>;
        const rows = (json.rows ?? json.data ?? []) as unknown[];
        return mapMysqlResult(rows);
    };

    return cached<{ data: unknown[]; total: number | null }>(cacheKey, run, 60);
}

/** Test-only export: build SQL from a spec without executing. */
export function __buildForTests(spec: StructuredQuery, dialect: Dialect): BuiltQuery {
    return buildFromSpec(spec, dialect);
}
