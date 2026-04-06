import {
  env_exports,
  getStateDbConfig,
  init_env
} from "./chunk-YLQ7CKVG.js";
import {
  __esm,
  __export,
  __require,
  __toCommonJS
} from "./chunk-KFQGP6VL.js";

// src/storage/edge-migrations.ts
async function runMigrations(execute, providerName) {
  await execute(`CREATE TABLE IF NOT EXISTS _schema_version (
        version INTEGER PRIMARY KEY,
        description TEXT,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  let appliedCount = 0;
  for (const migration of MIGRATIONS) {
    try {
      for (const sqlStmt of migration.sql) {
        try {
          await execute(sqlStmt);
        } catch (sqlError) {
          const msg = String(sqlError?.message || sqlError || "");
          if (msg.includes("duplicate column")) {
            console.log(`[${providerName}:Migration] Column already exists (v${migration.version}), skipping.`);
          } else {
            throw sqlError;
          }
        }
      }
      await execute(
        `INSERT OR IGNORE INTO _schema_version (version, description) 
                 VALUES (${migration.version}, '${migration.description.replace(/'/g, "''")}')`
      );
      appliedCount++;
    } catch (error) {
      console.error(`[${providerName}:Migration] Failed at v${migration.version}: ${error}`);
      throw error;
    }
  }
  const latestVersion = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
  console.log(`[${providerName}:Migration] Schema at v${latestVersion} (${appliedCount} migrations checked)`);
}
var MIGRATIONS;
var init_edge_migrations = __esm({
  "src/storage/edge-migrations.ts"() {
    "use strict";
    MIGRATIONS = [
      {
        version: 1,
        description: "Initial schema \u2014 published_pages + project_settings",
        sql: [
          // Schema version tracking
          `CREATE TABLE IF NOT EXISTS _schema_version (
                version INTEGER PRIMARY KEY,
                description TEXT,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )`,
          // Published pages
          `CREATE TABLE IF NOT EXISTS published_pages (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                title TEXT,
                description TEXT,
                layout_data TEXT NOT NULL,
                seo_data TEXT,
                datasources TEXT,
                css_bundle TEXT,
                version INTEGER NOT NULL DEFAULT 1,
                published_at TEXT NOT NULL,
                is_public INTEGER NOT NULL DEFAULT 1,
                is_homepage INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,
          // Indexes
          `CREATE INDEX IF NOT EXISTS idx_published_pages_slug ON published_pages(slug)`,
          `CREATE INDEX IF NOT EXISTS idx_published_pages_homepage ON published_pages(is_homepage)`,
          // Project settings
          `CREATE TABLE IF NOT EXISTS project_settings (
                id TEXT PRIMARY KEY DEFAULT 'default',
                favicon_url TEXT,
                logo_url TEXT,
                site_name TEXT,
                site_description TEXT,
                app_url TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,
          // Default settings row
          `INSERT OR IGNORE INTO project_settings (id, updated_at) VALUES ('default', datetime('now'))`
        ]
      },
      {
        version: 2,
        description: "Add workflows + executions tables",
        sql: [
          `CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                trigger_type TEXT NOT NULL,
                trigger_config TEXT,
                nodes TEXT NOT NULL,
                edges TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                published_by TEXT
            )`,
          `CREATE TABLE IF NOT EXISTS executions (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL REFERENCES workflows(id),
                status TEXT NOT NULL,
                trigger_type TEXT NOT NULL,
                trigger_payload TEXT,
                node_executions TEXT,
                result TEXT,
                error TEXT,
                usage REAL DEFAULT 0,
                started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ended_at TEXT
            )`,
          `CREATE INDEX IF NOT EXISTS idx_executions_workflow ON executions(workflow_id)`,
          `CREATE INDEX IF NOT EXISTS idx_executions_started ON executions(started_at)`
        ]
      },
      {
        version: 3,
        description: "Add content_hash column to published_pages",
        sql: [
          `ALTER TABLE published_pages ADD COLUMN content_hash TEXT`
        ]
      },
      {
        version: 4,
        description: "Add settings column to workflows",
        sql: [
          `ALTER TABLE workflows ADD COLUMN settings TEXT`
        ]
      },
      {
        version: 5,
        description: "Add dead_letters table for DLQ",
        sql: [
          `CREATE TABLE IF NOT EXISTS dead_letters (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                execution_id TEXT NOT NULL,
                error TEXT,
                payload TEXT,
                retry_count INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            )`,
          `CREATE INDEX IF NOT EXISTS idx_dead_letters_workflow ON dead_letters(workflow_id)`
        ]
      },
      {
        version: 6,
        description: "Add edge_logs table for persisted runtime logs",
        sql: [
          `CREATE TABLE IF NOT EXISTS edge_logs (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                source TEXT DEFAULT 'runtime',
                metadata TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,
          `CREATE INDEX IF NOT EXISTS idx_edge_logs_timestamp ON edge_logs(timestamp DESC)`,
          `CREATE INDEX IF NOT EXISTS idx_edge_logs_level ON edge_logs(level)`
        ]
      },
      {
        version: 7,
        description: "Add auth_forms column to project_settings",
        sql: [
          `ALTER TABLE project_settings ADD COLUMN auth_forms TEXT`
        ]
      },
      {
        version: 8,
        description: "Add users_config column to project_settings",
        sql: [
          `ALTER TABLE project_settings ADD COLUMN users_config TEXT`
        ]
      },
      {
        version: 9,
        description: "Add agent_tools table for user-configured AI agent tools",
        sql: [
          `CREATE TABLE IF NOT EXISTS agent_tools (
                id TEXT PRIMARY KEY,
                profile_slug TEXT NOT NULL,
                type TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                config TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,
          `CREATE INDEX IF NOT EXISTS idx_agent_tools_profile ON agent_tools(profile_slug)`,
          `CREATE INDEX IF NOT EXISTS idx_agent_tools_type ON agent_tools(type)`
        ]
      }
    ];
  }
});

// src/storage/CfD1HttpProvider.ts
var CfD1HttpProvider_exports = {};
__export(CfD1HttpProvider_exports, {
  CfD1HttpProvider: () => CfD1HttpProvider
});
async function d1Query(accountId, databaseId, apiToken, sqlStr, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sql: sqlStr, params })
  });
  if (!resp.ok) {
    const text2 = await resp.text();
    throw new Error(`D1 HTTP API error (${resp.status}): ${text2.substring(0, 300)}`);
  }
  const data = await resp.json();
  const firstResult = data?.result?.[0];
  if (!firstResult?.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(data?.errors || data)}`);
  }
  return firstResult;
}
var DEFAULT_FAVICON2, CfD1HttpProvider;
var init_CfD1HttpProvider = __esm({
  "src/storage/CfD1HttpProvider.ts"() {
    "use strict";
    init_edge_migrations();
    DEFAULT_FAVICON2 = "/static/icon.png";
    CfD1HttpProvider = class {
      accountId = "";
      databaseId = "";
      apiToken = "";
      ensureConfig() {
        if (this.accountId) return;
        const { getStateDbConfig: getStateDbConfig2 } = (init_env(), __toCommonJS(env_exports));
        const cfg = getStateDbConfig2();
        const dbUrl = cfg.url || "";
        this.apiToken = cfg.cfApiToken || "";
        this.accountId = cfg.cfAccountId || "";
        if (dbUrl.startsWith("d1://")) {
          this.databaseId = dbUrl.replace("d1://", "");
        } else {
          this.databaseId = dbUrl;
        }
        if (!this.databaseId || !this.apiToken || !this.accountId) {
          throw new Error(
            "[CfD1HttpProvider] Missing config. Required in FRONTBASE_STATE_DB: url (d1://UUID), cfApiToken, cfAccountId"
          );
        }
        console.log(`\u{1F536} CfD1HttpProvider configured: D1 ${this.databaseId.substring(0, 8)}...`);
      }
      async run(sqlStr, params = []) {
        this.ensureConfig();
        return d1Query(this.accountId, this.databaseId, this.apiToken, sqlStr, params);
      }
      async get(sqlStr, params = []) {
        const result = await this.run(sqlStr, params);
        return result.results?.[0] || null;
      }
      async all(sqlStr, params = []) {
        const result = await this.run(sqlStr, params);
        return result.results || [];
      }
      // =========================================================================
      // Lifecycle
      // =========================================================================
      async init() {
        await runMigrations(
          async (sqlStr) => {
            await this.run(sqlStr);
          },
          "CF D1 (HTTP)"
        );
        console.log("\u{1F536} State DB initialized (CF D1 via HTTP)");
      }
      async initSettings() {
        console.log("\u{1F536} Project settings table initialized (CF D1)");
      }
      // =========================================================================
      // Pages CRUD
      // =========================================================================
      async upsertPage(page) {
        if (page.isHomepage) {
          await this.run(
            `UPDATE published_pages SET is_homepage = 0 WHERE is_homepage = 1`
          );
        }
        await this.run(
          `INSERT INTO published_pages (id, slug, name, title, description, layout_data, seo_data, datasources, css_bundle, version, published_at, is_public, is_homepage, content_hash, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(id) DO UPDATE SET
               slug = excluded.slug, name = excluded.name, title = excluded.title,
               description = excluded.description, layout_data = excluded.layout_data,
               seo_data = excluded.seo_data, datasources = excluded.datasources,
               css_bundle = excluded.css_bundle, version = excluded.version,
               published_at = excluded.published_at, is_public = excluded.is_public,
               is_homepage = excluded.is_homepage, content_hash = excluded.content_hash,
               updated_at = excluded.updated_at`,
          [
            page.id,
            page.slug,
            page.name,
            page.title || null,
            page.description || null,
            JSON.stringify(page.layoutData),
            page.seoData ? JSON.stringify(page.seoData) : null,
            page.datasources ? JSON.stringify(page.datasources) : null,
            page.cssBundle || null,
            page.version,
            page.publishedAt,
            page.isPublic ? 1 : 0,
            page.isHomepage ? 1 : 0,
            page.contentHash || null,
            (/* @__PURE__ */ new Date()).toISOString()
          ]
        );
        console.log(`\u{1F536} Upserted page (D1): ${page.slug} (v${page.version})`);
        return { success: true, version: page.version };
      }
      rowToPage(row) {
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          title: row.title || void 0,
          description: row.description || void 0,
          layoutData: JSON.parse(row.layout_data),
          seoData: row.seo_data ? JSON.parse(row.seo_data) : void 0,
          datasources: row.datasources ? JSON.parse(row.datasources) : void 0,
          cssBundle: row.css_bundle || void 0,
          version: row.version,
          publishedAt: row.published_at,
          isPublic: !!row.is_public,
          isHomepage: !!row.is_homepage
        };
      }
      async getPageBySlug(slug) {
        const row = await this.get(
          `SELECT * FROM published_pages WHERE slug = ?1`,
          [slug]
        );
        return row ? this.rowToPage(row) : null;
      }
      async getHomepage() {
        const row = await this.get(
          `SELECT * FROM published_pages WHERE is_homepage = 1`
        );
        return row ? this.rowToPage(row) : null;
      }
      async deletePage(slug) {
        await this.run(`DELETE FROM published_pages WHERE slug = ?1`, [slug]);
        return true;
      }
      async listPages() {
        const rows = await this.all(
          `SELECT id, slug, name, version FROM published_pages`
        );
        return rows;
      }
      async listPublicPageSlugs() {
        const rows = await this.all(
          `SELECT slug, updated_at, is_homepage FROM published_pages WHERE is_public = 1`
        );
        return rows.map((r) => ({
          slug: r.slug,
          updatedAt: r.updated_at,
          isHomepage: !!r.is_homepage
        }));
      }
      // =========================================================================
      // Project Settings
      // =========================================================================
      async getProjectSettings() {
        const row = await this.get(
          `SELECT * FROM project_settings WHERE id = 'default'`
        );
        if (!row) {
          return {
            id: "default",
            faviconUrl: null,
            logoUrl: null,
            siteName: null,
            siteDescription: null,
            appUrl: null,
            authForms: null,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        return {
          id: row.id,
          faviconUrl: row.favicon_url || null,
          logoUrl: row.logo_url || null,
          siteName: row.site_name || null,
          siteDescription: row.site_description || null,
          appUrl: row.app_url || null,
          authForms: row.auth_forms || null,
          updatedAt: row.updated_at
        };
      }
      async getFaviconUrl() {
        const settings = await this.getProjectSettings();
        return settings.faviconUrl || DEFAULT_FAVICON2;
      }
      async updateProjectSettings(updates) {
        const existing = await this.get(`SELECT id FROM project_settings WHERE id = 'default'`);
        const now = (/* @__PURE__ */ new Date()).toISOString();
        if (existing) {
          const setClauses = [`updated_at = ?1`];
          const params = [now];
          let idx = 2;
          if (updates.faviconUrl !== void 0) {
            setClauses.push(`favicon_url = ?${idx}`);
            params.push(updates.faviconUrl);
            idx++;
          }
          if (updates.logoUrl !== void 0) {
            setClauses.push(`logo_url = ?${idx}`);
            params.push(updates.logoUrl);
            idx++;
          }
          if (updates.siteName !== void 0) {
            setClauses.push(`site_name = ?${idx}`);
            params.push(updates.siteName);
            idx++;
          }
          if (updates.siteDescription !== void 0) {
            setClauses.push(`site_description = ?${idx}`);
            params.push(updates.siteDescription);
            idx++;
          }
          if (updates.appUrl !== void 0) {
            setClauses.push(`app_url = ?${idx}`);
            params.push(updates.appUrl);
            idx++;
          }
          if (updates.authForms !== void 0) {
            setClauses.push(`auth_forms = ?${idx}`);
            params.push(updates.authForms);
            idx++;
          }
          await this.run(`UPDATE project_settings SET ${setClauses.join(", ")} WHERE id = 'default'`, params);
        } else {
          await this.run(
            `INSERT INTO project_settings (id, favicon_url, logo_url, site_name, site_description, app_url, auth_forms, updated_at) VALUES ('default', ?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
            [updates.faviconUrl || null, updates.logoUrl || null, updates.siteName || null, updates.siteDescription || null, updates.appUrl || null, updates.authForms || null, now]
          );
        }
        return this.getProjectSettings();
      }
      // =========================================================================
      // Workflows
      // =========================================================================
      async upsertWorkflow(workflow) {
        const existing = await this.get(
          `SELECT version FROM workflows WHERE id = ?1`,
          [workflow.id]
        );
        const now = (/* @__PURE__ */ new Date()).toISOString();
        if (existing) {
          const newVersion = (existing.version || 1) + 1;
          await this.run(
            `UPDATE workflows SET name=?1, description=?2, trigger_type=?3, trigger_config=?4, nodes=?5, edges=?6, settings=?7, version=?8, updated_at=?9, published_by=?10 WHERE id=?11`,
            [workflow.name, workflow.description, workflow.triggerType, workflow.triggerConfig, workflow.nodes, workflow.edges, workflow.settings || null, newVersion, now, workflow.publishedBy, workflow.id]
          );
          return { version: newVersion };
        } else {
          await this.run(
            `INSERT INTO workflows (id, name, description, trigger_type, trigger_config, nodes, edges, settings, version, is_active, created_at, updated_at, published_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, 1, ?9, ?9, ?10)`,
            [workflow.id, workflow.name, workflow.description, workflow.triggerType, workflow.triggerConfig, workflow.nodes, workflow.edges, workflow.settings || null, now, workflow.publishedBy]
          );
          return { version: 1 };
        }
      }
      async getWorkflowById(id) {
        const row = await this.get(`SELECT * FROM workflows WHERE id = ?1`, [id]);
        return row ? this.rowToWorkflow(row) : null;
      }
      async getActiveWebhookWorkflow(id) {
        const row = await this.get(
          `SELECT * FROM workflows WHERE id = ?1 AND is_active = 1`,
          [id]
        );
        return row ? this.rowToWorkflow(row) : null;
      }
      rowToWorkflow(row) {
        return {
          id: row.id,
          name: row.name,
          description: row.description || null,
          triggerType: row.trigger_type,
          triggerConfig: row.trigger_config || null,
          nodes: row.nodes,
          edges: row.edges,
          settings: row.settings || null,
          version: row.version,
          isActive: !!row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          publishedBy: row.published_by || null
        };
      }
      async listWorkflows() {
        const rows = await this.all(`SELECT * FROM workflows`);
        return rows.map((r) => this.rowToWorkflow(r));
      }
      async deleteWorkflow(id) {
        await this.run(`DELETE FROM workflows WHERE id = ?1`, [id]);
        return true;
      }
      async toggleWorkflow(id, isActive) {
        await this.run(
          `UPDATE workflows SET is_active = ?1, updated_at = ?2 WHERE id = ?3`,
          [isActive ? 1 : 0, (/* @__PURE__ */ new Date()).toISOString(), id]
        );
      }
      // =========================================================================
      // Executions
      // =========================================================================
      async createExecution(execution) {
        await this.run(
          `INSERT INTO executions (id, workflow_id, status, trigger_type, trigger_payload, node_executions, started_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
          [execution.id, execution.workflowId, execution.status, execution.triggerType, execution.triggerPayload || null, execution.nodeExecutions || null, execution.startedAt]
        );
      }
      async getExecutionById(id) {
        const row = await this.get(`SELECT * FROM executions WHERE id = ?1`, [id]);
        return row ? this.rowToExecution(row) : null;
      }
      async updateExecution(id, updates) {
        const setClauses = [];
        const params = [];
        let idx = 1;
        if (updates.status !== void 0) {
          setClauses.push(`status = ?${idx}`);
          params.push(updates.status);
          idx++;
        }
        if (updates.result !== void 0) {
          setClauses.push(`result = ?${idx}`);
          params.push(updates.result);
          idx++;
        }
        if (updates.error !== void 0) {
          setClauses.push(`error = ?${idx}`);
          params.push(updates.error);
          idx++;
        }
        if (updates.nodeExecutions !== void 0) {
          setClauses.push(`node_executions = ?${idx}`);
          params.push(updates.nodeExecutions);
          idx++;
        }
        if (updates.usage !== void 0) {
          setClauses.push(`usage = ?${idx}`);
          params.push(updates.usage);
          idx++;
        }
        if (updates.endedAt !== void 0) {
          setClauses.push(`ended_at = ?${idx}`);
          params.push(updates.endedAt);
          idx++;
        }
        if (setClauses.length > 0) {
          params.push(id);
          await this.run(`UPDATE executions SET ${setClauses.join(", ")} WHERE id = ?${idx}`, params);
        }
      }
      async listExecutionsByWorkflow(workflowId, limit = 20) {
        const rows = await this.all(
          `SELECT * FROM executions WHERE workflow_id = ?1 ORDER BY started_at DESC LIMIT ?2`,
          [workflowId, limit]
        );
        return rows.map((r) => this.rowToExecution(r));
      }
      async listAllExecutions(filters) {
        const conditions = [];
        const params = [];
        let idx = 1;
        if (filters?.workflowId) {
          conditions.push(`workflow_id = ?${idx}`);
          params.push(filters.workflowId);
          idx++;
        }
        if (filters?.since) {
          conditions.push(`started_at >= ?${idx}`);
          params.push(filters.since);
          idx++;
        }
        if (filters?.until) {
          conditions.push(`started_at <= ?${idx}`);
          params.push(filters.until);
          idx++;
        }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        params.push(filters?.limit || 100);
        let rows = await this.all(
          `SELECT * FROM executions ${where} ORDER BY started_at DESC LIMIT ?${idx}`,
          params
        );
        if (filters?.status && filters.status.length > 0) {
          rows = rows.filter((r) => filters.status.includes(r.status));
        }
        return rows.map((r) => this.rowToExecution(r));
      }
      async getExecutionStats() {
        const rows = await this.all(`SELECT * FROM executions`);
        const statsMap = /* @__PURE__ */ new Map();
        for (const exec of rows) {
          const wid = exec.workflow_id;
          const current = statsMap.get(wid) || { workflowId: wid, totalRuns: 0, successfulRuns: 0, failedRuns: 0 };
          current.totalRuns++;
          if (exec.status === "completed") current.successfulRuns++;
          else if (exec.status === "error") current.failedRuns++;
          statsMap.set(wid, current);
        }
        return Array.from(statsMap.values());
      }
      rowToExecution(row) {
        return {
          id: row.id,
          workflowId: row.workflow_id,
          status: row.status,
          triggerType: row.trigger_type,
          triggerPayload: row.trigger_payload || null,
          nodeExecutions: row.node_executions || null,
          result: row.result || null,
          error: row.error || null,
          usage: row.usage || null,
          startedAt: row.started_at,
          endedAt: row.ended_at || null
        };
      }
      // =========================================================================
      // Dead Letter Queue
      // =========================================================================
      async createDeadLetter(deadLetter) {
        await this.run(
          `INSERT INTO dead_letters (id, workflow_id, execution_id, error, payload, retry_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
          [deadLetter.id, deadLetter.workflowId, deadLetter.executionId, deadLetter.error, deadLetter.payload, deadLetter.retryCount || 0]
        );
      }
      // =========================================================================
      // Agent Tools
      // =========================================================================
      async listAgentTools(profileSlug, includeInactive = false) {
        const where = includeInactive ? `WHERE profile_slug = ?1` : `WHERE profile_slug = ?1 AND is_active = 1`;
        const rows = await this.all(
          `SELECT * FROM agent_tools ${where}`,
          [profileSlug]
        );
        return rows.map((r) => ({
          id: r.id,
          profileSlug: r.profile_slug,
          type: r.type,
          name: r.name,
          description: r.description || null,
          config: r.config,
          isActive: !!r.is_active,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
      }
      async upsertAgentTool(tool) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        await this.run(
          `INSERT INTO agent_tools (id, profile_slug, type, name, description, config, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               profile_slug=excluded.profile_slug, type=excluded.type, name=excluded.name,
               description=excluded.description, config=excluded.config,
               is_active=excluded.is_active, updated_at=excluded.updated_at`,
          [
            tool.id,
            tool.profileSlug,
            tool.type,
            tool.name,
            tool.description,
            tool.config,
            tool.isActive ? 1 : 0,
            tool.createdAt || now,
            now
          ]
        );
      }
      async deleteAgentTool(id) {
        await this.run(`DELETE FROM agent_tools WHERE id = ?1`, [id]);
        return true;
      }
    };
  }
});

