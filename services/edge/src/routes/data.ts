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
import { readWithFallback, stableHash } from '../db/fallback';
import { stateProvider } from '../storage/index.js';
import { isMultiTenantSlug } from '../storage/IStateProvider.js';
import { getRedis, cached } from '../cache/redis.js';
import type { DatasourceConfig, DataRequest } from '../schemas/publish';
import { ipRateLimiter } from '../middleware/rateLimit.js';
import { getBotProtection } from '../config/securityConfig.js';
import { verifyCaptchaToken } from '../middleware/captchaVerify.js';
import { isNewMode, dispatchByMode } from '../engine/queryDispatch.js';

export const dataRoute = new Hono();
dataRoute.use('*', ipRateLimiter);

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
 * SSRF Mitigation: Checks if a URL points to a private, loopback, or local address.
 */
function isPrivateUrl(urlStr: string): boolean {
    try {
        const parsed = new URL(urlStr);
        const hostname = parsed.hostname.toLowerCase();

        // 1. Check exact names
        if (
            hostname === 'localhost' ||
            hostname === 'localhost.localdomain' ||
            hostname === '127.0.0.1' ||
            hostname === '[::1]' ||
            hostname === '0.0.0.0'
        ) {
            return true;
        }

        // 2. Check if host ends with local domains
        if (hostname.endsWith('.local') || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
            return true;
        }

        // 3. IPv4 Regex checking for private ranges
        // 10.x.x.x
        if (/^10\./.test(hostname)) return true;
        // 172.16.x.x - 172.31.x.x
        if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return true;
        // 192.168.x.x
        if (/^192\.168\./.test(hostname)) return true;
        // 169.254.x.x (link-local/metadata)
        if (/^169\.254\./.test(hostname)) return true;
        // 127.x.x.x (loopback)
        if (/^127\./.test(hostname)) return true;
        // 0.x.x.x
        if (/^0\./.test(hostname)) return true;

        // IPv6 Check
        if (hostname.startsWith('[fc') || hostname.startsWith('[fd') || hostname.startsWith('[fe80')) {
            return true;
        }

        return false;
    } catch {
        return true; // If invalid URL, block it by default
    }
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
export async function executeDataRequest(dataRequest: DataRequest): Promise<{ data: any[]; total: number | null }> {
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
        // Direct: use URL/headers as-is (no environment variable resolution to prevent secrets leak)
        url = dataRequest.url;
        for (const [key, value] of Object.entries(dataRequest.headers || {})) {
            headers[key] = value;
        }
    }

    // SSRF Mitigation: Block private/local IP ranges and local hostnames
    if (isPrivateUrl(url)) {
        console.warn(`[Data Execute] Blocked private URL request to: ${url}`);
        throw new Error(`Access to private URL is blocked: ${url}`);
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

async function getDefaultDatasource(tenantSlug?: string): Promise<DatasourceConfig | null> {
    // Only use module-level cache for single-tenant (non-cloud) deployments
    if (!isMultiTenantSlug(tenantSlug) && cachedDatasource) return cachedDatasource;

    try {
        // Get any published page to extract its datasources (tenant-scoped)
        const pages = await stateProvider.listPages(tenantSlug);
        if (pages.length > 0) {
            const page = await stateProvider.getPageBySlug(pages[0].slug, tenantSlug);
            if (page?.datasources && page.datasources.length > 0) {
                if (!isMultiTenantSlug(tenantSlug)) {
                    cachedDatasource = page.datasources[0];
                }
                console.log(`[Data API] Using datasource: ${page.datasources[0].name} (${page.datasources[0].type})`);
                return page.datasources[0];
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
        const tenantSlug = (c as any).get('tenantSlug') as string | undefined;
        const datasource = await getDefaultDatasource(tenantSlug);

        // Query the datasource
        const result = await handleDataQuery(table, {
            columns,
            limit,
            offset,
            orderBy,
        }, datasource || undefined, tenantSlug);

        if (result.error) {
            console.error(`[Data API] Error:`, result.error);
            return c.json({
                success: false,
                error: result.error,
            }, 500);
        }

        // Sprint 2A: served from the stale fallback cache (datasource was unreachable)
        if ((result as any)._stale) {
            c.header('X-Fb-Cache', 'stale');
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
        const tenantSlug = (c as any).get('tenantSlug') as string | undefined;
        const datasource = await getDefaultDatasource(tenantSlug);

        const result = await handleDataQuery(table, {
            filters: { id },
            limit: 1,
        }, datasource || undefined, tenantSlug);

        if ((result as any)._stale) {
            c.header('X-Fb-Cache', 'stale');
        }

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
        const tenantSlug = (c as any).get('tenantSlug') as string | undefined;

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

        // V1 Critical Fix: Verify datasource ownership before execution
        if (isProxy && dataRequest.datasourceId) {
            const isAuthorized = await stateProvider.isDatasourceAuthorized(dataRequest.datasourceId, tenantSlug);
            if (!isAuthorized) {
                console.warn(`[Data Execute] Unauthorized access attempt: tenantSlug='${tenantSlug}', datasourceId='${dataRequest.datasourceId}'`);
                return c.json({
                    success: false,
                    error: 'Unauthorized access to this datasource',
                }, 403);
            }
        }

        // CAPTCHA Enforcement for write (POST) requests
        const botConfig = getBotProtection();
        if (botConfig && botConfig.enabled && dataRequest.method === 'POST') {
            const captchaToken = body.captchaToken || c.req.header('x-captcha-token') || '';
            if (!captchaToken) {
                return c.json({ success: false, error: 'CAPTCHA required for write operations' }, 403);
            }
            const clientIp = c.req.header('cf-connecting-ip') || 
                             c.req.header('x-forwarded-for')?.split(',')[0].trim() || 
                             c.req.header('x-real-ip') || 'unknown';
            const result = await verifyCaptchaToken(captchaToken, clientIp);
            if (!result.success) {
                return c.json({ success: false, error: result.error || 'CAPTCHA verification failed' }, 403);
            }
        }

        const label = isProxy
            ? `proxy:${dataRequest.datasourceId}`
            : dataRequest.url?.substring(0, 80);
        console.log(`[Data Execute] Processing: ${label}...`);

        // Phase 0: route explicit contract modes (proxy-rpc/proxy-sql/proxy-http)
        // to the structured-query dispatch. Legacy direct/proxy stays unchanged.
        let data: unknown[];
        let total: number | null;
        if (isNewMode(dataRequest)) {
            const result = await dispatchByMode(dataRequest, tenantSlug);
            data = result.data;
            total = result.total;
        } else if ((dataRequest.method || 'GET').toUpperCase() === 'GET') {
            // Sprint 2A: read-through stale fallback for reads only (never writes)
            // Tenant-isolated: prefix key with tenantSlug to prevent cross-tenant leakage.
            const key = `exec:lastgood:${tenantSlug || 'default'}:${stableHash(dataRequest)}`;
            const { value, stale } = await readWithFallback(
                key,
                () => executeDataRequest(dataRequest),
                () => false, // executeDataRequest signals failure by throwing, not a field
            );
            data = value.data;
            total = value.total;
            if (stale) c.header('X-Fb-Cache', 'stale');
        } else {
            const result = await executeDataRequest(dataRequest);
            data = result.data;
            total = result.total;
        }

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

