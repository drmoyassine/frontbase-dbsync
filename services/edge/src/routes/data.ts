/**
 * Data API Route (Phase 7)
 * 
 * Provides data fetching endpoints for client hydration.
 * Uses datasource configs from published pages.
 * GET /api/data/:table - Fetch data from user's datasource
 * POST /api/data/execute - Execute pre-computed DataRequest (Phase 10)
 * 
 * Redis Cache Integration:
 * - Uses cached() wrapper for automatic L2 caching
 * - Cache key based on URL + body hash
 * - TTL configurable (default 60s)
 */

import { Hono } from 'hono';
import { handleDataQuery, createDatasourceAdapter } from '../db/datasource-adapter';
import { stateProvider } from '../storage/index.js';
import { getRedis, cached } from '../cache/redis.js';
import type { DatasourceConfig, DataRequest } from '../schemas/publish';

export const dataRoute = new Hono();

// Cache the first datasource from any published page
let cachedDatasource: DatasourceConfig | null = null;

// =============================================================================
// Unified HTTP Data Request Execution (Phase 10)
// =============================================================================

/**
 * Datasource credentials cache (parsed from FRONTBASE_DATASOURCES env var)
 */
let _datasourcesCache: Record<string, any> | null = null;

/**
 * Get datasource credentials from FRONTBASE_DATASOURCES env var.
 * Returns null if datasource not found.
 */
function getDatasourceCredentials(datasourceId: string): Record<string, any> | null {
    if (!_datasourcesCache) {
        const raw = process.env.FRONTBASE_DATASOURCES || '';
        if (!raw) return null;
        try {
            _datasourcesCache = JSON.parse(raw);
        } catch {
            console.error('[Data Execute] Invalid FRONTBASE_DATASOURCES JSON');
            return null;
        }
    }
    return _datasourcesCache?.[datasourceId] || null;
}

/**
 * Build the real HTTP request from datasource credentials + query config.
 * This runs server-side — credentials never reach the client.
 */
function buildProxyRequest(
    datasourceId: string,
    queryConfig: Record<string, any>,
    body: Record<string, any> | undefined,
): { url: string; headers: Record<string, string>; body: any } | null {
    const creds = getDatasourceCredentials(datasourceId);
    if (!creds) {
        console.error(`[Data Execute] No credentials found for datasource: ${datasourceId}`);
        return null;
    }

    const dsType = creds.type || 'unknown';

    if (dsType === 'neon') {
        const httpUrl = creds.httpUrl || creds.apiUrl || '';
        const apiKey = creds.apiKey || '';
        return {
            url: `${httpUrl}/sql`,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: body || { query: queryConfig.sql || '', params: [] },
        };
    }

    if (dsType === 'turso') {
        const httpUrl = creds.httpUrl || creds.apiUrl || '';
        const authToken = creds.apiKey || creds.authToken || '';
        return {
            url: `${httpUrl}/v2/pipeline`,
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: body || { statements: [{ q: queryConfig.sql || '' }] },
        };
    }

    if (dsType === 'planetscale') {
        const httpUrl = creds.httpUrl || creds.apiUrl || '';
        const auth = creds.apiKey || '';
        return {
            url: `${httpUrl}/query`,
            headers: {
                'Authorization': auth,
                'Content-Type': 'application/json',
            },
            body: body || { query: queryConfig.sql || '' },
        };
    }

    if (dsType === 'mysql' || dsType === 'postgres') {
        // Generic SQL — use connection string via HTTP adapter if available
        const httpUrl = creds.httpUrl || creds.apiUrl || '';
        const apiKey = creds.apiKey || '';
        if (httpUrl) {
            return {
                url: `${httpUrl}/sql`,
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: body || { query: queryConfig.sql || '', params: [] },
            };
        }
        console.error(`[Data Execute] No HTTP URL for ${dsType} datasource: ${datasourceId}`);
        return null;
    }

    console.error(`[Data Execute] Unsupported datasource type: ${dsType}`);
    return null;
}

/**
 * Resolve {{ENV_VAR}} placeholders in a string (legacy support for direct strategy)
 */
function resolveEnvVars(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return process.env[key] || '';
    });
}

/**
 * Get value from object by dot-notation or bracket path (e.g., "rows", "results[0].data")
 */
function getByPath(obj: any, path: string): any {
    if (!path) return obj;

    // Handle array notation like "results[0].rows"
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');

    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }
    return current;
}

