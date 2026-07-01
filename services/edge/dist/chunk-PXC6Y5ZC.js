import {
  init_IStateProvider,
  isMultiTenantSlug
} from "./chunk-HX3ZZUXN.js";
import {
  cached,
  init_redis
} from "./chunk-TRXWF3US.js";

// src/engine/proxyHttp.ts
init_redis();
init_IStateProvider();
var _datasourcesCache = null;
async function getDatasourceCredentials(datasourceId, tenantSlug) {
  const normalized = tenantSlug ?? void 0;
  if (isMultiTenantSlug(normalized)) {
    const { getTenantSecret } = await import("./tenantSecrets-VXH6V2NR.js");
    const blob = await getTenantSecret("datasources", normalized);
    if (blob && typeof blob === "object") {
      return blob[datasourceId] || null;
    }
    return null;
  }
  if (!_datasourcesCache) {
    const raw = process.env.FRONTBASE_DATASOURCES || "";
    if (!raw) return null;
    try {
      _datasourcesCache = JSON.parse(raw);
    } catch {
      console.error("[proxy-http] Invalid FRONTBASE_DATASOURCES JSON");
      return null;
    }
  }
  return _datasourcesCache?.[datasourceId] || null;
}
function pickAction(body) {
  if (body && typeof body === "object") {
    if (body.action === "insert" || body.action === "update" || body.action === "delete" || body.action === "ping" || body.action === "schema") {
      return body.action;
    }
    const spec = body.query;
    if (spec?.kind === "aggregate") return "aggregate";
  }
  return "rows";
}
async function executeProxyHttp(req, opts = {}) {
  const datasourceId = req.datasourceId;
  if (!datasourceId) throw new Error("proxy-http: missing datasourceId");
  const creds = await getDatasourceCredentials(datasourceId, req.tenantSlug);
  if (!creds) throw new Error(`proxy-http: no credentials for datasource ${datasourceId}`);
  const url = creds.webAppUrl || creds.apiUrl;
  const secret = creds.webAppSecret || creds.secret;
  if (!url) throw new Error(`proxy-http: datasource ${datasourceId} has no webAppUrl`);
  const body = req.body || {};
  const action = pickAction(body);
  const payload = { secret, action };
  if (action === "rows" || action === "aggregate") payload.query = body.query ?? body;
  if (action === "insert") {
    payload.table = body.table;
    payload.records = body.records;
  }
  if (action === "update") {
    payload.table = body.table;
    payload.match = body.match;
    payload.patch = body.patch;
  }
  if (action === "delete") {
    payload.table = body.table;
    payload.match = body.match;
  }
  const fetchImpl = opts.fetchImpl || fetch;
  const cacheKey = `proxy-http:${datasourceId}:${action}:${JSON.stringify(payload)}`;
  const ttl = 60;
  const run = async () => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow"
      // GAS web apps 302 → script.googleusercontent.com
    });
    if (!response.ok) {
      throw new Error(`proxy-http: Web App returned ${response.status}`);
    }
    const json = await response.json();
    if (action === "aggregate") {
      return { data: json || [], total: null };
    }
    const rows = json.rows ?? json.data ?? [];
    const total = typeof json.total === "number" ? json.total : Array.isArray(rows) ? rows.length : 0;
    return { data: Array.isArray(rows) ? rows : [], total };
  };
  return cached(cacheKey, run, ttl);
}

