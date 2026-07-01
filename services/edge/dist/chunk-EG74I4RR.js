import {
  get,
  init_redis,
  set
} from "./chunk-TRXWF3US.js";

// src/db/fallback.ts
init_redis();
var LASTGOOD_TTL = 24 * 60 * 60;
function stableHash(input) {
  const s = typeof input === "string" ? input : safeStringify(input);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) + h + s.charCodeAt(i) | 0;
  }
  return (h >>> 0).toString(36);
}
function safeStringify(input) {
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}
async function readWithFallback(key, read, isError) {
  try {
    const value = await read();
    if (isError(value)) throw new Error("read returned an error state");
    void set(key, value, LASTGOOD_TTL).catch(() => {
    });
    return { value, stale: false };
  } catch (err) {
    const cached = await get(key).catch(() => null);
    if (cached !== null && cached !== void 0) {
      return { value: cached, stale: true };
    }
    throw err;
  }
}

// src/db/identifiers.ts
var IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
function sanitizeIdentifier(name, kind = "identifier") {
  if (typeof name !== "string" || !IDENT_RE.test(name)) {
    throw new Error(`Invalid SQL ${kind}: ${JSON.stringify(String(name).slice(0, 50))}`);
  }
  return name;
}
function sanitizeColumns(columns) {
  if (!columns || columns.length === 0) return ["*"];
  if (columns.length === 1 && columns[0] === "*") return ["*"];
  return columns.map((c) => sanitizeIdentifier(c, "column"));
}