// src/storage/NeonHttpProvider.ts
var NeonHttpProvider_exports = {};
__export(NeonHttpProvider_exports, {
  NeonHttpProvider: () => NeonHttpProvider
});
async function getNeonClient() {
  if (_neonSql) return _neonSql;
  const { getStateDbConfig: getStateDbConfig2 } = (init_env(), __toCommonJS(env_exports));
  const cfg = getStateDbConfig2();
  const dbUrl = cfg.url;
  if (!dbUrl) {
    throw new Error("[NeonHttpProvider] FRONTBASE_STATE_DB.url is required");
  }
  try {
    const { Pool } = await import("@neondatabase/serverless");
    const pool = new Pool({ connectionString: dbUrl });
    _neonSql = async (sqlStr, params = []) => {
      const result = await pool.query(sqlStr, params);
      return { rows: result.rows, rowCount: result.rows.length };
    };
    console.log(`\u{1F418} NeonHttpProvider connected to: ${dbUrl.substring(0, 40)}...`);
    return _neonSql;
  } catch (e) {
    throw new Error(
      `[NeonHttpProvider] Failed to initialize. Ensure @neondatabase/serverless is installed.
Error: ${e}`
    );
  }
}
var DEFAULT_FAVICON3, SCHEMA, _neonSql, PG_MIGRATIONS, NeonHttpProvider;
var init_NeonHttpProvider = __esm({
  "src/storage/NeonHttpProvider.ts"() {
    "use strict";
    DEFAULT_FAVICON3 = "/static/icon.png";
    SCHEMA = process.env.FRONTBASE_SCHEMA_NAME || "frontbase_edge";
    _neonSql = null;
    PG_MIGRATIONS = [
      // Schema creation
      `CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`,
      // Published pages
      `CREATE TABLE IF NOT EXISTS ${SCHEMA}.published_pages (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        title TEXT,
        description TEXT,
        layout_data TEXT NOT NULL,
        seo_data TEXT,
        datasources TEXT,
        css_bundle TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        published_at TEXT NOT NULL,
        is_public BOOLEAN NOT NULL DEFAULT TRUE,
        is_homepage BOOLEAN NOT NULL DEFAULT FALSE,
        content_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
      // Project settings
      `CREATE TABLE IF NOT EXISTS ${SCHEMA}.project_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        favicon_url TEXT,
        logo_url TEXT,
        site_name TEXT,
        site_description TEXT,
        app_url TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
      // Workflows
      `CREATE TABLE IF NOT EXISTS ${SCHEMA}.workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        trigger_type TEXT NOT NULL,
        trigger_config TEXT,
        nodes TEXT NOT NULL,
        edges TEXT NOT NULL,
        settings TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_by TEXT
    )`,
      // Executions
      `CREATE TABLE IF NOT EXISTS ${SCHEMA}.executions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        status TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_payload TEXT,
        node_executions TEXT,
        result TEXT,
        error TEXT,
        usage REAL DEFAULT 0,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ
    )`,
      // Edge logs
      `CREATE TABLE IF NOT EXISTS ${SCHEMA}.edge_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        source TEXT DEFAULT 'runtime',
        metadata TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
      // Dead letters
      `CREATE TABLE IF NOT EXISTS ${SCHEMA}.dead_letters (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        execution_id TEXT NOT NULL,
        error TEXT,
        payload TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
      // Agent tools
      `CREATE TABLE IF NOT EXISTS ${SCHEMA}.agent_tools (
        id TEXT PRIMARY KEY,
        profile_slug TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        config TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
      `CREATE INDEX IF NOT EXISTS idx_agent_tools_profile ON ${SCHEMA}.agent_tools(profile_slug)`
    ];
    NeonHttpProvider = class {
      async query(sqlStr, params = []) {
        const client = await getNeonClient();
        return client(sqlStr, params);
      }
      async get(sqlStr, params = []) {
        const result = await this.query(sqlStr, params);
        return result.rows[0] || null;
      }
      async all(sqlStr, params = []) {
        const result = await this.query(sqlStr, params);
        return result.rows;
      }
      // =========================================================================
      // Lifecycle
      // =========================================================================
      async init() {
        for (const migration of PG_MIGRATIONS) {
          await this.query(migration);
        }
        console.log(`\u{1F418} State DB initialized (PG via Neon HTTP) \u2014 schema: ${SCHEMA}`);
      }
      async initSettings() {
        console.log("\u{1F418} Project settings table initialized (PG)");
      }
      // =========================================================================
      // Pages CRUD
      // =========================================================================
      async upsertPage(page) {
        if (page.isHomepage) {
          await this.query(`UPDATE ${SCHEMA}.published_pages SET is_homepage = FALSE WHERE is_homepage = TRUE`);
        }
        await this.query(
          `INSERT INTO ${SCHEMA}.published_pages (id, slug, name, title, description, layout_data, seo_data, datasources, css_bundle, version, published_at, is_public, is_homepage, content_hash, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             ON CONFLICT(id) DO UPDATE SET
               slug = EXCLUDED.slug, name = EXCLUDED.name, title = EXCLUDED.title,
               description = EXCLUDED.description, layout_data = EXCLUDED.layout_data,
               seo_data = EXCLUDED.seo_data, datasources = EXCLUDED.datasources,
               css_bundle = EXCLUDED.css_bundle, version = EXCLUDED.version,
               published_at = EXCLUDED.published_at, is_public = EXCLUDED.is_public,
               is_homepage = EXCLUDED.is_homepage, content_hash = EXCLUDED.content_hash,
               updated_at = EXCLUDED.updated_at`,
          [
            page.id,
            page.slug,
            page.name,
            page.title || null,
            page.description || null,
            JSON.stringify(page.layoutData),
            page.seoData ? JSON.stringify(page.seoData) : null,
            page.datasources ? JSON.stringify(page.datasources) : null,
            page.cssBundle || null,
            page.version,
            page.publishedAt,
            page.isPublic,
            page.isHomepage,
            page.contentHash || null,
            (/* @__PURE__ */ new Date()).toISOString()
          ]
        );
        console.log(`\u{1F418} Upserted page (PG): ${page.slug} (v${page.version})`);
        return { success: true, version: page.version };
      }
      rowToPage(row) {
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          title: row.title || void 0,
          description: row.description || void 0,
          layoutData: JSON.parse(row.layout_data),
          seoData: row.seo_data ? JSON.parse(row.seo_data) : void 0,
          datasources: row.datasources ? JSON.parse(row.datasources) : void 0,
          cssBundle: row.css_bundle || void 0,
          version: row.version,
          publishedAt: row.published_at,
          isPublic: !!row.is_public,
          isHomepage: !!row.is_homepage
        };
      }
      async getPageBySlug(slug) {
        const row = await this.get(`SELECT * FROM ${SCHEMA}.published_pages WHERE slug = $1`, [slug]);
        return row ? this.rowToPage(row) : null;
      }
      async getHomepage() {
        const row = await this.get(`SELECT * FROM ${SCHEMA}.published_pages WHERE is_homepage = TRUE`);
        return row ? this.rowToPage(row) : null;
      }
      async deletePage(slug) {
        await this.query(`DELETE FROM ${SCHEMA}.published_pages WHERE slug = $1`, [slug]);
        return true;
      }
      async listPages() {
        return this.all(
          `SELECT id, slug, name, version FROM ${SCHEMA}.published_pages`
        );
      }
      async listPublicPageSlugs() {
        const rows = await this.all(
          `SELECT slug, updated_at, is_homepage FROM ${SCHEMA}.published_pages WHERE is_public = TRUE`
        );
        return rows.map((r) => ({
          slug: r.slug,
          updatedAt: r.updated_at,
          isHomepage: !!r.is_homepage
        }));
      }
      // =========================================================================
      // Project Settings
      // =========================================================================
      async getProjectSettings() {
        const row = await this.get(`SELECT * FROM ${SCHEMA}.project_settings WHERE id = 'default'`);
        if (!row) {
          return {
            id: "default",
            faviconUrl: null,
            logoUrl: null,
            siteName: null,
            siteDescription: null,
            appUrl: null,
            authForms: null,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        return {
          id: row.id,
          faviconUrl: row.favicon_url || null,
          logoUrl: row.logo_url || null,
          siteName: row.site_name || null,
          siteDescription: row.site_description || null,
          appUrl: row.app_url || null,
          authForms: row.auth_forms || null,
          updatedAt: row.updated_at
        };
      }
      async getFaviconUrl() {
        return (await this.getProjectSettings()).faviconUrl || DEFAULT_FAVICON3;
      }
      async updateProjectSettings(updates) {
        const existing = await this.get(`SELECT id FROM ${SCHEMA}.project_settings WHERE id = 'default'`);
        const now = (/* @__PURE__ */ new Date()).toISOString();
        if (existing) {
          const setClauses = [`updated_at = $1`];
          const params = [now];
          let idx = 2;
          if (updates.faviconUrl !== void 0) {
            setClauses.push(`favicon_url = $${idx}`);
            params.push(updates.faviconUrl);
            idx++;
          }
          if (updates.logoUrl !== void 0) {
            setClauses.push(`logo_url = $${idx}`);
            params.push(updates.logoUrl);
            idx++;
          }
          if (updates.siteName !== void 0) {
            setClauses.push(`site_name = $${idx}`);
            params.push(updates.siteName);
            idx++;
          }
          if (updates.siteDescription !== void 0) {
            setClauses.push(`site_description = $${idx}`);
            params.push(updates.siteDescription);
            idx++;
          }
          if (updates.appUrl !== void 0) {
            setClauses.push(`app_url = $${idx}`);
            params.push(updates.appUrl);
            idx++;
          }
          if (updates.authForms !== void 0) {
            setClauses.push(`auth_forms = $${idx}`);
            params.push(updates.authForms);
            idx++;
          }
          await this.query(`UPDATE ${SCHEMA}.project_settings SET ${setClauses.join(", ")} WHERE id = 'default'`, params);
        } else {
          await this.query(
            `INSERT INTO ${SCHEMA}.project_settings (id, favicon_url, logo_url, site_name, site_description, app_url, auth_forms, updated_at) VALUES ('default', $1, $2, $3, $4, $5, $6, $7)`,
            [updates.faviconUrl || null, updates.logoUrl || null, updates.siteName || null, updates.siteDescription || null, updates.appUrl || null, updates.authForms || null, now]
          );
        }
        return this.getProjectSettings();
      }
      // =========================================================================
      // Workflows
      // =========================================================================
      async upsertWorkflow(workflow) {
        const existing = await this.get(
          `SELECT version FROM ${SCHEMA}.workflows WHERE id = $1`,
          [workflow.id]
        );
        const now = (/* @__PURE__ */ new Date()).toISOString();
        if (existing) {
          const newVersion = (existing.version || 1) + 1;
          await this.query(
            `UPDATE ${SCHEMA}.workflows SET name=$1, description=$2, trigger_type=$3, trigger_config=$4, nodes=$5, edges=$6, settings=$7, version=$8, updated_at=$9, published_by=$10 WHERE id=$11`,
            [workflow.name, workflow.description, workflow.triggerType, workflow.triggerConfig, workflow.nodes, workflow.edges, workflow.settings || null, newVersion, now, workflow.publishedBy, workflow.id]
          );
          return { version: newVersion };
        } else {
          await this.query(
            `INSERT INTO ${SCHEMA}.workflows (id, name, description, trigger_type, trigger_config, nodes, edges, settings, version, is_active, created_at, updated_at, published_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, TRUE, $9, $9, $10)`,
            [workflow.id, workflow.name, workflow.description, workflow.triggerType, workflow.triggerConfig, workflow.nodes, workflow.edges, workflow.settings || null, now, workflow.publishedBy]
          );
          return { version: 1 };
        }
      }
      async getWorkflowById(id) {
        const row = await this.get(`SELECT * FROM ${SCHEMA}.workflows WHERE id = $1`, [id]);
        return row ? this.rowToWorkflow(row) : null;
      }
      async getActiveWebhookWorkflow(id) {
        const row = await this.get(
          `SELECT * FROM ${SCHEMA}.workflows WHERE id = $1 AND is_active = TRUE`,
          [id]
        );
        return row ? this.rowToWorkflow(row) : null;
      }
      rowToWorkflow(row) {
        return {
          id: row.id,
          name: row.name,
          description: row.description || null,
          triggerType: row.trigger_type,
          triggerConfig: row.trigger_config || null,
          nodes: row.nodes,
          edges: row.edges,
          settings: row.settings || null,
          version: row.version,
          isActive: !!row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          publishedBy: row.published_by || null
        };
      }
      async listWorkflows() {
        const rows = await this.all(`SELECT * FROM ${SCHEMA}.workflows`);
        return rows.map((r) => this.rowToWorkflow(r));
      }
      async deleteWorkflow(id) {
        await this.query(`DELETE FROM ${SCHEMA}.workflows WHERE id = $1`, [id]);
        return true;
      }
      async toggleWorkflow(id, isActive) {
        await this.query(
          `UPDATE ${SCHEMA}.workflows SET is_active = $1, updated_at = $2 WHERE id = $3`,
          [isActive, (/* @__PURE__ */ new Date()).toISOString(), id]
        );
      }
      async createExecution(execution) {
        await this.query(
          `INSERT INTO ${SCHEMA}.executions (id, workflow_id, status, trigger_type, trigger_payload, node_executions, started_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [execution.id, execution.workflowId, execution.status, execution.triggerType, execution.triggerPayload || null, execution.nodeExecutions || null, execution.startedAt]
        );
      }
      async getExecutionById(id) {
        const row = await this.get(`SELECT * FROM ${SCHEMA}.executions WHERE id = $1`, [id]);
        return row ? this.rowToExecution(row) : null;
      }
      async updateExecution(id, updates) {
        const setClauses = [];
        const params = [];
        let idx = 1;
        if (updates.status !== void 0) {
          setClauses.push(`status = $${idx}`);
          params.push(updates.status);
          idx++;
        }
        if (updates.result !== void 0) {
          setClauses.push(`result = $${idx}`);
          params.push(updates.result);
          idx++;
        }
        if (updates.error !== void 0) {
          setClauses.push(`error = $${idx}`);
          params.push(updates.error);
          idx++;
        }
        if (updates.nodeExecutions !== void 0) {
          setClauses.push(`node_executions = $${idx}`);
          params.push(updates.nodeExecutions);
          idx++;
        }
        if (updates.usage !== void 0) {
          setClauses.push(`usage = $${idx}`);
          params.push(updates.usage);
          idx++;
        }
        if (updates.endedAt !== void 0) {
          setClauses.push(`ended_at = $${idx}`);
          params.push(updates.endedAt);
          idx++;
        }
        if (setClauses.length > 0) {
          params.push(id);
          await this.query(`UPDATE ${SCHEMA}.executions SET ${setClauses.join(", ")} WHERE id = $${idx}`, params);
        }
      }
      async listExecutionsByWorkflow(workflowId, limit = 20) {
        const rows = await this.all(
          `SELECT * FROM ${SCHEMA}.executions WHERE workflow_id = $1 ORDER BY started_at DESC LIMIT $2`,
          [workflowId, limit]
        );
        return rows.map((r) => this.rowToExecution(r));
      }
      async listAllExecutions(filters) {
        const conditions = [];
        const params = [];
        let idx = 1;
        if (filters?.workflowId) {
          conditions.push(`workflow_id = $${idx}`);
          params.push(filters.workflowId);
          idx++;
        }
        if (filters?.since) {
          conditions.push(`started_at >= $${idx}`);
          params.push(filters.since);
          idx++;
        }
        if (filters?.until) {
          conditions.push(`started_at <= $${idx}`);
          params.push(filters.until);
          idx++;
        }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        params.push(filters?.limit || 100);
        let rows = await this.all(
          `SELECT * FROM ${SCHEMA}.executions ${where} ORDER BY started_at DESC LIMIT $${idx}`,
          params
        );
        if (filters?.status && filters.status.length > 0) {
          rows = rows.filter((r) => filters.status.includes(r.status));
        }
        return rows.map((r) => this.rowToExecution(r));
      }
      async getExecutionStats() {
        const rows = await this.all(`SELECT * FROM ${SCHEMA}.executions`);
        const statsMap = /* @__PURE__ */ new Map();
        for (const exec of rows) {
          const wid = exec.workflow_id;
          const current = statsMap.get(wid) || { workflowId: wid, totalRuns: 0, successfulRuns: 0, failedRuns: 0 };
          current.totalRuns++;
          if (exec.status === "completed") current.successfulRuns++;
          else if (exec.status === "error") current.failedRuns++;
          statsMap.set(wid, current);
        }
        return Array.from(statsMap.values());
      }
      rowToExecution(row) {
        return {
          id: row.id,
          workflowId: row.workflow_id,
          status: row.status,
          triggerType: row.trigger_type,
          triggerPayload: row.trigger_payload || null,
          nodeExecutions: row.node_executions || null,
          result: row.result || null,
          error: row.error || null,
          usage: row.usage || null,
          startedAt: row.started_at,
          endedAt: row.ended_at || null
        };
      }
      // =========================================================================
      // Dead Letter Queue
      // =========================================================================
      async createDeadLetter(deadLetter) {
        await this.query(
          `INSERT INTO ${SCHEMA}.dead_letters (id, workflow_id, execution_id, error, payload, retry_count) VALUES ($1, $2, $3, $4, $5, $6)`,
          [deadLetter.id, deadLetter.workflowId, deadLetter.executionId, deadLetter.error, deadLetter.payload, deadLetter.retryCount || 0]
        );
      }
      // =========================================================================
      // Agent Tools
      // =========================================================================
      async listAgentTools(profileSlug, includeInactive = false) {
        const where = includeInactive ? `WHERE profile_slug = $1` : `WHERE profile_slug = $1 AND is_active = TRUE`;
        const rows = await this.all(
          `SELECT * FROM ${SCHEMA}.agent_tools ${where}`,
          [profileSlug]
        );
        return rows.map((r) => ({
          id: r.id,
          profileSlug: r.profile_slug,
          type: r.type,
          name: r.name,
          description: r.description || null,
          config: r.config,
          isActive: !!r.is_active,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
      }
      async upsertAgentTool(tool) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        await this.query(
          `INSERT INTO ${SCHEMA}.agent_tools (id, profile_slug, type, name, description, config, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT(id) DO UPDATE SET
               profile_slug=EXCLUDED.profile_slug, type=EXCLUDED.type, name=EXCLUDED.name,
               description=EXCLUDED.description, config=EXCLUDED.config,
               is_active=EXCLUDED.is_active, updated_at=EXCLUDED.updated_at`,
          [
            tool.id,
            tool.profileSlug,
            tool.type,
            tool.name,
            tool.description,
            tool.config,
            tool.isActive,
            tool.createdAt || now,
            now
          ]
        );
      }
      async deleteAgentTool(id) {
        await this.query(`DELETE FROM ${SCHEMA}.agent_tools WHERE id = $1`, [id]);
        return true;
      }
    };
  }
});

// src/storage/SupabaseRestProvider.ts
var SupabaseRestProvider_exports = {};
__export(SupabaseRestProvider_exports, {
  SupabaseRestProvider: () => SupabaseRestProvider
});
function getClient() {
  if (_client) return _client;
  const { getStateDbConfig: getStateDbConfig2 } = (init_env(), __toCommonJS(env_exports));
  const cfg = getStateDbConfig2();
  const supabaseUrl = cfg.url;
  const anonKey = cfg.anonKey;
  const scopedJwt = cfg.jwt;
  if (!supabaseUrl || !anonKey || !scopedJwt) {
    throw new Error(
      "[SupabaseRestProvider] Missing config in FRONTBASE_STATE_DB: url, anonKey, jwt"
    );
  }
  const { PostgrestClient } = __require("@supabase/postgrest-js");
  _client = new PostgrestClient(`${supabaseUrl}/rest/v1`, {
    headers: {
      apikey: anonKey,
      // API gateway auth
      Authorization: `Bearer ${scopedJwt}`
      // PG role = frontbase_edge_role
    },
    schema: SCHEMA2
  });
  console.log(`\u{1F418} SupabaseRestProvider initialized: ${supabaseUrl} (schema: ${SCHEMA2})`);
  return _client;
}
function throwIfError(result, context) {
  if (result.error) {
    const e = result.error;
    const msg = e.message || e.details || e.hint || e.code || JSON.stringify(e);
    throw new Error(`[SupabaseRest] ${context}: ${msg}`);
  }
}
var DEFAULT_FAVICON4, SCHEMA2, _client, SupabaseRestProvider;
var init_SupabaseRestProvider = __esm({
  "src/storage/SupabaseRestProvider.ts"() {
    "use strict";
    DEFAULT_FAVICON4 = "/static/icon.png";
    SCHEMA2 = process.env.FRONTBASE_SCHEMA_NAME || "frontbase_edge";
    _client = null;
    SupabaseRestProvider = class {
      // =========================================================================
      // Lifecycle
      // =========================================================================
      async init() {
        const client = getClient();
        const { error } = await client.from("published_pages").select("slug", { count: "exact", head: true });
        if (error) {
          const e = error;
          const detail = [e.message, e.details, e.hint, e.code].filter(Boolean).join(" | ");
          throw new Error(`[SupabaseRest] init failed: ${detail || JSON.stringify(e)}`);
        }
        console.log(`\u{1F418} SupabaseRestProvider ready (PostgREST) \u2014 schema: ${SCHEMA2}`);
      }
      async initSettings() {
      }
      // =========================================================================
      // Pages CRUD
      // =========================================================================
      async upsertPage(page) {
        const client = getClient();
        if (page.isHomepage) {
          await client.from("published_pages").update({ is_homepage: false }).eq("is_homepage", true);
        }
        const row = {
          id: page.id,
          slug: page.slug,
          name: page.name,
          title: page.title || null,
          description: page.description || null,
          layout_data: JSON.stringify(page.layoutData),
          seo_data: page.seoData ? JSON.stringify(page.seoData) : null,
          datasources: page.datasources ? JSON.stringify(page.datasources) : null,
          css_bundle: page.cssBundle || null,
          version: page.version,
          published_at: page.publishedAt,
          is_public: page.isPublic,
          is_homepage: page.isHomepage,
          content_hash: page.contentHash || null,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        const result = await client.from("published_pages").upsert(row, { onConflict: "id" });
        throwIfError(result, `upsertPage(${page.slug})`);
        console.log(`\u{1F418} Upserted page (PostgREST): ${page.slug} (v${page.version})`);
        return { success: true, version: page.version };
      }
      rowToPage(row) {
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          title: row.title || void 0,
          description: row.description || void 0,
          layoutData: typeof row.layout_data === "string" ? JSON.parse(row.layout_data) : row.layout_data,
          seoData: row.seo_data ? typeof row.seo_data === "string" ? JSON.parse(row.seo_data) : row.seo_data : void 0,
          datasources: row.datasources ? typeof row.datasources === "string" ? JSON.parse(row.datasources) : row.datasources : void 0,
          cssBundle: row.css_bundle || void 0,
          version: row.version,
          publishedAt: row.published_at,
          isPublic: !!row.is_public,
          isHomepage: !!row.is_homepage
        };
      }
      async getPageBySlug(slug) {
        const client = getClient();
        const { data, error } = await client.from("published_pages").select("*").eq("slug", slug).maybeSingle();
        if (error) throw new Error(`[SupabaseRest] getPageBySlug: ${error.message}`);
        return data ? this.rowToPage(data) : null;
      }
      async getHomepage() {
        const client = getClient();
        const { data, error } = await client.from("published_pages").select("*").eq("is_homepage", true).maybeSingle();
        if (error) throw new Error(`[SupabaseRest] getHomepage: ${error.message}`);
        return data ? this.rowToPage(data) : null;
      }
      async deletePage(slug) {
        const client = getClient();
        const result = await client.from("published_pages").delete().eq("slug", slug);
        throwIfError(result, `deletePage(${slug})`);
        return true;
      }
      async listPages() {
        const client = getClient();
        const { data, error } = await client.from("published_pages").select("id, slug, name, version");
        if (error) throw new Error(`[SupabaseRest] listPages: ${error.message}`);
        return data || [];
      }
      async listPublicPageSlugs() {
        const client = getClient();
        const { data, error } = await client.from("published_pages").select("slug, updated_at, is_homepage").eq("is_public", true);
        if (error) throw new Error(`[SupabaseRest] listPublicPageSlugs: ${error.message}`);
        return (data || []).map((r) => ({
          slug: r.slug,
          updatedAt: r.updated_at,
          isHomepage: !!r.is_homepage
        }));
      }
      // =========================================================================
      // Project Settings
      // =========================================================================
      async getProjectSettings() {
        const client = getClient();
        const { data, error } = await client.from("project_settings").select("*").eq("id", "default").maybeSingle();
        if (error) throw new Error(`[SupabaseRest] getProjectSettings: ${error.message}`);
        if (!data) {
          return {
            id: "default",
            faviconUrl: null,
            logoUrl: null,
            siteName: null,
            siteDescription: null,
            appUrl: null,
            authForms: null,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        return {
          id: data.id,
          faviconUrl: data.favicon_url || null,
          logoUrl: data.logo_url || null,
          siteName: data.site_name || null,
          siteDescription: data.site_description || null,
          appUrl: data.app_url || null,
          authForms: data.auth_forms || null,
          updatedAt: data.updated_at
        };
      }
      async getFaviconUrl() {
        return (await this.getProjectSettings()).faviconUrl || DEFAULT_FAVICON4;
      }
      async updateProjectSettings(updates) {
        const client = getClient();
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const row = {
          id: "default",
          updated_at: now
        };
        if (updates.faviconUrl !== void 0) row.favicon_url = updates.faviconUrl;
        if (updates.logoUrl !== void 0) row.logo_url = updates.logoUrl;
        if (updates.siteName !== void 0) row.site_name = updates.siteName;
        if (updates.siteDescription !== void 0) row.site_description = updates.siteDescription;
        if (updates.appUrl !== void 0) row.app_url = updates.appUrl;
        if (updates.authForms !== void 0) row.auth_forms = updates.authForms;
        const result = await client.from("project_settings").upsert(row, { onConflict: "id" });
        throwIfError(result, "updateProjectSettings");
        return this.getProjectSettings();
      }
      // =========================================================================
      // Workflows
      // =========================================================================
      async upsertWorkflow(workflow) {
        const client = getClient();
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const { data: existing } = await client.from("workflows").select("version").eq("id", workflow.id).maybeSingle();
        const newVersion = existing ? (existing.version || 1) + 1 : 1;
        const row = {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          trigger_type: workflow.triggerType,
          trigger_config: workflow.triggerConfig,
          nodes: workflow.nodes,
          edges: workflow.edges,
          settings: workflow.settings || null,
          version: newVersion,
          is_active: existing ? void 0 : true,
          // Only set on insert
          created_at: existing ? void 0 : now,
          // Only set on insert
          updated_at: now,
          published_by: workflow.publishedBy
        };
        const cleanRow = Object.fromEntries(
          Object.entries(row).filter(([_, v]) => v !== void 0)
        );
        const result = await client.from("workflows").upsert(cleanRow, { onConflict: "id" });
        throwIfError(result, `upsertWorkflow(${workflow.id})`);
        return { version: newVersion };
      }
      async getWorkflowById(id) {
        const client = getClient();
        const { data, error } = await client.from("workflows").select("*").eq("id", id).maybeSingle();
        if (error) throw new Error(`[SupabaseRest] getWorkflowById: ${error.message}`);
        return data ? this.rowToWorkflow(data) : null;
      }
      async getActiveWebhookWorkflow(id) {
        const client = getClient();
        const { data, error } = await client.from("workflows").select("*").eq("id", id).eq("is_active", true).maybeSingle();
        if (error) throw new Error(`[SupabaseRest] getActiveWebhookWorkflow: ${error.message}`);
        return data ? this.rowToWorkflow(data) : null;
      }
      rowToWorkflow(row) {
        return {
          id: row.id,
          name: row.name,
          description: row.description || null,
          triggerType: row.trigger_type,
          triggerConfig: row.trigger_config || null,
          nodes: row.nodes,
          edges: row.edges,
          settings: row.settings || null,
          version: row.version,
          isActive: !!row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          publishedBy: row.published_by || null
        };
      }
      async listWorkflows() {
        const client = getClient();
        const { data, error } = await client.from("workflows").select("*");
        if (error) throw new Error(`[SupabaseRest] listWorkflows: ${error.message}`);
        return (data || []).map((r) => this.rowToWorkflow(r));
      }
      async deleteWorkflow(id) {
        const client = getClient();
        const result = await client.from("workflows").delete().eq("id", id);
        throwIfError(result, `deleteWorkflow(${id})`);
        return true;
      }
      async toggleWorkflow(id, isActive) {
        const client = getClient();
        const result = await client.from("workflows").update({ is_active: isActive, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id);
        throwIfError(result, `toggleWorkflow(${id})`);
      }
      // =========================================================================
      // Executions
      // =========================================================================
      async createExecution(execution) {
        const client = getClient();
        const result = await client.from("executions").insert({
          id: execution.id,
          workflow_id: execution.workflowId,
          status: execution.status,
          trigger_type: execution.triggerType,
          trigger_payload: execution.triggerPayload || null,
          node_executions: execution.nodeExecutions || null,
          started_at: execution.startedAt
        });
        throwIfError(result, "createExecution");
      }
      async getExecutionById(id) {
        const client = getClient();
        const { data, error } = await client.from("executions").select("*").eq("id", id).maybeSingle();
        if (error) throw new Error(`[SupabaseRest] getExecutionById: ${error.message}`);
        return data ? this.rowToExecution(data) : null;
      }
      async updateExecution(id, updates) {
        const client = getClient();
        const row = {};
        if (updates.status !== void 0) row.status = updates.status;
        if (updates.result !== void 0) row.result = updates.result;
        if (updates.error !== void 0) row.error = updates.error;
        if (updates.nodeExecutions !== void 0) row.node_executions = updates.nodeExecutions;
        if (updates.usage !== void 0) row.usage = updates.usage;
        if (updates.endedAt !== void 0) row.ended_at = updates.endedAt;
        if (Object.keys(row).length > 0) {
          const result = await client.from("executions").update(row).eq("id", id);
          throwIfError(result, `updateExecution(${id})`);
        }
      }
      async listExecutionsByWorkflow(workflowId, limit = 20) {
        const client = getClient();
        const { data, error } = await client.from("executions").select("*").eq("workflow_id", workflowId).order("started_at", { ascending: false }).limit(limit);
        if (error) throw new Error(`[SupabaseRest] listExecutionsByWorkflow: ${error.message}`);
        return (data || []).map((r) => this.rowToExecution(r));
      }
      async listAllExecutions(filters) {
        const client = getClient();
        let query = client.from("executions").select("*").order("started_at", { ascending: false }).limit(filters?.limit || 100);
        if (filters?.workflowId) query = query.eq("workflow_id", filters.workflowId);
        if (filters?.since) query = query.gte("started_at", filters.since);
        if (filters?.until) query = query.lte("started_at", filters.until);
        if (filters?.status && filters.status.length > 0) {
          query = query.in("status", filters.status);
        }
        const { data, error } = await query;
        if (error) throw new Error(`[SupabaseRest] listAllExecutions: ${error.message}`);
        return (data || []).map((r) => this.rowToExecution(r));
      }
      async getExecutionStats() {
        const client = getClient();
        const { data, error } = await client.from("executions").select("workflow_id, status");
        if (error) throw new Error(`[SupabaseRest] getExecutionStats: ${error.message}`);
        const statsMap = /* @__PURE__ */ new Map();
        for (const row of data || []) {
          const wid = row.workflow_id;
          const current = statsMap.get(wid) || { workflowId: wid, totalRuns: 0, successfulRuns: 0, failedRuns: 0 };
          current.totalRuns++;
          if (row.status === "completed") current.successfulRuns++;
          else if (row.status === "error") current.failedRuns++;
          statsMap.set(wid, current);
        }
        return Array.from(statsMap.values());
      }
      rowToExecution(row) {
        return {
          id: row.id,
          workflowId: row.workflow_id,
          status: row.status,
          triggerType: row.trigger_type,
          triggerPayload: row.trigger_payload || null,
          nodeExecutions: row.node_executions || null,
          result: row.result || null,
          error: row.error || null,
          usage: row.usage || null,
          startedAt: row.started_at,
          endedAt: row.ended_at || null
        };
      }
      // =========================================================================
      // Dead Letter Queue
      // =========================================================================
      async createDeadLetter(deadLetter) {
        const client = getClient();
        const result = await client.from("dead_letters").insert({
          id: deadLetter.id,
          workflow_id: deadLetter.workflowId,
          execution_id: deadLetter.executionId,
          error: deadLetter.error,
          payload: deadLetter.payload,
          retry_count: deadLetter.retryCount || 0
        });
        throwIfError(result, "createDeadLetter");
      }
      // =========================================================================
      // Agent Tools
      // =========================================================================
      async listAgentTools(profileSlug, includeInactive = false) {
        const client = getClient();
        let query = client.from("agent_tools").select("*").eq("profile_slug", profileSlug);
        if (!includeInactive) {
          query = query.eq("is_active", true);
        }
        const { data, error } = await query;
        if (error) throw new Error(`[SupabaseRest] listAgentTools: ${error.message}`);
        return (data || []).map((r) => ({
          id: r.id,
          profileSlug: r.profile_slug,
          type: r.type,
          name: r.name,
          description: r.description || null,
          config: r.config,
          isActive: !!r.is_active,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
      }
      async upsertAgentTool(tool) {
        const client = getClient();
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const result = await client.from("agent_tools").upsert({
          id: tool.id,
          profile_slug: tool.profileSlug,
          type: tool.type,
          name: tool.name,
          description: tool.description,
          config: tool.config,
          is_active: tool.isActive,
          created_at: tool.createdAt || now,
          updated_at: now
        }, { onConflict: "id" });
        throwIfError(result, `upsertAgentTool(${tool.id})`);
      }
      async deleteAgentTool(id) {
        const client = getClient();
        const result = await client.from("agent_tools").delete().eq("id", id);
        throwIfError(result, `deleteAgentTool(${id})`);
        return true;
      }
    };
  }
});

// src/storage/TursoHttpProvider.ts
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { sql as sql3 } from "drizzle-orm";

// src/storage/DrizzleStateProvider.ts
import { sql as sql2, eq, and, desc } from "drizzle-orm";

// src/storage/schema.ts
import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
var publishedPages = sqliteTable("published_pages", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  title: text("title"),
  description: text("description"),
  layoutData: text("layout_data").notNull(),
  seoData: text("seo_data"),
  datasources: text("datasources"),
  cssBundle: text("css_bundle"),
  version: integer("version").notNull().default(1),
  publishedAt: text("published_at").notNull(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
  isHomepage: integer("is_homepage", { mode: "boolean" }).notNull().default(false),
  contentHash: text("content_hash"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});
var projectSettings = sqliteTable("project_settings", {
  id: text("id").primaryKey().default("default"),
  faviconUrl: text("favicon_url"),
  logoUrl: text("logo_url"),
  siteName: text("site_name"),
  siteDescription: text("site_description"),
  appUrl: text("app_url"),
  authForms: text("auth_forms"),
  // JSON map: { [formId]: { type, title, primaryColor, providers, ... } }
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});
var workflowsTable = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull(),
  triggerConfig: text("trigger_config"),
  nodes: text("nodes").notNull(),
  edges: text("edges").notNull(),
  settings: text("settings"),
  version: integer("version").notNull().default(1),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  publishedBy: text("published_by")
});
var executionsTable = sqliteTable("executions", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  status: text("status").notNull(),
  triggerType: text("trigger_type").notNull(),
  triggerPayload: text("trigger_payload"),
  nodeExecutions: text("node_executions"),
  result: text("result"),
  error: text("error"),
  usage: real("usage").default(0),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  endedAt: text("ended_at")
});
var edgeLogsTable = sqliteTable("edge_logs", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  level: text("level").notNull(),
  // debug | info | warn | error
  message: text("message").notNull(),
  source: text("source").default("runtime"),
  // runtime | request | error | system
  metadata: text("metadata"),
  // JSON string — provider-specific extras
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});
var agentToolsTable = sqliteTable("agent_tools", {
  id: text("id").primaryKey(),
  profileSlug: text("profile_slug").notNull(),
  // Which agent profile owns this tool
  type: text("type").notNull(),
  // 'workflow' | 'mcp_server'
  name: text("name").notNull(),
  // LLM-facing tool name (e.g., "send_welcome_email")
  description: text("description"),
  // LLM-facing description
  config: text("config").notNull(),
  // JSON blob (type-discriminated)
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

// src/storage/DrizzleStateProvider.ts
var DEFAULT_FAVICON = "/static/icon.png";
var DrizzleStateProvider = class {
  async initSettings() {
  }
  // =========================================================================
  // Pages CRUD
  // =========================================================================
  async upsertPage(page) {
    const database = this.getDb();
    const record = {
      id: page.id,
      slug: page.slug,
      name: page.name,
      title: page.title || null,
      description: page.description || null,
      layoutData: JSON.stringify(page.layoutData),
      seoData: page.seoData ? JSON.stringify(page.seoData) : null,
      datasources: page.datasources ? JSON.stringify(page.datasources) : null,
      cssBundle: page.cssBundle || null,
      version: page.version,
      publishedAt: page.publishedAt,
      isPublic: page.isPublic,
      isHomepage: page.isHomepage,
      contentHash: page.contentHash || null
    };
    if (page.isHomepage) {
      await database.update(publishedPages).set({ isHomepage: false }).where(eq(publishedPages.isHomepage, true));
    }
    await database.insert(publishedPages).values(record).onConflictDoUpdate({
      target: publishedPages.id,
      set: { ...record, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }
    });
    return { success: true, version: page.version };
  }
  async getPageBySlug(slug) {
    const record = await this.getDb().select().from(publishedPages).where(eq(publishedPages.slug, slug)).get();
    return record ? this.recordToPage(record) : null;
  }
  async getHomepage() {
    const record = await this.getDb().select().from(publishedPages).where(eq(publishedPages.isHomepage, true)).get();
    return record ? this.recordToPage(record) : null;
  }
  async deletePage(slug) {
    await this.getDb().delete(publishedPages).where(eq(publishedPages.slug, slug));
    return true;
  }
  async listPages() {
    return await this.getDb().select({
      id: publishedPages.id,
      slug: publishedPages.slug,
      name: publishedPages.name,
      version: publishedPages.version
    }).from(publishedPages);
  }
  async listPublicPageSlugs() {
    return await this.getDb().select({
      slug: publishedPages.slug,
      updatedAt: publishedPages.updatedAt,
      isHomepage: publishedPages.isHomepage
    }).from(publishedPages).where(eq(publishedPages.isPublic, true));
  }
  recordToPage(record) {
    return {
      id: record.id,
      slug: record.slug,
      name: record.name,
      title: record.title || void 0,
      description: record.description || void 0,
      layoutData: JSON.parse(record.layoutData),
      seoData: record.seoData ? JSON.parse(record.seoData) : void 0,
      datasources: record.datasources ? JSON.parse(record.datasources) : void 0,
      cssBundle: record.cssBundle || void 0,
      version: record.version,
      publishedAt: record.publishedAt,
      isPublic: record.isPublic,
      isHomepage: record.isHomepage
    };
  }
  // =========================================================================
  // Project Settings
  // =========================================================================
  async getProjectSettings() {
    const record = await this.getDb().select().from(projectSettings).where(eq(projectSettings.id, "default")).get();
    if (!record) {
      return {
        id: "default",
        faviconUrl: null,
        logoUrl: null,
        siteName: null,
        siteDescription: null,
        appUrl: null,
        authForms: null,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    return record;
  }
  async getFaviconUrl() {
    return (await this.getProjectSettings()).faviconUrl || DEFAULT_FAVICON;
  }
  async updateProjectSettings(updates) {
    const database = this.getDb();
    const existing = await database.select().from(projectSettings).where(eq(projectSettings.id, "default")).get();
    if (existing) {
      await database.update(projectSettings).set({ ...updates, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(projectSettings.id, "default"));
    } else {
      await database.insert(projectSettings).values({
        id: "default",
        ...updates,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return this.getProjectSettings();
  }
  // =========================================================================
  // Workflows CRUD
  // =========================================================================
  async upsertWorkflow(workflow) {
    const database = this.getDb();
    const existing = await database.select().from(workflowsTable).where(eq(workflowsTable.id, workflow.id)).get();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (existing) {
      const newVersion = (existing.version || 1) + 1;
      await database.update(workflowsTable).set({
        name: workflow.name,
        description: workflow.description,
        triggerType: workflow.triggerType,
        triggerConfig: workflow.triggerConfig,
        nodes: workflow.nodes,
        edges: workflow.edges,
        settings: workflow.settings || null,
        version: newVersion,
        updatedAt: now,
        publishedBy: workflow.publishedBy
      }).where(eq(workflowsTable.id, workflow.id));
      return { version: newVersion };
    } else {
      await database.insert(workflowsTable).values({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        triggerType: workflow.triggerType,
        triggerConfig: workflow.triggerConfig,
        nodes: workflow.nodes,
        edges: workflow.edges,
        settings: workflow.settings || null,
        version: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        publishedBy: workflow.publishedBy
      });
      return { version: 1 };
    }
  }
  async getWorkflowById(id) {
    const row = await this.getDb().select().from(workflowsTable).where(eq(workflowsTable.id, id)).get();
    return row ? { ...row, isActive: !!row.isActive } : null;
  }
  async getActiveWebhookWorkflow(id) {
    const row = await this.getDb().select().from(workflowsTable).where(and(eq(workflowsTable.id, id), eq(workflowsTable.isActive, true))).get();
    return row ? { ...row, isActive: !!row.isActive } : null;
  }
  async listWorkflows() {
    const rows = await this.getDb().select().from(workflowsTable);
    return rows.map((r) => ({ ...r, isActive: !!r.isActive }));
  }
  async deleteWorkflow(id) {
    await this.getDb().delete(workflowsTable).where(eq(workflowsTable.id, id));
    return true;
  }
  async toggleWorkflow(id, isActive) {
    await this.getDb().update(workflowsTable).set({ isActive, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(workflowsTable.id, id));
  }
  // =========================================================================
  // Executions CRUD
  // =========================================================================
  async createExecution(execution) {
    await this.getDb().insert(executionsTable).values({
      id: execution.id,
      workflowId: execution.workflowId,
      status: execution.status,
      triggerType: execution.triggerType,
      triggerPayload: execution.triggerPayload || null,
      nodeExecutions: execution.nodeExecutions || null,
      startedAt: execution.startedAt
    });
  }
  async getExecutionById(id) {
    const row = await this.getDb().select().from(executionsTable).where(eq(executionsTable.id, id)).get();
    return row;
  }
  async updateExecution(id, updates) {
    const setValues = {};
    if (updates.status !== void 0) setValues.status = updates.status;
    if (updates.result !== void 0) setValues.result = updates.result;
    if (updates.error !== void 0) setValues.error = updates.error;
    if (updates.nodeExecutions !== void 0) setValues.nodeExecutions = updates.nodeExecutions;
    if (updates.usage !== void 0) setValues.usage = updates.usage;
    if (updates.endedAt !== void 0) setValues.endedAt = updates.endedAt;
    if (Object.keys(setValues).length > 0) {
      await this.getDb().update(executionsTable).set(setValues).where(eq(executionsTable.id, id));
    }
  }
  async listExecutionsByWorkflow(workflowId, limit = 20) {
    return await this.getDb().select().from(executionsTable).where(eq(executionsTable.workflowId, workflowId)).orderBy(desc(executionsTable.startedAt)).limit(limit);
  }
  async listAllExecutions(filters) {
    const conditions = [];
    if (filters?.workflowId) conditions.push(eq(executionsTable.workflowId, filters.workflowId));
    if (filters?.since) conditions.push(sql2`${executionsTable.startedAt} >= ${filters.since}`);
    if (filters?.until) conditions.push(sql2`${executionsTable.startedAt} <= ${filters.until}`);
    let query = this.getDb().select().from(executionsTable);
    if (conditions.length > 0) query = query.where(and(...conditions));
    let rows = await query.orderBy(desc(executionsTable.startedAt)).limit(filters?.limit || 100);
    if (filters?.status && filters.status.length > 0) {
      rows = rows.filter((r) => filters.status.includes(r.status));
    }
    return rows;
  }
  async getExecutionStats() {
    const allExecutions = await this.getDb().select().from(executionsTable);
    const statsMap = /* @__PURE__ */ new Map();
    for (const exec of allExecutions) {
      const current = statsMap.get(exec.workflowId) || {
        workflowId: exec.workflowId,
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0
      };
      current.totalRuns++;
      if (exec.status === "completed") current.successfulRuns++;
      else if (exec.status === "error") current.failedRuns++;
      statsMap.set(exec.workflowId, current);
    }
    return Array.from(statsMap.values());
  }
  // =========================================================================
  // Dead Letter Queue
  // =========================================================================
  async createDeadLetter(deadLetter) {
    await this.getDb().run(sql2`
            INSERT INTO dead_letters (id, workflow_id, execution_id, error, payload, retry_count)
            VALUES (${deadLetter.id}, ${deadLetter.workflowId}, ${deadLetter.executionId},
                    ${deadLetter.error}, ${deadLetter.payload}, ${deadLetter.retryCount || 0})
        `);
  }
  // =========================================================================
  // Agent Tools CRUD
  // =========================================================================
  async listAgentTools(profileSlug, includeInactive = false) {
    const conditions = [eq(agentToolsTable.profileSlug, profileSlug)];
    if (!includeInactive) {
      conditions.push(eq(agentToolsTable.isActive, true));
    }
    const rows = await this.getDb().select().from(agentToolsTable).where(and(...conditions));
    return rows.map((r) => ({
      ...r,
      isActive: !!r.isActive
    }));
  }
  async upsertAgentTool(tool) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.getDb().insert(agentToolsTable).values({
      id: tool.id,
      profileSlug: tool.profileSlug,
      type: tool.type,
      name: tool.name,
      description: tool.description,
      config: tool.config,
      isActive: tool.isActive,
      createdAt: tool.createdAt || now,
      updatedAt: now
    }).onConflictDoUpdate({
      target: agentToolsTable.id,
      set: {
        profileSlug: tool.profileSlug,
        type: tool.type,
        name: tool.name,
        description: tool.description,
        config: tool.config,
        isActive: tool.isActive,
        updatedAt: now
      }
    });
  }
  async deleteAgentTool(id) {
    await this.getDb().delete(agentToolsTable).where(eq(agentToolsTable.id, id));
    return true;
  }
};

// src/storage/TursoHttpProvider.ts
init_edge_migrations();
init_env();
var TursoHttpProvider = class extends DrizzleStateProvider {
  _db = null;
  /**
   * Lazy DB accessor — creates client on first use.
   * On CF Workers, env vars aren't available at module eval time.
   */
  getDb() {
    if (!this._db) {
      const cfg = getStateDbConfig();
      const url = cfg.url;
      const authToken = cfg.token;
      if (!url) {
        throw new Error(
          "[TursoHttpProvider] FRONTBASE_STATE_DB.url is required. Set FRONTBASE_STATE_DB JSON env var with url and token."
        );
      }
      const client = createClient({ url, authToken });
      this._db = drizzle(client);
      console.log(`\u2601\uFE0F TursoHttpProvider connected to: ${url.substring(0, 40)}...`);
    }
    return this._db;
  }
  async init() {
    await runMigrations(
      async (sqlStr) => {
        await this.getDb().run(sql3.raw(sqlStr));
      },
      "Turso"
    );
    console.log("\u2601\uFE0F State DB initialized (Turso)");
  }
  async initSettings() {
    console.log("\u2601\uFE0F Project settings table initialized (Turso)");
  }
};

// src/storage/LocalSqliteProvider.ts
import { drizzle as drizzle2 } from "drizzle-orm/libsql";
import { createClient as createClient2 } from "@libsql/client";
import { sql as sql4 } from "drizzle-orm";
init_edge_migrations();
var LocalSqliteProvider = class extends DrizzleStateProvider {
  db = null;
  getDb() {
    if (!this.db) {
      const client = createClient2({
        url: process.env.PAGES_DB_URL || "file:./data/pages.db"
      });
      this.db = drizzle2(client);
    }
    return this.db;
  }
  async init() {
    const database = this.getDb();
    await runMigrations(
      async (sqlStr) => {
        await database.run(sql4.raw(sqlStr));
      },
      "LocalSqlite"
    );
    console.log("\u{1F4C4} State DB initialized (local SQLite)");
  }
  async initSettings() {
    console.log("\u2699\uFE0F Project settings database initialized");
  }
};

// src/storage/index.ts
init_env();
var _provider = null;
function isCloudRuntime() {
  const cfg = getStateDbConfig();
  return process.env.FRONTBASE_ADAPTER_PLATFORM === "cloudflare" || process.env.FRONTBASE_DEPLOYMENT_MODE === "cloud" || cfg.provider !== "local" || !!cfg.url;
}
function createInitialProvider() {
  const provider = getStateDbConfig().provider?.toLowerCase();
  switch (provider) {
    case "turso":
      console.log("\u2601\uFE0F Using TursoHttpProvider (explicit)");
      return new TursoHttpProvider();
    case "cloudflare":
    case "cloudflare_d1": {
      const { CfD1HttpProvider: CfD1HttpProvider2 } = (init_CfD1HttpProvider(), __toCommonJS(CfD1HttpProvider_exports));
      console.log("\u{1F536} Using CfD1HttpProvider (D1 via HTTP)");
      return new CfD1HttpProvider2();
    }
    case "neon": {
      const { NeonHttpProvider: NeonHttpProvider2 } = (init_NeonHttpProvider(), __toCommonJS(NeonHttpProvider_exports));
      console.log(`\u{1F418} Using NeonHttpProvider (${provider})`);
      return new NeonHttpProvider2();
    }
    case "supabase": {
      const { SupabaseRestProvider: SupabaseRestProvider2 } = (init_SupabaseRestProvider(), __toCommonJS(SupabaseRestProvider_exports));
      console.log(`\u{1F418} Using SupabaseRestProvider (PostgREST)`);
      return new SupabaseRestProvider2();
    }
    default:
      if (isCloudRuntime()) {
        console.log("\u2601\uFE0F Using TursoHttpProvider (auto-detect)");
        return new TursoHttpProvider();
      }
      console.log("\u{1F4BE} Using LocalSqliteProvider");
      return new LocalSqliteProvider();
  }
}
function getStateProvider() {
  if (_provider && _provider._isStub && isCloudRuntime()) {
    console.log("\u{1F504} Auto-upgrading from stub to TursoHttpProvider (env vars now available)");
    _provider = new TursoHttpProvider();
  }
  if (!_provider) {
    _provider = createInitialProvider();
  }
  return _provider;
}
var _initPromise = null;
function ensureInitialized() {
  if (!_initPromise) {
    const provider = getStateProvider();
    _initPromise = provider.init().catch((err) => {
      _initPromise = null;
      throw err;
    });
  }
  return _initPromise;
}
var stateProvider = new Proxy({}, {
  get(_target, prop) {
    if (prop === "init") {
      return () => ensureInitialized();
    }
    return async (...args) => {
      await ensureInitialized();
      const provider = getStateProvider();
      const value = provider[prop];
      if (typeof value === "function") {
        return value.apply(provider, args);
      }
      return value;
    };
  }
});

export {
  edgeLogsTable,
  getStateProvider,
  ensureInitialized,
  stateProvider
};