/**
 * Flatten nested relation objects to "table.column" format
 * Example: { id: 1, countries: { flag: "🇫🇷" } } -> { id: 1, "countries.flag": "🇫🇷" }
 * 
 * NOTE: Skip primitive values (strings, numbers) - they don't need flattening
 * and Object.entries on strings returns character-by-character which breaks data.
 */
function flattenRelations(data: any[]): any[] {
    return data.map(record => {
        // Skip primitive values - they don't need flattening
        // This prevents Object.entries("Australia") returning [["0","A"],["1","u"],...]
        if (record === null || record === undefined) return record;
        if (typeof record !== 'object') return record;  // strings, numbers, booleans
        if (Array.isArray(record)) return record;

        const flat: Record<string, any> = {};
        for (const [key, value] of Object.entries(record)) {
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                // Nested object - flatten it
                for (const [subKey, subValue] of Object.entries(value as Record<string, any>)) {
                    flat[`${key}.${subKey}`] = subValue;
                }
            } else {
                flat[key] = value;
            }
        }
        return flat;
    });
}

/**
 * Execute a pre-computed DataRequest and return the data with count.
 * For proxy strategy: resolves credentials server-side from FRONTBASE_DATASOURCES.
 * For direct strategy: uses the URL/headers as-is (Supabase anonKey is public).
 */
async function executeDataRequest(dataRequest: DataRequest): Promise<{ data: any[]; total: number | null }> {
    let url: string;
    let headers: Record<string, string> = {};
    let body = dataRequest.body;

    const isProxy = dataRequest.fetchStrategy === 'proxy' && dataRequest.datasourceId;

    if (isProxy) {
        // Proxy: resolve credentials server-side
        const proxyReq = buildProxyRequest(
            dataRequest.datasourceId!,
            (dataRequest.queryConfig || {}) as Record<string, any>,
            dataRequest.body as Record<string, any> | undefined,
        );
        if (!proxyReq) {
            throw new Error(`Cannot resolve credentials for datasource: ${dataRequest.datasourceId}`);
        }
        url = proxyReq.url;
        headers = proxyReq.headers;
        body = proxyReq.body;
    } else {
        // Direct: use URL/headers as-is (may contain env var templates for legacy)
        url = resolveEnvVars(dataRequest.url);
        for (const [key, value] of Object.entries(dataRequest.headers || {})) {
            headers[key] = resolveEnvVars(value);
        }
    }

    console.log(`[Data Execute] ${isProxy ? 'Proxy' : 'Direct'}: ${url.substring(0, 100)}...`);

    // Generate cache key from URL + body hash
    const cacheKey = `data:${url}:${body ? JSON.stringify(body) : ''}`;
    const cacheTTL = 60; // 60 seconds default

    // Try to use Redis cache if available
    try {
        const redis = getRedis();
        return await cached<{ data: any[]; total: number | null }>(cacheKey, async () => {
            return await executeDataRequestUncached(dataRequest, url, headers, body);
        }, cacheTTL);
    } catch (e) {
        // Redis not initialized or cache error - fetch directly
        if ((e as Error).message?.includes('not initialized')) {
            // Silent - Redis just not configured
        } else {
            console.warn('[Data Execute] Redis cache error, falling back to direct fetch:', e);
        }
    }

    // No Redis or cache error - fetch directly
    return await executeDataRequestUncached(dataRequest, url, headers, body);
}

/**
 * Execute the actual HTTP request (uncached)
 */
async function executeDataRequestUncached(
    dataRequest: DataRequest,
    url: string,
    headers: Record<string, string>,
    resolvedBody?: any,
): Promise<{ data: any[]; total: number | null }> {

    // Use resolved body (from proxy credential resolution) or fall back to dataRequest.body
    const body = resolvedBody !== undefined ? resolvedBody : dataRequest.body;

    // Build fetch options
    const fetchOptions: RequestInit = {
        method: dataRequest.method || 'GET',
        headers,
    };

    // Add body for POST requests
    if (body && dataRequest.method === 'POST') {
        fetchOptions.body = JSON.stringify(body);
        // Debug: log filters if present
        if (body.filters && Array.isArray(body.filters) && body.filters.length > 0) {
            console.log(`[Data Execute] Filters:`, JSON.stringify(body.filters));
        }
    }

    // Execute HTTP request
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    // Extract total count from PostgREST content-range header
    // Format: "0-19/620" or "0-19/*" (if count=estimated)
    let total: number | null = null;
    const contentRange = response.headers.get('content-range');
    if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/);
        if (match) {
            total = parseInt(match[1], 10);
        }
    }

    const json = await response.json();

    // Extract data from result path
    let data = getByPath(json, dataRequest.resultPath || '');

    // Ensure data is an array
    if (!Array.isArray(data)) {
        data = data ? [data] : [];
    }

    // Flatten nested relations if needed (skip for RPC which returns flat data)
    if (dataRequest.flattenRelations !== false) {
        data = flattenRelations(data);
    }

    // Also check for total in RPC response (frontbase_get_rows returns {rows, total})
    if (total === null && typeof json.total === 'number') {
        total = json.total;
    }

    return { data, total };
}

