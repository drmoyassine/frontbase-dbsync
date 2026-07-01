import {
  handleDataQuery,
  readWithFallback,
  stableHash
} from "./chunk-EG74I4RR.js";
import {
  getBotProtection,
  getBotProtectionAsync
} from "./chunk-FBOPRGHB.js";
import {
  dispatchByMode,
  isNewMode
} from "./chunk-PXC6Y5ZC.js";
import {
  init_storage,
  stateProvider
} from "./chunk-LMYJ5MDS.js";
import {
  init_IStateProvider,
  isMultiTenantSlug
} from "./chunk-HX3ZZUXN.js";
import {
  cached,
  getRedis,
  init_redis,
  rateLimit
} from "./chunk-TRXWF3US.js";

// src/routes/data.ts
import { Hono } from "hono";
init_storage();
init_IStateProvider();
init_redis();

// src/middleware/rateLimit.ts
init_redis();
async function ipRateLimiter(c, next) {
  const clientIp = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0].trim() || c.req.header("x-real-ip") || "unknown";
  if (clientIp === "unknown") {
    return await next();
  }
  try {
    const minuteTimestamp = Math.floor(Date.now() / 6e4);
    const key = `rate:ip:${clientIp}:${minuteTimestamp}`;
    const { allowed, remaining } = await rateLimit(key, 60, 60);
    if (!allowed) {
      console.warn(`[Edge Rate Limit] Blocked request from IP: ${clientIp}`);
      return c.json({
        error: "TooManyRequests",
        message: "Rate limit exceeded. Maximum 60 requests per minute allowed."
      }, 429);
    }
    c.header("X-RateLimit-IP-Remaining", String(remaining));
  } catch (e) {
  }
  return await next();
}

