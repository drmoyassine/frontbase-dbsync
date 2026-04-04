// src/db/datasource-adapter.ts
var SupabaseAdapter = class {
  url;
  anonKey;
  constructor(config) {
    this.url = config.url || process.env.SUPABASE_URL || "";
    this.anonKey = config.anonKey || process.env.SUPABASE_ANON_KEY || "";
  }
  async query(options) {
    const { table, columns = ["*"], filters = {}, limit = 100, offset = 0 } = options;
    const selectCols = columns.join(",");
    let url = `${this.url}/rest/v1/${table}?select=${selectCols}`;
    Object.entries(filters).forEach(([key, value]) => {
      url += `&${key}=eq.${value}`;
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
    const { table, columns = ["*"], filters = {}, limit = 100, offset = 0 } = options;
    const selectCols = columns.join(", ");
    let sql = `SELECT ${selectCols} FROM ${table}`;
    const whereConditions = Object.entries(filters).map(
      ([key, value]) => `${key} = '${value}'`
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
    const { table, columns = ["*"], filters = {}, limit = 100, offset = 0 } = options;
    const selectCols = columns.join(", ");
    let sql = `SELECT ${selectCols} FROM \`${table}\``;
    const whereConditions = Object.entries(filters).map(
      ([key, value]) => `\`${key}\` = '${value}'`
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
    const { table, columns = ["*"], filters = {}, limit = 100, offset = 0 } = options;
    const selectCols = columns.join(", ");
    let sql = `SELECT ${selectCols} FROM "${table}"`;
    const whereConditions = Object.entries(filters).map(
      ([key, value]) => `"${key}" = '${value}'`
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
async function handleDataQuery(table, options = {}, datasourceConfig) {
  const adapter = datasourceConfig ? createDatasourceAdapter(datasourceConfig) : getDefaultDatasource();
  if (!adapter) {
    return { data: [], error: "No datasource configured" };
  }
  return adapter.query({
    table,
    ...options
  });
}

export {
  createDatasourceAdapter,
  getDefaultDatasource,
  handleDataQuery
};