async function getDefaultDatasource(): Promise<DatasourceConfig | null> {
    if (cachedDatasource) return cachedDatasource;

    try {
        // Get any published page to extract its datasources
        const pages = await stateProvider.listPages();
        if (pages.length > 0) {
            const page = await stateProvider.getPageBySlug(pages[0].slug);
            if (page?.datasources && page.datasources.length > 0) {
                cachedDatasource = page.datasources[0];
                console.log(`[Data API] Using datasource: ${cachedDatasource.name} (${cachedDatasource.type})`);
                return cachedDatasource;
            }
        }
    } catch (error) {
        console.error('[Data API] Error getting datasource:', error);
    }

    return null;
}

// =============================================================================
// GET /api/data/:table - Fetch table data
// =============================================================================

dataRoute.get('/:table', async (c) => {
    const table = c.req.param('table');
    const query = c.req.query();

    try {
        // Parse query parameters
        const columns = query.select?.split(',').map(col => col.trim()) || ['*'];
        const limit = parseInt(query.limit || '100');
        const offset = parseInt(query.offset || '0');
        const orderBy = query.orderBy ? {
            column: query.orderBy,
            direction: (query.order || 'asc') as 'asc' | 'desc',
        } : undefined;

        console.log(`[Data API] Querying ${table}:`, { columns, limit, offset });

        // Get datasource from published page
        const datasource = await getDefaultDatasource();

        // Query the datasource
        const result = await handleDataQuery(table, {
            columns,
            limit,
            offset,
            orderBy,
        }, datasource || undefined);

        if (result.error) {
            console.error(`[Data API] Error:`, result.error);
            return c.json({
                success: false,
                error: result.error,
            }, 500);
        }

        // Set cache headers
        c.header('Cache-Control', 'public, max-age=60, s-maxage=300');

        return c.json({
            success: true,
            data: result.data,
            count: result.count,
        });

    } catch (error) {
        console.error(`[Data API] Error:`, error);
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});

// =============================================================================
// GET /api/data/:table/:id - Fetch single record
// =============================================================================

dataRoute.get('/:table/:id', async (c) => {
    const table = c.req.param('table');
    const id = c.req.param('id');

    try {
        const datasource = await getDefaultDatasource();

        const result = await handleDataQuery(table, {
            filters: { id },
            limit: 1,
        }, datasource || undefined);

        return c.json({
            success: true,
            data: result.data[0] || null,
        });

    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: null,
        }, 500);
    }
});

// =============================================================================
// POST /api/data/execute - Execute pre-computed DataRequest (Phase 10)
// =============================================================================

dataRoute.post('/execute', async (c) => {
    try {
        const body = await c.req.json();
        const dataRequest = body.dataRequest;

        if (!dataRequest) {
            return c.json({
                success: false,
                error: 'Invalid dataRequest: missing dataRequest object',
            }, 400);
        }

        // Proxy strategy: needs datasourceId (credentials resolved server-side)
        // Direct strategy: needs url (browser fetches directly but SSR uses this)
        const isProxy = dataRequest.fetchStrategy === 'proxy' && dataRequest.datasourceId;
        if (!isProxy && !dataRequest.url) {
            return c.json({
                success: false,
                error: 'Invalid dataRequest: missing url (direct) or datasourceId (proxy)',
            }, 400);
        }

        const label = isProxy
            ? `proxy:${dataRequest.datasourceId}`
            : dataRequest.url?.substring(0, 80);
        console.log(`[Data Execute] Processing: ${label}...`);

        const { data, total } = await executeDataRequest(dataRequest);

        return c.json({
            success: true,
            data,
            count: data.length,
            total: total ?? data.length, // Use server total or fallback to data length
        });

    } catch (error) {
        console.error(`[Data Execute] Error:`, error);
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});

// =============================================================================
// POST /api/data/clear-cache - Clear datasource cache
// =============================================================================

dataRoute.post('/clear-cache', async (c) => {
    cachedDatasource = null;
    _datasourcesCache = null;  // Also invalidate FRONTBASE_DATASOURCES cache
    return c.json({ success: true, message: 'Cache cleared' });
});

