import {
  __export
} from "./chunk-KFQGP6VL.js";

// src/routes/vector.ts
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

// src/db/index.ts
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  executions: () => executions,
  workflows: () => workflows
});
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
var workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull(),
  // manual, http_webhook, scheduled, data_change
  triggerConfig: text("trigger_config"),
  // JSON: cron, table, etc.
  nodes: text("nodes").notNull(),
  // JSON array of nodes
  edges: text("edges").notNull(),
  // JSON array of edges
  version: integer("version").notNull().default(1),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().$defaultFn(() => (/* @__PURE__ */ new Date()).toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => (/* @__PURE__ */ new Date()).toISOString()),
  publishedBy: text("published_by")
});
var executions = sqliteTable("executions", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull().references(() => workflows.id),
  status: text("status").notNull(),
  // started, executing, completed, error, cancelled
  triggerType: text("trigger_type").notNull(),
  triggerPayload: text("trigger_payload"),
  // JSON: input data
  nodeExecutions: text("node_executions"),
  // JSON: per-node status
  result: text("result"),
  // JSON: final output
  error: text("error"),
  usage: real("usage").default(0),
  // compute credits
  startedAt: text("started_at").notNull().$defaultFn(() => (/* @__PURE__ */ new Date()).toISOString()),
  endedAt: text("ended_at")
});

// src/db/index.ts
var dbType = process.env.DB_TYPE || "sqlite";
var connectionUrl;
var authToken;
if (dbType === "turso") {
  connectionUrl = process.env.TURSO_DATABASE_URL || "";
  authToken = process.env.TURSO_AUTH_TOKEN;
  if (!connectionUrl) {
    throw new Error("TURSO_DATABASE_URL is required for Turso connection");
  }
  console.log("\u{1F4E6} Connected to Turso SQLite (HTTP)");
} else {
  const sqlitePath = process.env.SQLITE_PATH || "./data/actions.db";
  connectionUrl = `file:${sqlitePath}`;
  console.log(`\u{1F4E6} Connected to SQLite: ${sqlitePath}`);
}
var client = createClient({
  url: connectionUrl,
  authToken
});
var db = drizzle(client, { schema: schema_exports });