// src/db/queryBuilder.ts
var PLACEHOLDER = {
  mysql: () => "?",
  sqlite: (i) => `$${i}`
};
function quoteIdent(name, dialect) {
  const cleaned = name.replace(/["`]/g, "");
  if (dialect === "mysql") return "`" + cleaned + "`";
  return '"' + cleaned + '"';
}
function toParam(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}
function buildWhere(filters, dialect) {
  if (!filters.length) return { clause: "", params: [] };
  const ph = PLACEHOLDER[dialect];
  const conditions = [];
  const params = [];
  for (const f of filters) {
    const col = quoteIdent(f.column, dialect);
    const op = (f.op || "eq").toLowerCase();
    const cast = (s) => dialect === "sqlite" ? `CAST(${col} AS TEXT) ${s}` : `CAST(${col} AS CHAR) ${s}`;
    const push = (sqlFragment, value) => {
      if (value === void 0) {
        conditions.push(sqlFragment);
      } else {
        params.push(toParam(value));
        conditions.push(sqlFragment.replace("${p}", ph(params.length)));
      }
    };
    switch (op) {
      case "eq":
      case "equals":
      case "=":
        push(`${cast("=")} \${p}`, f.value);
        break;
      case "neq":
      case "not_equals":
      case "!=":
        push(`${col} IS DISTINCT FROM \${p}`, f.value);
        break;
      case "gt":
      case ">":
        push(`${col} > \${p}`, f.value);
        break;
      case "gte":
      case ">=":
        push(`${col} >= \${p}`, f.value);
        break;
      case "lt":
      case "<":
        push(`${col} < \${p}`, f.value);
        break;
      case "lte":
      case "<=":
        push(`${col} <= \${p}`, f.value);
        break;
      case "contains":
        push(`${cast("LIKE")} \${p}`, `%${f.value}%`);
        break;
      case "not_contains":
        push(`${cast("NOT LIKE")} \${p}`, `%${f.value}%`);
        break;
      case "starts_with":
        push(`${cast("LIKE")} \${p}`, `${f.value}%`);
        break;
      case "ends_with":
        push(`${cast("LIKE")} \${p}`, `%${f.value}`);
        break;
      case "is_null":
        conditions.push(`${col} IS NULL`);
        break;
      case "not_null":
        conditions.push(`${col} IS NOT NULL`);
        break;
      case "is_empty":
        conditions.push(`(${col} IS NULL OR ${cast("=")} '')`);
        break;
      case "is_not_empty":
        conditions.push(`(${col} IS NOT NULL AND ${cast("!=")} '')`);
        break;
      case "in": {
        const vals = Array.isArray(f.value) ? f.value : String(f.value).split(",").map((s) => s.trim()).filter(Boolean);
        if (!vals.length) break;
        const realPhs = [];
        for (const v of vals) {
          params.push(toParam(v));
          realPhs.push(ph(params.length));
        }
        conditions.push(`${cast("IN")} (${realPhs.join(", ")})`);
        break;
      }
      default:
        break;
    }
  }
  if (!conditions.length) return { clause: "", params: [] };
  return { clause: "WHERE " + conditions.join(" AND "), params };
}
function buildRowsQuery(q, dialect, tablePrefix) {
  const table = quoteIdent(q.table, dialect);
  const cols = q.columns && q.columns !== "*" ? q.columns : `${table}.*`;
  const { clause, params } = buildWhere(q.filters, dialect);
  let sql = `SELECT ${cols} FROM ${table}`;
  if (clause) sql += ` ${clause}`;
  if (q.sort && q.sort.column) {
    sql += ` ORDER BY ${quoteIdent(q.sort.column, dialect)} ${q.sort.direction === "desc" ? "DESC" : "ASC"}`;
  }
  const pageSize = Math.max(q.pageSize || 100, 1);
  const offset = Math.max(q.page || 0, 0) * pageSize;
  const ph = PLACEHOLDER[dialect];
  sql += ` LIMIT ${ph(params.length + 1)}`;
  params.push(pageSize);
  sql += ` OFFSET ${ph(params.length + 1)}`;
  params.push(offset);
  void tablePrefix;
  return { sql, params };
}
function buildAggregateQuery(q, dialect) {
  const table = quoteIdent(q.table, dialect);
  const cat = quoteIdent(q.category, dialect);
  const { clause, params } = buildWhere(q.filters, dialect);
  const ph = PLACEHOLDER[dialect];
  const valExpr = q.aggregation === "count" ? "COUNT(*)" : q.aggregation === "sum" ? `SUM(CAST(${q.value ? quoteIdent(q.value, dialect) : "*"} AS DECIMAL(65,4)))` : q.aggregation === "average" ? `AVG(CAST(${q.value ? quoteIdent(q.value, dialect) : "*"} AS DECIMAL(65,4)))` : q.aggregation === "min" ? `MIN(CAST(${q.value ? quoteIdent(q.value, dialect) : "*"} AS DECIMAL(65,4)))` : `MAX(CAST(${q.value ? quoteIdent(q.value, dialect) : "*"} AS DECIMAL(65,4)))`;
  let sql = `SELECT ${cat} AS category, ${valExpr} AS value FROM ${table}`;
  if (clause) sql += ` ${clause}`;
  sql += ` GROUP BY ${cat}`;
  if (q.sort === "asc") sql += " ORDER BY value ASC";
  else if (q.sort === "desc") sql += " ORDER BY value DESC";
  sql += ` LIMIT ${ph(params.length + 1)}`;
  params.push(q.limit || 10);
  return { sql, params };
}

// src/engine/proxySql.ts
init_redis();
init_IStateProvider();
var _datasourcesCache2 = null;
async function getDatasourceCredentials2(datasourceId, tenantSlug) {
  const normalized = tenantSlug ?? void 0;
  if (isMultiTenantSlug(normalized)) {
    const { getTenantSecret } = await import("./tenantSecrets-VXH6V2NR.js");
    const blob = await getTenantSecret("datasources", normalized);
    if (blob && typeof blob === "object") {
      return blob[datasourceId] || null;
    }
    return null;
  }
  if (!_datasourcesCache2) {
    const raw = process.env.FRONTBASE_DATASOURCES || "";
    if (!raw) return null;
    try {
      _datasourcesCache2 = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return _datasourcesCache2?.[datasourceId] || null;
}
function dialectOf(creds) {
  const t = (creds.type || "").toLowerCase();
  return t === "turso" || t === "sqlite" ? "sqlite" : "mysql";
}
function buildFromSpec(spec, dialect) {
  return spec.kind === "aggregate" ? buildAggregateQuery(spec, dialect) : buildRowsQuery(spec, dialect);
}
function mapMysqlResult(rows) {
  return { data: Array.isArray(rows) ? rows : [], total: Array.isArray(rows) ? rows.length : 0 };
}
async function executeProxySql(req, opts = {}) {
  const datasourceId = req.datasourceId;
  if (!datasourceId) throw new Error("proxy-sql: missing datasourceId");
  const creds = await getDatasourceCredentials2(datasourceId, req.tenantSlug);
  if (!creds) throw new Error(`proxy-sql: no credentials for datasource ${datasourceId}`);
  const httpUrl = creds.httpUrl || creds.apiUrl;
  if (!httpUrl) throw new Error(`proxy-sql: datasource ${datasourceId} has no httpUrl`);
  const body = req.body || {};
  const spec = body.query ?? body.spec ?? body;
  if (!spec || spec.kind !== "rows" && spec.kind !== "aggregate") {
    throw new Error("proxy-sql: body must contain a RowsQuery or AggregateQuery");
  }
  const dialect = dialectOf(creds);
  const built = buildFromSpec(spec, dialect);
  const token = creds.apiKey || creds.authToken;
  const fetchImpl = opts.fetchImpl || fetch;
  const cacheKey = `proxy-sql:${datasourceId}:${built.sql}:${JSON.stringify(built.params)}`;
  const run = async () => {
    const response = await fetchImpl(`${httpUrl}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...token ? { "Authorization": `Bearer ${token}` } : {}
      },
      body: JSON.stringify({ query: built.sql, params: built.params })
    });
    if (!response.ok) throw new Error(`proxy-sql: datasource returned ${response.status}`);
    const json = await response.json();
    const rows = json.rows ?? json.data ?? [];
    return mapMysqlResult(rows);
  };
  return cached(cacheKey, run, 60);
}

// src/engine/proxyRpc.ts
init_redis();
init_IStateProvider();
var _datasourcesCache3 = null;
async function getDatasourceCredentials3(datasourceId, tenantSlug) {
  const normalized = tenantSlug ?? void 0;
  if (isMultiTenantSlug(normalized)) {
    const { getTenantSecret } = await import("./tenantSecrets-VXH6V2NR.js");
    const blob = await getTenantSecret("datasources", normalized);
    if (blob && typeof blob === "object") {
      return blob[datasourceId] || null;
    }
    return null;
  }
  if (!_datasourcesCache3) {
    const raw = process.env.FRONTBASE_DATASOURCES || "";
    if (!raw) return null;
    try {
      _datasourcesCache3 = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return _datasourcesCache3?.[datasourceId] || null;
}
function rowsArgs(q) {
  return [
    q.table,
    q.columns || "*",
    JSON.stringify(q.joins || []),
    q.sort?.column || null,
    q.sort?.direction || "asc",
    (q.page || 0) + 1,
    // RPC is 1-based
    q.pageSize || 100,
    JSON.stringify(q.filters || [])
  ];
}
function aggregateArgs(q) {
  return [q.table, q.category, q.aggregation, q.value || null, JSON.stringify(q.filters || []), q.sort || "none", q.limit || 10];
}
function buildCall(spec) {
  if (spec.kind === "aggregate") {
    const params2 = aggregateArgs(spec);
    const placeholders2 = params2.map((_, i) => `$${i + 1}`).join(", ");
    return { sql: `SELECT * FROM frontbase_aggregate(${placeholders2})`, params: params2 };
  }
  const params = rowsArgs(spec);
  const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
  return { sql: `SELECT * FROM frontbase_get_rows(${placeholders})`, params };
}
async function executeProxyRpc(req, opts = {}) {
  const datasourceId = req.datasourceId;
  if (!datasourceId) throw new Error("proxy-rpc: missing datasourceId");
  const creds = await getDatasourceCredentials3(datasourceId, req.tenantSlug);
  if (!creds) throw new Error(`proxy-rpc: no credentials for datasource ${datasourceId}`);
  const httpUrl = creds.httpUrl || creds.apiUrl;
  const apiKey = creds.apiKey;
  if (!httpUrl || !apiKey) throw new Error(`proxy-rpc: datasource ${datasourceId} missing httpUrl/apiKey`);
  const body = req.body || {};
  const spec = body.query ?? body.spec ?? body;
  if (!spec || spec.kind !== "rows" && spec.kind !== "aggregate") {
    throw new Error("proxy-rpc: body must contain a RowsQuery or AggregateQuery");
  }
  const call = buildCall(spec);
  const fetchImpl = opts.fetchImpl || fetch;
  const cacheKey = `proxy-rpc:${datasourceId}:${call.sql}:${JSON.stringify(call.params)}`;
  const run = async () => {
    const response = await fetchImpl(`${httpUrl}/sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({ query: call.sql, params: call.params })
    });
    if (!response.ok) throw new Error(`proxy-rpc: datasource returned ${response.status}`);
    const json = await response.json();
    if (spec.kind === "aggregate") {
      const rows2 = json.rows ?? json;
      return { data: Array.isArray(rows2) ? rows2 : [], total: null };
    }
    const rowsObj = json;
    const rows = rowsObj.rows ?? [];
    return { data: Array.isArray(rows) ? rows : [], total: typeof rowsObj.total === "number" ? rowsObj.total : Array.isArray(rows) ? rows.length : 0 };
  };
  return cached(cacheKey, run, 60);
}

// src/engine/queryDispatch.ts
function resolveQueryMode(req) {
  const explicit = req.queryConfig?.mode;
  if (explicit === "direct-rpc" || explicit === "proxy-rpc" || explicit === "proxy-sql" || explicit === "proxy-http") {
    return explicit;
  }
  if (req.fetchStrategy === "direct") return "direct-rpc";
  return "legacy";
}
function isNewMode(req) {
  const mode = resolveQueryMode(req);
  return mode === "proxy-rpc" || mode === "proxy-sql" || mode === "proxy-http";
}
async function dispatchByMode(req, tenantSlug) {
  const mode = resolveQueryMode(req);
  const reqWithTenant = tenantSlug ? { ...req, tenantSlug } : req;
  if (mode === "proxy-http") {
    return executeProxyHttp(reqWithTenant);
  }
  if (mode === "proxy-sql") {
    return executeProxySql(reqWithTenant);
  }
  if (mode === "proxy-rpc") {
    return executeProxyRpc(reqWithTenant);
  }
  throw new Error(
    `Query mode "${mode}" is recognized but not yet fulfilled.`
  );
}

export {
  resolveQueryMode,
  isNewMode,
  dispatchByMode
};