// src/middleware/captchaVerify.ts
async function verifyCaptchaToken(token, clientIp) {
  try {
    const botConfig = await getBotProtectionAsync();
    if (!botConfig || !botConfig.enabled) {
      return { success: true };
    }
    const { provider, secretKey } = botConfig;
    if (!secretKey) {
      console.warn("[CAPTCHA] Bot protection is enabled but secretKey is missing. Failing open.");
      return { success: true };
    }
    let verifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    if (provider === "recaptcha_v2" || provider === "recaptcha_v3") {
      verifyUrl = "https://www.google.com/recaptcha/api/siteverify";
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3e3);
    try {
      const formData = new URLSearchParams();
      formData.append("secret", secretKey);
      formData.append("response", token);
      formData.append("remoteip", clientIp);
      const response = await fetch(verifyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData.toString(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        console.warn(`[CAPTCHA] Siteverify response error: ${response.status}. Failing open.`);
        return { success: true };
      }
      const result = await response.json();
      if (result && typeof result === "object") {
        if (provider === "recaptcha_v3") {
          const score = typeof result.score === "number" ? result.score : 1;
          if (result.success && score < 0.5) {
            console.warn(`[CAPTCHA] reCAPTCHA v3 blocked request: score ${score} is below threshold 0.5.`);
            return { success: false, error: "Low CAPTCHA score" };
          }
        }
        return {
          success: !!result.success,
          error: result.success ? void 0 : result["error-codes"]?.join(", ") || "Verification failed"
        };
      }
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      console.warn("[CAPTCHA] Verification request timed out or failed. Failing open.", fetchErr.message);
      return { success: true };
    }
  } catch (e) {
    console.error("[CAPTCHA] Unexpected error in verifyCaptchaToken. Failing open.", e);
    return { success: true };
  }
  return { success: true };
}

// src/routes/data.ts
var dataRoute = new Hono();
dataRoute.use("*", ipRateLimiter);
var cachedDatasource = null;
var _datasourcesCache = null;
async function getDatasourceCredentials(datasourceId, tenantSlug) {
  if (isMultiTenantSlug(tenantSlug)) {
    const { getTenantSecret } = await import("./tenantSecrets-VXH6V2NR.js");
    const datasourcesSecret = await getTenantSecret("datasources", tenantSlug);
    if (datasourcesSecret && typeof datasourcesSecret === "object") {
      return datasourcesSecret[datasourceId] || null;
    }
    return null;
  }
  if (!_datasourcesCache) {
    const raw = process.env.FRONTBASE_DATASOURCES || "";
    if (!raw) return null;
    try {
      _datasourcesCache = JSON.parse(raw);
    } catch {
      console.error("[Data Execute] Invalid FRONTBASE_DATASOURCES JSON");
      return null;
    }
  }
  return _datasourcesCache?.[datasourceId] || null;
}
async function buildProxyRequest(datasourceId, queryConfig, body, tenantSlug) {
  const creds = await getDatasourceCredentials(datasourceId, tenantSlug);
  if (!creds) {
    console.error(`[Data Execute] No credentials found for datasource: ${datasourceId}`);
    return null;
  }
  const dsType = creds.type || "unknown";
  if (dsType === "neon") {
    const httpUrl = creds.httpUrl || creds.apiUrl || "";
    const apiKey = creds.apiKey || "";
    return {
      url: `${httpUrl}/sql`,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: body || { query: queryConfig.sql || "", params: [] }
    };
  }
  if (dsType === "turso") {
    const httpUrl = creds.httpUrl || creds.apiUrl || "";
    const authToken = creds.apiKey || creds.authToken || "";
    return {
      url: `${httpUrl}/v2/pipeline`,
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
      },
      body: body || { statements: [{ q: queryConfig.sql || "" }] }
    };
  }
  if (dsType === "planetscale") {
    const httpUrl = creds.httpUrl || creds.apiUrl || "";
    const auth = creds.apiKey || "";
    return {
      url: `${httpUrl}/query`,
      headers: {
        "Authorization": auth,
        "Content-Type": "application/json"
      },
      body: body || { query: queryConfig.sql || "" }
    };
  }
  if (dsType === "mysql" || dsType === "postgres") {
    const httpUrl = creds.httpUrl || creds.apiUrl || "";
    const apiKey = creds.apiKey || "";
    if (httpUrl) {
      return {
        url: `${httpUrl}/sql`,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: body || { query: queryConfig.sql || "", params: [] }
      };
    }
    console.error(`[Data Execute] No HTTP URL for ${dsType} datasource: ${datasourceId}`);
    return null;
  }
  console.error(`[Data Execute] Unsupported datasource type: ${dsType}`);
  return null;
}
function isPrivateUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "localhost.localdomain" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "0.0.0.0") {
      return true;
    }
    if (hostname.endsWith(".local") || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) {
      return true;
    }
    if (/^10\./.test(hostname)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;
    if (/^169\.254\./.test(hostname)) return true;
    if (/^127\./.test(hostname)) return true;
    if (/^0\./.test(hostname)) return true;
    if (hostname.startsWith("[fc") || hostname.startsWith("[fd") || hostname.startsWith("[fe80")) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}