// src/routes/vector.ts
var vectorRoute = new OpenAPIHono();
function isLanceEnabled() {
  return (process.env.LANCEDB_ENABLED ?? "false").toLowerCase() === "true";
}
var LibsqlVectorStore = class {
  dataPath;
  constructor() {
    const sqlitePath = process.env.SQLITE_PATH || "./data/actions.db";
    this.dataPath = sqlitePath.replace("file:", "").replace("./data/", "");
  }
  async test() {
    try {
      await client.execute("SELECT 1", []);
    } catch (err) {
      throw new Error(`Database connection failed: ${err.message}`);
    }
    let vectorReady = false;
    try {
      await client.execute("SELECT typeof(cast('[1.0, 0.0]' as F32_BLOB))", []);
      vectorReady = true;
    } catch {
    }
    let tables = [];
    try {
      tables = await this._listTables();
    } catch {
    }
    return {
      success: true,
      dataPath: `./data/${this.dataPath}`,
      version: "libsql",
      tableCount: tables.length,
      vectorReady
    };
  }
  async upsert(tableName, vectors) {
    if (!vectors.length) {
      return { success: true, inserted: 0, message: "No vectors to upsert" };
    }
    const dims = vectors[0].vector.length;
    const metadata = vectors.map((v) => ({
      id: v.id,
      vector: v.vector,
      metadata: JSON.stringify(Object.fromEntries(
        Object.entries(v).filter(([k]) => k !== "id" && k !== "vector")
      ))
    }));
    await this._ensureTable(tableName, dims);
    let inserted = 0;
    for (const row of metadata) {
      const vecArray = `[${row.vector.join(",")}]`;
      await client.execute(
        `
                    INSERT INTO ${this._quoteId(tableName)} (id, embedding, metadata)
                    VALUES (?, ${this._vectorCast(vecArray)}, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        embedding = ${this._vectorCast(vecArray)},
                        metadata = ?
                `,
        [row.id, row.metadata, row.metadata]
      );
      inserted++;
    }
    return {
      success: true,
      inserted,
      message: `${inserted} vector(s) upserted into '${tableName}'`
    };
  }
  async search(tableName, queryVector, limit) {
    const vecArray = `[${queryVector.join(",")}]`;
    const rows = await client.execute(
      `
                SELECT id, metadata,
                    (1 - vector_distance_cos(embedding, ${this._vectorCast(vecArray)})) AS _score
                FROM ${this._quoteId(tableName)}
                ORDER BY vector_distance_cos(embedding, ${this._vectorCast(vecArray)}) ASC
                LIMIT ?
            `,
      [limit]
    );
    const results = rows.rows.map((row) => ({
      id: row.id,
      ...JSON.parse(row.metadata || "{}"),
      _score: row._score
    }));
    return { results, count: results.length };
  }
  async debug() {
    const tables = await this._listTables();
    let totalVectors = 0;
    const tableInfo = [];
    for (const name of tables) {
      const count = await this._countRows(name);
      totalVectors += count;
      tableInfo.push({ name, count });
    }
    return {
      enabled: true,
      version: "libsql",
      dataPath: `./data/${this.dataPath}`,
      tables: tableInfo,
      totalVectors,
      diskUsageBytes: 0,
      // Not easily available in libsql
      healthy: true
    };
  }
  async export(tableName) {
    const rows = await client.execute(
      `SELECT id, metadata FROM ${this._quoteId(tableName)}`,
      []
    );
    const results = rows.rows.map((row) => ({
      id: row.id,
      ...JSON.parse(row.metadata || "{}")
    }));
    return { table: tableName, rows: results, count: results.length };
  }
  // ── Private helpers ─────────────────────────────────────────────────────
  async _listTables() {
    const rows = await client.execute(
      `
                SELECT name FROM sqlite_master
                WHERE type='table' AND sql LIKE '%embedding F32_BLOB%'
                ORDER BY name
            `,
      []
    );
    return rows.rows.map((r) => r.name);
  }
  async _ensureTable(tableName, dims) {
    const exists = await this._tableExists(tableName);
    if (exists) return;
    await client.execute(
      `
                CREATE TABLE ${this._quoteId(tableName)} (
                    id TEXT PRIMARY KEY,
                    embedding F32_BLOB(${dims}) NOT NULL,
                    metadata TEXT
                )
            `,
      []
    );
  }
  async _tableExists(tableName) {
    const rows = await client.execute(
      "SELECT 1 FROM sqlite_master WHERE type=? AND name=?",
      ["table", tableName]
    );
    return rows.rows.length > 0;
  }
  async _countRows(tableName) {
    const rows = await client.execute(
      `SELECT COUNT(*) as count FROM ${this._quoteId(tableName)}`,
      []
    );
    return rows.rows[0]?.count || 0;
  }
  _quoteId(id) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
      throw new Error(`Invalid identifier: ${id}`);
    }
    return `"${id}"`;
  }
  _vectorCast(vecArray) {
    return `cast(${vecArray} as F32_BLOB)`;
  }
};
var _modulePromise = null;
var _dbPromise = null;
var LANCEDB_MODULE = "@lancedb/lancedb";
async function loadLanceModule() {
  if (!_modulePromise) {
    _modulePromise = import(LANCEDB_MODULE).catch((err) => {
      _modulePromise = null;
      throw err;
    });
  }
  return _modulePromise;
}
async function ensureDataDir(path) {
  try {
    const fs = await import("fs");
    fs.mkdirSync(path, { recursive: true });
  } catch {
  }
}
async function getLanceDb() {
  if (!_dbPromise) {
    const path = process.env.EMBEDDED_LANCEDB_PATH || "/app/data/lancedb";
    await ensureDataDir(path);
    const { connect } = await loadLanceModule();
    _dbPromise = Promise.resolve(connect(path));
    _dbPromise.catch(() => {
      _dbPromise = null;
    });
  }
  return _dbPromise;
}
async function lanceVersion() {
  try {
    const { createRequire } = await import("module");
    const require2 = createRequire(import.meta.url);
    return require2("@lancedb/lancedb/package.json").version || "unknown";
  } catch {
    return "unknown";
  }
}
async function dirSize(dir) {
  const { promises: fs } = await import("fs");
  let total = 0;
  async function walk(d) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = `${d}/${entry.name}`;
      if (entry.isDirectory()) await walk(full);
      else {
        try {
          total += (await fs.stat(full)).size;
        } catch {
        }
      }
    }
  }
  await walk(dir);
  return total;
}
var LanceVectorStore = class {
  async test() {
    const db2 = await getLanceDb();
    const tables = await db2.tableNames();
    return {
      success: true,
      dataPath: process.env.EMBEDDED_LANCEDB_PATH || "/app/data/lancedb",
      version: await lanceVersion(),
      tableCount: tables.length
    };
  }
  async upsert(tableName, vectors) {
    const db2 = await getLanceDb();
    const existing = await db2.tableNames();
    if (!existing.includes(tableName)) {
      await db2.createTable(tableName, vectors);
      return { success: true, inserted: vectors.length, message: `Table '${tableName}' created and ${vectors.length} vector(s) inserted.` };
    }
    const table = await db2.openTable(tableName);
    const ids = vectors.map((v) => v.id);
    try {
      const inList = ids.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(",");
      await table.delete(`id IN (${inList})`);
    } catch {
    }
    await table.add(vectors);
    return { success: true, inserted: vectors.length, message: `${vectors.length} vector(s) upserted into '${tableName}'.` };
  }
  async search(tableName, queryVector, limit) {
    const db2 = await getLanceDb();
    const existing = await db2.tableNames();
    if (!existing.includes(tableName)) {
      throw new Error(`Table '${tableName}' does not exist.`);
    }
    const table = await db2.openTable(tableName);
    const results = await table.search(queryVector).limit(limit).toArrayList();
    return { results, count: results.length };
  }
  async debug() {
    const db2 = await getLanceDb();
    const tables = await db2.tableNames();
    let totalVectors = 0;
    const tableInfo = [];
    for (const name of tables) {
      try {
        const tbl = await db2.openTable(name);
        const count = typeof tbl.countRows === "function" ? await tbl.countRows() : await tbl.count();
        totalVectors += Number(count) || 0;
        tableInfo.push({ name, count: Number(count) || 0 });
      } catch {
        tableInfo.push({ name, count: null, error: "unreadable" });
      }
    }
    let diskUsageBytes = 0;
    try {
      diskUsageBytes = await dirSize(process.env.EMBEDDED_LANCEDB_PATH || "/app/data/lancedb");
    } catch {
    }
    return {
      enabled: true,
      version: await lanceVersion(),
      dataPath: process.env.EMBEDDED_LANCEDB_PATH || "/app/data/lancedb",
      tables: tableInfo,
      totalVectors,
      diskUsageBytes,
      healthy: true
    };
  }
  async export(tableName) {
    const db2 = await getLanceDb();
    const existing = await db2.tableNames();
    if (!existing.includes(tableName)) {
      throw new Error(`Table '${tableName}' not found`);
    }
    const table = await db2.openTable(tableName);
    const rows = await table.query().limit(1e6).toArrayList();
    return { table: tableName, rows, count: rows.length };
  }
};
function getStore() {
  if (isLanceEnabled()) {
    return new LanceVectorStore();
  }
  return new LibsqlVectorStore();
}
var VectorRowSchema = z.object({
  id: z.string().openapi({ description: "Stable row identifier (used for upsert dedup)" }),
  vector: z.array(z.number()).openapi({ description: "Embedding vector" })
}).catchall(z.any()).openapi({ description: "A vector row. Extra keys are stored as metadata." });
var UpsertSchema = z.object({
  tableName: z.string().min(1),
  vectors: z.array(VectorRowSchema).min(1)
});
var SearchSchema = z.object({
  tableName: z.string().min(1),
  queryVector: z.array(z.number()).min(1),
  limit: z.number().int().min(1).max(1e3).default(10)
});
var SuccessSchema = z.object({
  success: z.boolean(),
  message: z.string()
});
var ErrorSchema = z.object({
  success: z.boolean(),
  error: z.string(),
  message: z.string().optional()
});
var testRoute = createRoute({
  method: "get",
  path: "/test",
  tags: ["Vector"],
  summary: "Test vector store connection",
  responses: {
    200: {
      description: "Connection OK",
      content: { "application/json": { schema: SuccessSchema.extend({
        dataPath: z.string(),
        version: z.string(),
        tableCount: z.number(),
        vectorReady: z.boolean().optional()
      }) } }
    },
    500: { description: "Connection failed", content: { "application/json": { schema: ErrorSchema } } },
    503: { description: "Disabled", content: { "application/json": { schema: ErrorSchema } } }
  }
});
vectorRoute.openapi(testRoute, async (c) => {
  try {
    const store = getStore();
    const result = await store.test();
    return c.json({
      success: true,
      message: "Vector store connection successful",
      ...result
    }, 200);
  } catch (err) {
    console.error("[Vector Test] Error:", err);
    console.error("[Vector Test] Error stack:", err.stack);
    return c.json({
      success: false,
      error: err.name || "ConnectionError",
      message: err.message || "Failed to connect to vector store",
      details: String(err)
    }, 500);
  }
});
var upsertRoute = createRoute({
  method: "post",
  path: "/upsert",
  tags: ["Vector"],
  summary: "Upsert vectors (insert or update by id)",
  description: "If the table does not exist it is created from the first row. If it exists, rows whose id matches are deleted first, then all rows are added \u2014 giving true upsert semantics.",
  request: { body: { content: { "application/json": { schema: UpsertSchema } } } },
  responses: {
    200: { description: "Upserted", content: { "application/json": { schema: SuccessSchema.extend({
      inserted: z.number()
    }) } } },
    400: { description: "Bad request", content: { "application/json": { schema: ErrorSchema } } },
    500: { description: "Failed", content: { "application/json": { schema: ErrorSchema } } },
    503: { description: "Disabled", content: { "application/json": { schema: ErrorSchema } } }
  }
});
vectorRoute.openapi(upsertRoute, async (c) => {
  try {
    const { tableName, vectors } = c.req.valid("json");
    const store = getStore();
    const vectorsArray = vectors.map((v) => ({ id: v.id, vector: Array.from(v.vector), ...v }));
    const result = await store.upsert(tableName, vectorsArray);
    return c.json(result, 200);
  } catch (err) {
    return c.json({
      success: false,
      error: err.name || "UpsertError",
      message: err.message || "Failed to upsert vectors"
    }, 500);
  }
});
var searchRoute = createRoute({
  method: "post",
  path: "/search",
  tags: ["Vector"],
  summary: "Vector similarity search",
  request: { body: { content: { "application/json": { schema: SearchSchema } } } },
  responses: {
    200: { description: "Results", content: { "application/json": { schema: z.object({
      results: z.array(z.record(z.any())),
      count: z.number()
    }) } } },
    400: { description: "Bad request", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Table not found", content: { "application/json": { schema: ErrorSchema } } },
    500: { description: "Failed", content: { "application/json": { schema: ErrorSchema } } },
    503: { description: "Disabled", content: { "application/json": { schema: ErrorSchema } } }
  }
});
vectorRoute.openapi(searchRoute, async (c) => {
  try {
    const { tableName, queryVector, limit } = c.req.valid("json");
    const store = getStore();
    const result = await store.search(tableName, queryVector, limit);
    return c.json(result, 200);
  } catch (err) {
    return c.json({
      success: false,
      error: err.name || "SearchError",
      message: err.message || "Vector search failed"
    }, 500);
  }
});
var debugRoute = createRoute({
  method: "get",
  path: "/debug",
  tags: ["Vector"],
  summary: "Vector store diagnostics",
  responses: {
    200: {
      description: "Diagnostics",
      content: { "application/json": { schema: z.object({
        enabled: z.boolean(),
        version: z.string(),
        dataPath: z.string(),
        tables: z.array(z.any()),
        totalVectors: z.number(),
        diskUsageBytes: z.number(),
        healthy: z.boolean(),
        error: z.string().optional()
      }) } }
    }
  }
});
vectorRoute.openapi(debugRoute, async (c) => {
  try {
    const store = getStore();
    const result = await store.debug();
    return c.json({ ...result, enabled: true }, 200);
  } catch (err) {
    return c.json({
      enabled: true,
      version: isLanceEnabled() ? "lancedb" : "libsql",
      dataPath: isLanceEnabled() ? process.env.EMBEDDED_LANCEDB_PATH || "/app/data/lancedb" : `./data/${process.env.SQLITE_PATH || "actions.db"}`,
      tables: [],
      totalVectors: 0,
      diskUsageBytes: 0,
      healthy: false,
      error: err.message || String(err)
    }, 200);
  }
});
var exportRoute = createRoute({
  method: "get",
  path: "/export",
  tags: ["Vector"],
  summary: "Export a table for migration",
  description: "Returns all rows of a table as JSON. Use to migrate from one vector store to another.",
  request: { query: z.object({ tableName: z.string().min(1) }) },
  responses: {
    200: {
      description: "Exported",
      content: { "application/json": { schema: z.object({
        table: z.string(),
        rows: z.array(z.record(z.any())),
        count: z.number()
      }) } }
    },
    404: { description: "Table not found", content: { "application/json": { schema: ErrorSchema } } },
    500: { description: "Failed", content: { "application/json": { schema: ErrorSchema } } },
    503: { description: "Disabled", content: { "application/json": { schema: ErrorSchema } } }
  }
});
vectorRoute.openapi(exportRoute, async (c) => {
  const tableName = c.req.query("tableName") || "";
  if (!tableName) {
    return c.json({ success: false, error: "BadRequest", message: "tableName query param is required" }, 400);
  }
  try {
    const store = getStore();
    const result = await store.export(tableName);
    return c.json(result, 200);
  } catch (err) {
    return c.json({
      success: false,
      error: err.name || "ExportError",
      message: err.message || "Failed to export table"
    }, 500);
  }
});

export {
  vectorRoute
};