// src/db/datasource-adapter.ts
var SupabaseAdapter = class {
  url;
  anonKey;
  constructor(config) {
    this.url = config.url || process.env.SUPABASE_URL || "";
    this.anonKey = config.anonKey || process.env.SUPABASE_ANON_KEY || "";
  }
  async query(options) {
    const { table, filters = {}, limit = 100, offset = 0 } = options;
    const selectCols = sanitizeColumns(options.columns).join(",");
    const tableName = sanitizeIdentifier(table, "table");
    let url = `${this.url}/rest/v1/${tableName}?select=${encodeURIComponent(selectCols)}`;
    Object.entries(filters).forEach(([key, value]) => {
      url += `&${encodeURIComponent(sanitizeIdentifier(key, "filter column"))}=eq.${encodeURIComponent(String(value))}`;
    });
    url += `&limit=${limit}&offset=${offset}`;
    console.log(`[Supabase] Query URL: ${url}`);
    console.log(`[Supabase] Using key: ${this.anonKey ? this.anonKey.substring(0, 20) + "..." : "MISSING"}`);
    try {
      const authToken = options.accessToken || this.anonKey;
      const response = await fetch(url, {
        headers: {
          "apikey": this.anonKey,
          "Authorization": `Bearer ${authToken}`,
          "Accept": "application/json",
          "Prefer": "count=exact"
        }
      });
      console.log(`[Supabase] Response status: ${response.status}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Supabase] Error response: ${errorText}`);
        throw new Error(`Supabase error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      const count = parseInt(response.headers.get("content-range")?.split("/")[1] || "0");
      console.log(`[Supabase] Returned ${data.length} rows, count: ${count}`);
      return { data, count };
    } catch (error) {
      console.error("[Supabase] Query error:", error);
      return { data: [], error: String(error) };
    }
  }
  async execute(sql, params) {
    return { data: [], error: "Raw SQL not supported via REST" };
  }
  async close() {
  }
};
var NeonAdapter = class {
  connectionString;
  constructor(config) {
    const secretEnvVar = config.secretEnvVar || "NEON_DATABASE_URL";
    this.connectionString = config.url || process.env[secretEnvVar] || "";
  }
  async query(options) {
    const { table, filters = {}, limit = 100, offset = 0 } = options;
    const selectCols = sanitizeColumns(options.columns).join(", ");
    const tableName = sanitizeIdentifier(table, "table");
    let sql = `SELECT ${selectCols} FROM ${tableName}`;
    const whereConditions = Object.entries(filters).map(
      ([key, value]) => `${sanitizeIdentifier(key, "filter column")} = '${String(value).replace(/'/g, "''")}'`
    );
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(" AND ")}`;
    }
    sql += ` LIMIT ${limit} OFFSET ${offset}`;
    return this.execute(sql);
  }
  async execute(sql, params) {
    try {
      const { neon } = await import("@neondatabase/serverless");
      const sqlClient = neon(this.connectionString);
      const result = await sqlClient.call(null, [sql], ...params || []);
      return { data: result };
    } catch (error) {
      console.error("[Neon] Query error:", error);
      return { data: [], error: String(error) };
    }
  }
  async close() {
  }
};
var PlanetScaleAdapter = class {
  connectionString;
  constructor(config) {
    const secretEnvVar = config.secretEnvVar || "PLANETSCALE_DATABASE_URL";
    this.connectionString = config.url || process.env[secretEnvVar] || "";
  }
  async query(options) {
    const { table, filters = {}, limit = 100, offset = 0 } = options;
    const selectCols = sanitizeColumns(options.columns).join(", ");
    const tableName = sanitizeIdentifier(table, "table");
    let sql = `SELECT ${selectCols} FROM \`${tableName}\``;
    const whereConditions = Object.entries(filters).map(
      ([key, value]) => `\`${sanitizeIdentifier(key, "filter column")}\` = '${String(value).replace(/'/g, "''")}'`
    );
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(" AND ")}`;
    }
    sql += ` LIMIT ${limit} OFFSET ${offset}`;
    return this.execute(sql);
  }
  async execute(sql, params) {
    try {
      const { connect } = await import("@planetscale/database");
      const conn = connect({ url: this.connectionString });
      const result = await conn.execute(sql, params);
      return { data: result.rows };
    } catch (error) {
      console.error("[PlanetScale] Query error:", error);
      return { data: [], error: String(error) };
    }
  }
  async close() {
  }
};
var TursoAdapter = class {
  url;
  authToken;
  constructor(config) {
    const secretEnvVar = config.secretEnvVar || "TURSO_AUTH_TOKEN";
    this.url = config.url || process.env.TURSO_DATABASE_URL || "";
    this.authToken = process.env[secretEnvVar] || "";
  }
  async query(options) {
    const { table, filters = {}, limit = 100, offset = 0 } = options;
    const selectCols = sanitizeColumns(options.columns).join(", ");
    const tableName = sanitizeIdentifier(table, "table");
    let sql = `SELECT ${selectCols} FROM "${tableName}"`;
    const whereConditions = Object.entries(filters).map(
      ([key, value]) => `"${sanitizeIdentifier(key, "filter column")}" = '${String(value).replace(/'/g, "''")}'`
    );
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(" AND ")}`;
    }
    sql += ` LIMIT ${limit} OFFSET ${offset}`;
    return this.execute(sql);
  }
  async execute(sql, params) {
    try {
      const { createClient } = await import("@libsql/client");
      const client = createClient({
        url: this.url,
        authToken: this.authToken
      });
      const result = await client.execute(sql);
      return { data: result.rows };
    } catch (error) {
      console.error("[Turso] Query error:", error);
      return { data: [], error: String(error) };
    }
  }
  async close() {
  }
};
function createDatasourceAdapter(config) {
  switch (config.type) {
    case "supabase":
      return new SupabaseAdapter(config);
    case "neon":
    case "postgres":
      return new NeonAdapter(config);
    case "planetscale":
    case "mysql":
      return new PlanetScaleAdapter(config);
    case "turso":
    case "sqlite":
      return new TursoAdapter(config);
    default:
      throw new Error(`Unsupported datasource type: ${config.type}`);
  }
}
var defaultAdapter = null;
function getDefaultDatasource() {
  if (!defaultAdapter && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    defaultAdapter = new SupabaseAdapter({
      id: "default",
      type: "supabase",
      name: "Default Supabase",
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY
    });
  }
  return defaultAdapter;
}
async function handleDataQuery(table, options = {}, datasourceConfig, tenantSlug) {
  const adapter = datasourceConfig ? createDatasourceAdapter(datasourceConfig) : getDefaultDatasource();
  if (!adapter) {
    return { data: [], error: "No datasource configured" };
  }
  const key = `ds:lastgood:${tenantSlug || "default"}:${table}:${stableHash(options)}`;
  try {
    const { value, stale } = await readWithFallback(
      key,
      () => adapter.query({ table, ...options }),
      (r) => !!r.error
    );
    return stale ? { ...value, _stale: true } : value;
  } catch (err) {
    return { data: [], error: err?.message || "Query failed" };
  }
}

export {
  stableHash,
  readWithFallback,
  createDatasourceAdapter,
  getDefaultDatasource,
  handleDataQuery
};