function getByPath(obj, path) {
  if (!path) return obj;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0) return void 0;
    current = current[part];
  }
  return current;
}
function flattenRelations(data) {
  return data.map((record) => {
    if (record === null || record === void 0) return record;
    if (typeof record !== "object") return record;
    if (Array.isArray(record)) return record;
    const flat = {};
    for (const [key, value] of Object.entries(record)) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        for (const [subKey, subValue] of Object.entries(value)) {
          flat[`${key}.${subKey}`] = subValue;
        }
      } else {
        flat[key] = value;
      }
    }
    return flat;
  });
}
async function executeDataRequest(dataRequest, tenantSlug) {
  let url;
  let headers = {};
  let body = dataRequest.body;
  const isProxy = dataRequest.fetchStrategy === "proxy" && dataRequest.datasourceId;
  if (isProxy) {
    const proxyReq = await buildProxyRequest(
      dataRequest.datasourceId,
      dataRequest.queryConfig || {},
      dataRequest.body,
      tenantSlug
    );
    if (!proxyReq) {
      throw new Error(`Cannot resolve credentials for datasource: ${dataRequest.datasourceId}`);
    }
    url = proxyReq.url;
    headers = proxyReq.headers;
    body = proxyReq.body;
  } else {
    url = dataRequest.url;
    for (const [key, value] of Object.entries(dataRequest.headers || {})) {
      headers[key] = value;
    }
  }
  if (isPrivateUrl(url)) {
    console.warn(`[Data Execute] Blocked private URL request to: ${url}`);
    throw new Error(`Access to private URL is blocked: ${url}`);
  }
  console.log(`[Data Execute] ${isProxy ? "Proxy" : "Direct"}: ${url.substring(0, 100)}...`);
  const cacheKey = `data:${url}:${body ? JSON.stringify(body) : ""}`;
  const cacheTTL = 60;
  try {
    const redis = getRedis();
    return await cached(cacheKey, async () => {
      return await executeDataRequestUncached(dataRequest, url, headers, body);
    }, cacheTTL);
  } catch (e) {
    if (e.message?.includes("not initialized")) {
    } else {
      console.warn("[Data Execute] Redis cache error, falling back to direct fetch:", e);
    }
  }
  return await executeDataRequestUncached(dataRequest, url, headers, body);
}
async function executeDataRequestUncached(dataRequest, url, headers, resolvedBody) {
  const body = resolvedBody !== void 0 ? resolvedBody : dataRequest.body;
  const fetchOptions = {
    method: dataRequest.method || "GET",
    headers
  };
  if (body && dataRequest.method === "POST") {
    fetchOptions.body = JSON.stringify(body);
    if (body.filters && Array.isArray(body.filters) && body.filters.length > 0) {
      console.log(`[Data Execute] Filters:`, JSON.stringify(body.filters));
    }
  }
  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
  }
  let total = null;
  const contentRange = response.headers.get("content-range");
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/);
    if (match) {
      total = parseInt(match[1], 10);
    }
  }
  const json = await response.json();
  let data = getByPath(json, dataRequest.resultPath || "");
  if (!Array.isArray(data)) {
    data = data ? [data] : [];
  }
  if (dataRequest.flattenRelations !== false) {
    data = flattenRelations(data);
  }
  if (total === null && typeof json.total === "number") {
    total = json.total;
  }
  return { data, total };
}
async function getDefaultDatasource(tenantSlug) {
  if (!isMultiTenantSlug(tenantSlug) && cachedDatasource) return cachedDatasource;
  try {
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
    console.error("[Data API] Error getting datasource:", error);
  }
  return null;
}
dataRoute.get("/:table", async (c) => {
  const table = c.req.param("table");
  const query = c.req.query();
  try {
    const columns = query.select?.split(",").map((col) => col.trim()) || ["*"];
    const limit = parseInt(query.limit || "100");
    const offset = parseInt(query.offset || "0");
    const orderBy = query.orderBy ? {
      column: query.orderBy,
      direction: query.order || "asc"
    } : void 0;
    console.log(`[Data API] Querying ${table}:`, { columns, limit, offset });
    const tenantSlug = c.get("tenantSlug");
    const datasource = await getDefaultDatasource(tenantSlug);
    const result = await handleDataQuery(table, {
      columns,
      limit,
      offset,
      orderBy
    }, datasource || void 0, tenantSlug);
    if (result.error) {
      console.error(`[Data API] Error:`, result.error);
      return c.json({
        success: false,
        error: result.error
      }, 500);
    }
    if (result._stale) {
      c.header("X-Fb-Cache", "stale");
    }
    c.header("Cache-Control", "public, max-age=60, s-maxage=300");
    return c.json({
      success: true,
      data: result.data,
      count: result.count
    });
  } catch (error) {
    console.error(`[Data API] Error:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});
dataRoute.get("/:table/:id", async (c) => {
  const table = c.req.param("table");
  const id = c.req.param("id");
  try {
    const tenantSlug = c.get("tenantSlug");
    const datasource = await getDefaultDatasource(tenantSlug);
    const result = await handleDataQuery(table, {
      filters: { id },
      limit: 1
    }, datasource || void 0, tenantSlug);
    if (result._stale) {
      c.header("X-Fb-Cache", "stale");
    }
    return c.json({
      success: true,
      data: result.data[0] || null
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null
    }, 500);
  }
});
dataRoute.post("/execute", async (c) => {
  try {
    const body = await c.req.json();
    const dataRequest = body.dataRequest;
    const tenantSlug = c.get("tenantSlug");
    if (!dataRequest) {
      return c.json({
        success: false,
        error: "Invalid dataRequest: missing dataRequest object"
      }, 400);
    }
    const isProxy = dataRequest.fetchStrategy === "proxy" && dataRequest.datasourceId;
    if (!isProxy && !dataRequest.url) {
      return c.json({
        success: false,
        error: "Invalid dataRequest: missing url (direct) or datasourceId (proxy)"
      }, 400);
    }
    if (isProxy && dataRequest.datasourceId) {
      const isAuthorized = await stateProvider.isDatasourceAuthorized(dataRequest.datasourceId, tenantSlug);
      if (!isAuthorized) {
        console.warn(`[Data Execute] Unauthorized access attempt: tenantSlug='${tenantSlug}', datasourceId='${dataRequest.datasourceId}'`);
        return c.json({
          success: false,
          error: "Unauthorized access to this datasource"
        }, 403);
      }
    }
    const botConfig = getBotProtection();
    if (botConfig && botConfig.enabled && dataRequest.method === "POST") {
      const captchaToken = body.captchaToken || c.req.header("x-captcha-token") || "";
      if (!captchaToken) {
        return c.json({ success: false, error: "CAPTCHA required for write operations" }, 403);
      }
      const clientIp = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0].trim() || c.req.header("x-real-ip") || "unknown";
      const result = await verifyCaptchaToken(captchaToken, clientIp);
      if (!result.success) {
        return c.json({ success: false, error: result.error || "CAPTCHA verification failed" }, 403);
      }
    }
    const label = isProxy ? `proxy:${dataRequest.datasourceId}` : dataRequest.url?.substring(0, 80);
    console.log(`[Data Execute] Processing: ${label}...`);
    let data;
    let total;
    if (isNewMode(dataRequest)) {
      const result = await dispatchByMode(dataRequest, tenantSlug);
      data = result.data;
      total = result.total;
    } else if ((dataRequest.method || "GET").toUpperCase() === "GET") {
      const key = `exec:lastgood:${tenantSlug || "default"}:${stableHash(dataRequest)}`;
      const { value, stale } = await readWithFallback(
        key,
        () => executeDataRequest(dataRequest, tenantSlug),
        () => false
        // executeDataRequest signals failure by throwing, not a field
      );
      data = value.data;
      total = value.total;
      if (stale) c.header("X-Fb-Cache", "stale");
    } else {
      const result = await executeDataRequest(dataRequest, tenantSlug);
      data = result.data;
      total = result.total;
    }
    return c.json({
      success: true,
      data,
      count: data.length,
      total: total ?? data.length
      // Use server total or fallback to data length
    });
  } catch (error) {
    console.error(`[Data Execute] Error:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});
dataRoute.post("/clear-cache", async (c) => {
  cachedDatasource = null;
  _datasourcesCache = null;
  const { clearAllTenantSecretsCache } = await import("./tenantSecrets-VXH6V2NR.js");
  clearAllTenantSecretsCache();
  return c.json({ success: true, message: "Cache cleared" });
});

export {
  ipRateLimiter,
  verifyCaptchaToken,
  dataRoute,
  executeDataRequest
};
