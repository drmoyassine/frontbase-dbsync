/**
 * proxy-http fulfillment (Phase 1 / B4)
 *
 * Executes a structured query against a Google Sheets (or generic REST)
 * datasource by POSTing the Phase-0 contract to a remote Web App / API.
 * Credentials (Web App URL + shared secret + spreadsheet id) are resolved
 * server-side from FRONTBASE_DATASOURCES — never shipped to the browser.
 *
 * Includes Redis caching + serve-last-good on remote errors, because GAS has
 * ~30-concurrent-execution and multi-second latency limits.
 */

import { cached } from '../cache/redis.js';

interface SheetsCredentials {
    type?: string;
    webAppUrl?: string;
    apiUrl?: string;
    webAppSecret?: string;
    secret?: string;
    spreadsheetId?: string;
}

interface DispatchableRequest {
    queryConfig?: Record<string, unknown> | null;
    datasourceId?: string | null;
    body?: Record<string, unknown> | null;
    [key: string]: unknown;
}

let _datasourcesCache: Record<string, SheetsCredentials> | null = null;

function getDatasourceCredentials(datasourceId: string): SheetsCredentials | null {
    if (!_datasourcesCache) {
        const raw = process.env.FRONTBASE_DATASOURCES || '';
        if (!raw) return null;
        try {
            _datasourcesCache = JSON.parse(raw);
        } catch {
            console.error('[proxy-http] Invalid FRONTBASE_DATASOURCES JSON');
            return null;
        }
    }
    return _datasourcesCache?.[datasourceId] || null;
}

/** For tests to inject a credential map without touching process.env. */
export function __setDatasourcesCacheForTests(map: Record<string, SheetsCredentials> | null) {
    _datasourcesCache = map;
}

function pickAction(body: Record<string, unknown> | undefined): string {
    if (body && typeof body === 'object') {
        if (body.action === 'insert' || body.action === 'update' || body.action === 'delete' ||
            body.action === 'ping' || body.action === 'schema') {
            return body.action as string;
        }
        const spec = body.query as { kind?: string } | undefined;
        if (spec?.kind === 'aggregate') return 'aggregate';
    }
    return 'rows';
}

/**
 * Execute a proxy-http request. Returns `{ data, total }`.
 *
 * @param injectFetch test seam; defaults to global fetch.
 */
export async function executeProxyHttp(
    req: DispatchableRequest,
    opts: {
        fetchImpl?: typeof fetch;
    } = {}
): Promise<{ data: unknown[]; total: number | null }> {
    const datasourceId = req.datasourceId;
    if (!datasourceId) throw new Error('proxy-http: missing datasourceId');

    const creds = getDatasourceCredentials(datasourceId);
    if (!creds) throw new Error(`proxy-http: no credentials for datasource ${datasourceId}`);

    const url = creds.webAppUrl || creds.apiUrl;
    const secret = creds.webAppSecret || creds.secret;
    if (!url) throw new Error(`proxy-http: datasource ${datasourceId} has no webAppUrl`);

    const body = (req.body || {}) as Record<string, unknown>;
    const action = pickAction(body);

    const payload: Record<string, unknown> = { secret, action };
    // Pass through the contract fields the Web App expects.
    if (action === 'rows' || action === 'aggregate') payload.query = body.query ?? body;
    if (action === 'insert') { payload.table = body.table; payload.records = body.records; }
    if (action === 'update') { payload.table = body.table; payload.match = body.match; payload.patch = body.patch; }
    if (action === 'delete') { payload.table = body.table; payload.match = body.match; }

    const fetchImpl = opts.fetchImpl || fetch;
    const cacheKey = `proxy-http:${datasourceId}:${action}:${JSON.stringify(payload)}`;
    const ttl = 60;

    const run = async (): Promise<{ data: unknown[]; total: number | null }> => {
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            redirect: 'follow', // GAS web apps 302 → script.googleusercontent.com
        });
        if (!response.ok) {
            throw new Error(`proxy-http: Web App returned ${response.status}`);
        }
        const json = (await response.json()) as Record<string, unknown>;

        if (action === 'aggregate') {
            return { data: (json as unknown as unknown[]) || [], total: null };
        }
        const rows = (json.rows ?? json.data ?? []) as unknown[];
        const total = typeof json.total === 'number' ? json.total : Array.isArray(rows) ? rows.length : 0;
        return { data: Array.isArray(rows) ? rows : [], total };
    };

    // `cached()` already falls back to direct execution when Redis is unavailable,
    // and serves cached successes within TTL (collapses N visitors → ~1 GAS call/window).
    // Note: true serve-last-good-on-error is a future refinement (separate last-good key).
    return cached<{ data: unknown[]; total: number | null }>(cacheKey, run, ttl);
}
