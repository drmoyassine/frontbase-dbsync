import {
  DEFAULT_FAVICON,
  getFaviconUrl,
  getProjectSettings,
  initProjectSettingsDb,
  updateProjectSettings
} from "./chunk-CE2EGWKM.js";
import {
  deletePublishedPage,
  getHomepage,
  getPublishedPageBySlug,
  initPagesDb,
  listPublishedPages,
  upsertPublishedPage
} from "./chunk-5FKI6QA4.js";
import {
  __export
} from "./chunk-MLKGABMK.js";

// src/index.ts
import { OpenAPIHono as OpenAPIHono9 } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "path";
import { fileURLToPath } from "url";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { compress } from "hono/compress";
import { requestId } from "hono/request-id";
import { timeout } from "hono/timeout";
import { bodyLimit } from "hono/body-limit";

// src/routes/health.ts
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
var healthRoute = new OpenAPIHono();
var route = createRoute({
  method: "get",
  path: "/",
  tags: ["System"],
  summary: "Health check",
  description: "Returns service health status and version info",
  responses: {
    200: {
      description: "Service is healthy",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string(),
            service: z.string(),
            version: z.string(),
            timestamp: z.string()
          })
        }
      }
    }
  }
});
healthRoute.openapi(route, (c) => {
  return c.json({
    status: "ok",
    service: "frontbase-actions",
    version: "0.1.0",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});

// src/routes/deploy.ts
import { OpenAPIHono as OpenAPIHono2, createRoute as createRoute2, z as z3 } from "@hono/zod-openapi";

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

// src/schemas/workflow.ts
import { z as z2 } from "@hono/zod-openapi";
var TriggerTypeSchema = z2.enum([
  "manual",
  "http_webhook",
  "scheduled",
  "data_change"
]).openapi("TriggerType");
var ExecutionStatusSchema = z2.enum([
  "started",
  "executing",
  "completed",
  "error",
  "cancelled"
]).openapi("ExecutionStatus");
var NodeExecutionStatusSchema = z2.enum([
  "idle",
  "executing",
  "completed",
  "error",
  "skipped"
]).openapi("NodeExecutionStatus");
var NodePositionSchema = z2.object({
  x: z2.number(),
  y: z2.number()
}).openapi("NodePosition");
var ParameterSchema = z2.object({
  name: z2.string(),
  type: z2.string(),
  value: z2.any().optional(),
  description: z2.string().optional(),
  required: z2.boolean().optional()
}).openapi("Parameter");
var WorkflowNodeSchema = z2.object({
  id: z2.string(),
  name: z2.string(),
  type: z2.string(),
  position: NodePositionSchema,
  inputs: z2.array(ParameterSchema),
  outputs: z2.array(ParameterSchema),
  error: z2.string().optional()
}).openapi("WorkflowNode");
var WorkflowEdgeSchema = z2.object({
  source: z2.string(),
  target: z2.string(),
  sourceOutput: z2.string(),
  targetInput: z2.string()
}).openapi("WorkflowEdge");
var WorkflowSchema = z2.object({
  id: z2.string().uuid(),
  name: z2.string().min(1).max(255),
  description: z2.string().optional(),
  triggerType: TriggerTypeSchema,
  triggerConfig: z2.record(z2.any()).optional(),
  nodes: z2.array(WorkflowNodeSchema),
  edges: z2.array(WorkflowEdgeSchema),
  version: z2.number().int().positive().optional(),
  isActive: z2.boolean().optional()
}).openapi("Workflow");
var DeployWorkflowSchema = z2.object({
  id: z2.string().uuid(),
  name: z2.string().min(1),
  description: z2.string().optional(),
  triggerType: TriggerTypeSchema,
  triggerConfig: z2.record(z2.any()).optional(),
  nodes: z2.array(WorkflowNodeSchema),
  edges: z2.array(WorkflowEdgeSchema),
  publishedBy: z2.string().optional()
}).openapi("DeployWorkflow");
var NodeExecutionSchema = z2.object({
  nodeId: z2.string(),
  status: NodeExecutionStatusSchema,
  outputs: z2.record(z2.any()).optional(),
  error: z2.string().optional(),
  usage: z2.number().optional()
}).openapi("NodeExecution");
var ExecutionSchema = z2.object({
  id: z2.string().uuid(),
  workflowId: z2.string().uuid(),
  status: ExecutionStatusSchema,
  triggerType: TriggerTypeSchema,
  triggerPayload: z2.record(z2.any()).optional(),
  nodeExecutions: z2.array(NodeExecutionSchema).optional(),
  result: z2.record(z2.any()).optional(),
  error: z2.string().optional(),
  usage: z2.number().optional(),
  startedAt: z2.string().datetime(),
  endedAt: z2.string().datetime().optional()
}).openapi("Execution");
var ExecuteRequestSchema = z2.object({
  parameters: z2.record(z2.any()).optional()
}).openapi("ExecuteRequest");
var ExecuteResponseSchema = z2.object({
  executionId: z2.string().uuid(),
  status: ExecutionStatusSchema,
  message: z2.string().optional()
}).openapi("ExecuteResponse");
var WebhookPayloadSchema = z2.object({
  event: z2.string().optional(),
  data: z2.record(z2.any()),
  timestamp: z2.string().datetime().optional()
}).openapi("WebhookPayload");
var ErrorResponseSchema = z2.object({
  error: z2.string(),
  message: z2.string(),
  details: z2.any().optional()
}).openapi("ErrorResponse");
var SuccessResponseSchema = z2.object({
  success: z2.boolean(),
  message: z2.string()
}).openapi("SuccessResponse");

// src/routes/deploy.ts
import { eq } from "drizzle-orm";
var deployRoute = new OpenAPIHono2();
var route2 = createRoute2({
  method: "post",
  path: "/",
  tags: ["Deployment"],
  summary: "Deploy a workflow",
  description: "Receives a workflow from FastAPI and stores it for execution",
  request: {
    body: {
      content: {
        "application/json": {
          schema: DeployWorkflowSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Workflow deployed successfully",
      content: {
        "application/json": {
          schema: SuccessResponseSchema.extend({
            workflowId: z3.string().uuid(),
            version: z3.number()
          })
        }
      }
    },
    400: {
      description: "Invalid workflow data",
      content: {
        "application/json": {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});
deployRoute.openapi(route2, async (c) => {
  try {
    const body = c.req.valid("json");
    const existing = await db.select().from(workflows).where(eq(workflows.id, body.id)).limit(1);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (existing.length > 0) {
      const newVersion = (existing[0].version || 1) + 1;
      await db.update(workflows).set({
        name: body.name,
        description: body.description,
        triggerType: body.triggerType,
        triggerConfig: JSON.stringify(body.triggerConfig || {}),
        nodes: JSON.stringify(body.nodes),
        edges: JSON.stringify(body.edges),
        version: newVersion,
        updatedAt: now,
        publishedBy: body.publishedBy
      }).where(eq(workflows.id, body.id));
      return c.json({
        success: true,
        message: "Workflow updated successfully",
        workflowId: body.id,
        version: newVersion
      }, 200);
    } else {
      await db.insert(workflows).values({
        id: body.id,
        name: body.name,
        description: body.description,
        triggerType: body.triggerType,
        triggerConfig: JSON.stringify(body.triggerConfig || {}),
        nodes: JSON.stringify(body.nodes),
        edges: JSON.stringify(body.edges),
        version: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        publishedBy: body.publishedBy
      });
      return c.json({
        success: true,
        message: "Workflow deployed successfully",
        workflowId: body.id,
        version: 1
      }, 200);
    }
  } catch (error) {
    return c.json({
      error: "DeploymentError",
      message: error.message || "Failed to deploy workflow",
      details: error
    }, 400);
  }
});

// src/routes/execute.ts
import { OpenAPIHono as OpenAPIHono3, createRoute as createRoute3, z as z4 } from "@hono/zod-openapi";
import { v4 as uuidv4 } from "uuid";
import { eq as eq3 } from "drizzle-orm";

// src/engine/runtime.ts
import { eq as eq2 } from "drizzle-orm";
async function executeWorkflow(executionId, workflow, inputParameters) {
  const nodes = JSON.parse(workflow.nodes);
  const edges = JSON.parse(workflow.edges);
  const context = {
    executionId,
    workflowId: workflow.id,
    parameters: inputParameters,
    nodeOutputs: {},
    nodeExecutions: nodes.map((n) => ({
      nodeId: n.id,
      status: "idle"
    }))
  };
  try {
    await updateExecutionStatus(executionId, "executing", context.nodeExecutions);
    const targetNodeIds = new Set(edges.map((e) => e.target));
    const startNodes = nodes.filter((n) => !targetNodeIds.has(n.id));
    const executed = /* @__PURE__ */ new Set();
    const queue = [...startNodes.map((n) => n.id)];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (executed.has(nodeId)) continue;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      const incomingEdges = edges.filter((e) => e.target === nodeId);
      const dependenciesMet = incomingEdges.every((e) => executed.has(e.source));
      if (!dependenciesMet) {
        queue.push(nodeId);
        continue;
      }
      const inputs = {};
      for (const edge of incomingEdges) {
        const sourceOutputs = context.nodeOutputs[edge.source] || {};
        inputs[edge.targetInput] = sourceOutputs[edge.sourceOutput];
      }
      if (startNodes.some((n) => n.id === nodeId)) {
        Object.assign(inputs, context.parameters);
      }
      try {
        updateNodeStatus(context, nodeId, "executing");
        await updateExecutionStatus(executionId, "executing", context.nodeExecutions);
        const outputs = await executeNode(node, inputs, context);
        context.nodeOutputs[nodeId] = outputs;
        updateNodeStatus(context, nodeId, "completed", outputs);
        executed.add(nodeId);
        const outgoingEdges = edges.filter((e) => e.source === nodeId);
        for (const edge of outgoingEdges) {
          if (!executed.has(edge.target)) {
            queue.push(edge.target);
          }
        }
      } catch (error) {
        updateNodeStatus(context, nodeId, "error", void 0, error.message);
        throw error;
      }
    }
    const sourceNodeIds = new Set(edges.map((e) => e.source));
    const endNodes = nodes.filter((n) => !sourceNodeIds.has(n.id));
    const result = {};
    for (const node of endNodes) {
      result[node.id] = context.nodeOutputs[node.id];
    }
    await db.update(executions).set({
      status: "completed",
      nodeExecutions: JSON.stringify(context.nodeExecutions),
      result: JSON.stringify(result),
      endedAt: (/* @__PURE__ */ new Date()).toISOString()
    }).where(eq2(executions.id, executionId));
  } catch (error) {
    await db.update(executions).set({
      status: "error",
      nodeExecutions: JSON.stringify(context.nodeExecutions),
      error: error.message,
      endedAt: (/* @__PURE__ */ new Date()).toISOString()
    }).where(eq2(executions.id, executionId));
  }
}
async function executeNode(node, inputs, context) {
  switch (node.type) {
    case "trigger":
    case "manual_trigger":
      return { ...inputs };
    case "http_request":
      return await executeHttpRequest(node, inputs);
    case "transform":
    case "json_transform":
      return executeTransform(node, inputs);
    case "condition":
    case "if":
      return executeCondition(node, inputs);
    case "log":
    case "console":
      console.log(`[Node ${node.id}]:`, inputs);
      return { logged: true, data: inputs };
    default:
      console.warn(`Unknown node type: ${node.type}`);
      return { ...inputs };
  }
}
async function executeHttpRequest(node, inputs) {
  const url = inputs.url || node.inputs.find((i) => i.name === "url")?.value;
  const method = inputs.method || node.inputs.find((i) => i.name === "method")?.value || "GET";
  const headers = inputs.headers || node.inputs.find((i) => i.name === "headers")?.value || {};
  const body = inputs.body || node.inputs.find((i) => i.name === "body")?.value;
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : void 0
  });
  const data = await response.json().catch(() => response.text());
  return {
    status: response.status,
    ok: response.ok,
    data
  };
}
function executeTransform(node, inputs) {
  const expression = node.inputs.find((i) => i.name === "expression")?.value;
  if (expression && typeof expression === "string") {
    try {
      const fn = new Function("data", `return ${expression}`);
      return { result: fn(inputs) };
    } catch (e) {
      return { result: inputs, error: "Transform expression failed" };
    }
  }
  return { result: inputs };
}
function executeCondition(node, inputs) {
  const condition = node.inputs.find((i) => i.name === "condition")?.value;
  let result = false;
  if (condition && typeof condition === "string") {
    try {
      const fn = new Function("data", `return !!(${condition})`);
      result = fn(inputs);
    } catch (e) {
      result = false;
    }
  }
  return { result, branch: result ? "true" : "false", data: inputs };
}
function updateNodeStatus(context, nodeId, status, outputs, error) {
  const execution = context.nodeExecutions.find((n) => n.nodeId === nodeId);
  if (execution) {
    execution.status = status;
    if (outputs) execution.outputs = outputs;
    if (error) execution.error = error;
  }
}
async function updateExecutionStatus(executionId, status, nodeExecutions) {
  await db.update(executions).set({
    status,
    nodeExecutions: JSON.stringify(nodeExecutions)
  }).where(eq2(executions.id, executionId));
}

// src/routes/execute.ts
var executeRoute = new OpenAPIHono3();
var route3 = createRoute3({
  method: "post",
  path: "/:id",
  tags: ["Execution"],
  summary: "Execute a workflow",
  description: "Triggers execution of a published workflow by ID",
  request: {
    params: z4.object({
      id: z4.string().uuid().openapi({ description: "Workflow ID" })
    }),
    body: {
      content: {
        "application/json": {
          schema: ExecuteRequestSchema
        }
      },
      required: false
    }
  },
  responses: {
    200: {
      description: "Execution started",
      content: {
        "application/json": {
          schema: ExecuteResponseSchema
        }
      }
    },
    400: {
      description: "Bad request (e.g., workflow inactive)",
      content: {
        "application/json": {
          schema: ErrorResponseSchema
        }
      }
    },
    404: {
      description: "Workflow not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});
executeRoute.openapi(route3, async (c) => {
  const { id } = c.req.valid("param");
  const body = await c.req.json().catch(() => ({}));
  const [workflow] = await db.select().from(workflows).where(eq3(workflows.id, id)).limit(1);
  if (!workflow) {
    return c.json({
      error: "NotFound",
      message: `Workflow ${id} not found`
    }, 404);
  }
  if (!workflow.isActive) {
    return c.json({
      error: "WorkflowInactive",
      message: `Workflow ${id} is not active`
    }, 400);
  }
  const executionId = uuidv4();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.insert(executions).values({
    id: executionId,
    workflowId: id,
    status: "started",
    triggerType: "manual",
    triggerPayload: JSON.stringify(body.parameters || {}),
    nodeExecutions: JSON.stringify([]),
    startedAt: now
  });
  executeWorkflow(executionId, workflow, body.parameters || {}).catch((err) => console.error(`Execution ${executionId} failed:`, err));
  return c.json({
    executionId,
    status: "started",
    message: "Workflow execution started"
  }, 200);
});

// src/routes/webhook.ts
import { OpenAPIHono as OpenAPIHono4, createRoute as createRoute4, z as z5 } from "@hono/zod-openapi";
import { v4 as uuidv42 } from "uuid";
import { eq as eq4, and } from "drizzle-orm";
var webhookRoute = new OpenAPIHono4();
var route4 = createRoute4({
  method: "post",
  path: "/:id",
  tags: ["Webhooks"],
  summary: "Trigger workflow via webhook",
  description: "External webhook endpoint to trigger workflow execution",
  request: {
    params: z5.object({
      id: z5.string().uuid().openapi({ description: "Workflow ID" })
    }),
    body: {
      content: {
        "application/json": {
          schema: WebhookPayloadSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Webhook received and execution started",
      content: {
        "application/json": {
          schema: ExecuteResponseSchema
        }
      }
    },
    404: {
      description: "Workflow not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});
webhookRoute.openapi(route4, async (c) => {
  const { id } = c.req.valid("param");
  const payload = c.req.valid("json");
  const [workflow] = await db.select().from(workflows).where(
    and(
      eq4(workflows.id, id),
      eq4(workflows.isActive, true)
    )
  ).limit(1);
  if (!workflow) {
    return c.json({
      error: "NotFound",
      message: `Active workflow ${id} not found`
    }, 404);
  }
  const executionId = uuidv42();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.insert(executions).values({
    id: executionId,
    workflowId: id,
    status: "started",
    triggerType: "http_webhook",
    triggerPayload: JSON.stringify(payload),
    nodeExecutions: JSON.stringify([]),
    startedAt: now
  });
  executeWorkflow(executionId, workflow, payload.data).catch((err) => console.error(`Webhook execution ${executionId} failed:`, err));
  return c.json({
    executionId,
    status: "started",
    message: "Webhook received, execution started"
  }, 200);
});

// src/routes/executions.ts
import { OpenAPIHono as OpenAPIHono5, createRoute as createRoute5, z as z6 } from "@hono/zod-openapi";
import { eq as eq5, desc } from "drizzle-orm";
var executionsRoute = new OpenAPIHono5();
var getRoute = createRoute5({
  method: "get",
  path: "/:id",
  tags: ["Executions"],
  summary: "Get execution status",
  description: "Returns the status and details of a workflow execution",
  request: {
    params: z6.object({
      id: z6.string().uuid().openapi({ description: "Execution ID" })
    })
  },
  responses: {
    200: {
      description: "Execution details",
      content: {
        "application/json": {
          schema: ExecutionSchema
        }
      }
    },
    404: {
      description: "Execution not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});
executionsRoute.openapi(getRoute, async (c) => {
  const { id } = c.req.valid("param");
  const [execution] = await db.select().from(executions).where(eq5(executions.id, id)).limit(1);
  if (!execution) {
    return c.json({
      error: "NotFound",
      message: `Execution ${id} not found`
    }, 404);
  }
  return c.json({
    id: execution.id,
    workflowId: execution.workflowId,
    status: execution.status,
    triggerType: execution.triggerType,
    triggerPayload: execution.triggerPayload ? JSON.parse(execution.triggerPayload) : void 0,
    nodeExecutions: execution.nodeExecutions ? JSON.parse(execution.nodeExecutions) : [],
    result: execution.result ? JSON.parse(execution.result) : void 0,
    error: execution.error || void 0,
    usage: execution.usage || void 0,
    startedAt: execution.startedAt,
    endedAt: execution.endedAt || void 0
  }, 200);
});
var listRoute = createRoute5({
  method: "get",
  path: "/workflow/:workflowId",
  tags: ["Executions"],
  summary: "List workflow executions",
  description: "Returns recent executions for a specific workflow",
  request: {
    params: z6.object({
      workflowId: z6.string().uuid().openapi({ description: "Workflow ID" })
    }),
    query: z6.object({
      limit: z6.string().optional().openapi({ description: "Max results (default 20)" })
    })
  },
  responses: {
    200: {
      description: "List of executions",
      content: {
        "application/json": {
          schema: z6.object({
            executions: z6.array(ExecutionSchema.omit({ nodeExecutions: true, triggerPayload: true })),
            total: z6.number()
          })
        }
      }
    }
  }
});
executionsRoute.openapi(listRoute, async (c) => {
  const { workflowId } = c.req.valid("param");
  const { limit } = c.req.valid("query");
  const maxResults = Math.min(parseInt(limit || "20"), 100);
  const results = await db.select().from(executions).where(eq5(executions.workflowId, workflowId)).orderBy(desc(executions.startedAt)).limit(maxResults);
  return c.json({
    executions: results.map((e) => ({
      id: e.id,
      workflowId: e.workflowId,
      status: e.status,
      triggerType: e.triggerType,
      error: e.error || void 0,
      usage: e.usage || void 0,
      startedAt: e.startedAt,
      endedAt: e.endedAt || void 0
    })),
    total: results.length
  }, 200);
});

// src/routes/pages.ts
import { OpenAPIHono as OpenAPIHono6, createRoute as createRoute6, z as z7 } from "@hono/zod-openapi";

// src/ssr/components/static.ts
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function getCommonAttributes(id, baseClass, props, extraStyle = "") {
  let className = [baseClass, props.className].filter(Boolean).join(" ");
  let propStyleString = "";
  const propStyle = props.style || {};
  if (propStyle && typeof propStyle === "object" && ("values" in propStyle || "activeProperties" in propStyle)) {
    if (propStyle.values) {
      const { values } = propStyle;
      const styleParts = [];
      for (const [prop, value] of Object.entries(values)) {
        if (value === void 0 || value === null || value === "" || prop === "className") {
          continue;
        }
        if (prop === "size" && typeof value === "object") {
          const sizeObj = value;
          if (sizeObj.width !== void 0 && sizeObj.width !== "auto") {
            const widthUnit = sizeObj.widthUnit || "px";
            styleParts.push(`width:${sizeObj.width}${widthUnit}`);
          }
          if (sizeObj.height !== void 0 && sizeObj.height !== "auto") {
            const heightUnit = sizeObj.heightUnit || "px";
            styleParts.push(`height:${sizeObj.height}${heightUnit}`);
          }
          continue;
        }
        if ((prop === "padding" || prop === "margin") && typeof value === "object") {
          const boxObj = value;
          if (boxObj.top !== void 0) styleParts.push(`${prop}-top:${boxObj.top}px`);
          if (boxObj.right !== void 0) styleParts.push(`${prop}-right:${boxObj.right}px`);
          if (boxObj.bottom !== void 0) styleParts.push(`${prop}-bottom:${boxObj.bottom}px`);
          if (boxObj.left !== void 0) styleParts.push(`${prop}-left:${boxObj.left}px`);
          continue;
        }
        if (prop === "horizontalAlign" && typeof value === "string") {
          if (value === "center") {
            styleParts.push("margin-left:auto");
            styleParts.push("margin-right:auto");
          } else if (value === "right") {
            styleParts.push("margin-left:auto");
            styleParts.push("margin-right:0");
          } else {
            styleParts.push("margin-left:0");
            styleParts.push("margin-right:auto");
          }
          continue;
        }
        if (typeof value === "object") {
          continue;
        }
        const cssKey = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
        styleParts.push(`${cssKey}:${value}`);
      }
      if (values.className) {
        className = [className, values.className].filter(Boolean).join(" ");
      }
      propStyleString = styleParts.join(";");
    }
  } else {
    propStyleString = Object.entries(propStyle).map(([k, v]) => {
      const key = k.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `${key}:${v}`;
    }).join(";");
  }
  const finalStyle = [extraStyle, propStyleString].filter(Boolean).join(";");
  return `id="${id}" class="${className}" style="${finalStyle}"`;
}
function renderStaticComponent(type, id, props, childrenHtml) {
  switch (type) {
    case "Text":
      return renderText(id, props);
    case "Heading":
      return renderHeading(id, props);
    case "Paragraph":
      return renderParagraph(id, props);
    case "Image":
      return renderImage(id, props);
    case "Badge":
      return renderBadge(id, props);
    case "Divider":
      return renderDivider(id, props);
    case "Spacer":
      return renderSpacer(id, props);
    case "Icon":
      return renderIcon(id, props);
    case "Avatar":
      return renderAvatar(id, props);
    case "Label":
      return renderLabel(id, props);
    case "MarkdownContent":
      return renderMarkdown(id, props);
    default:
      return `<div ${getCommonAttributes(id, "fb-unknown", props)} data-fb-type="${type}">${childrenHtml}</div>`;
  }
}
function renderText(id, props) {
  const content = escapeHtml(String(props.content || props.text || props.value || ""));
  const size = props.size || "base";
  const weight = props.weight || "normal";
  const color = props.color || "inherit";
  const align = props.align || "inherit";
  const style = `font-size:var(--fb-text-${size}, 1rem);font-weight:${weight};color:${color};text-align:${align}`;
  const attrs = getCommonAttributes(id, `fb-text fb-text-${size}`, props, style);
  return `<span ${attrs}>${content}</span>`;
}
function renderHeading(id, props) {
  const content = escapeHtml(String(props.content || props.text || ""));
  const levelProp = String(props.level || "2").replace(/^h/i, "");
  const level = Math.min(Math.max(Number(levelProp) || 2, 1), 6);
  const align = props.align || "inherit";
  const color = props.color || "inherit";
  const style = `text-align:${align};color:${color}`;
  const tag = `h${level}`;
  const attrs = getCommonAttributes(id, `fb-heading fb-heading-${level}`, props, style);
  return `<${tag} ${attrs}>${content}</${tag}>`;
}
function renderParagraph(id, props) {
  const content = escapeHtml(String(props.content || props.text || ""));
  const align = props.align || "inherit";
  const color = props.color || "inherit";
  const style = `text-align:${align};color:${color}`;
  const attrs = getCommonAttributes(id, "fb-paragraph", props, style);
  return `<p ${attrs}>${content}</p>`;
}
function renderImage(id, props) {
  const src = props.src || props.url || "";
  const alt = escapeHtml(String(props.alt || ""));
  const width = props.width || "auto";
  const height = props.height || "auto";
  const objectFit = props.objectFit || "cover";
  const borderRadius = props.borderRadius || "0";
  const style = `width:${width};height:${height};object-fit:${objectFit};border-radius:${borderRadius}`;
  const attrs = getCommonAttributes(id, "fb-image", props, style);
  if (!src) {
    return `<div ${attrs} class="fb-image-placeholder" style="${style};background:#e5e5e5;display:flex;align-items:center;justify-content:center;">
            <span style="color:#999">No image</span>
        </div>`;
  }
  return `<img ${attrs} src="${escapeHtml(src)}" alt="${alt}" loading="lazy" />`;
}
function renderBadge(id, props) {
  const content = escapeHtml(String(props.content || props.text || props.label || ""));
  const variant = props.variant || "default";
  const size = props.size || "sm";
  const iconSvg = props.iconSvg || "";
  const iconPosition = props.iconPosition || "left";
  const backgroundColor = props.backgroundColor || "";
  const textColor = props.textColor || "";
  const iconColor = props.iconColor || "";
  const variantStyles = {
    default: { bg: "#18181b", text: "#fafafa" },
    // Dark style matching Builder
    secondary: { bg: "#f4f4f5", text: "#18181b" },
    destructive: { bg: "#ef4444", text: "#fff" },
    outline: { bg: "transparent", text: "#18181b" },
    primary: { bg: "#3b82f6", text: "#fff" },
    success: { bg: "#22c55e", text: "#fff" },
    warning: { bg: "#f59e0b", text: "#fff" },
    error: { bg: "#ef4444", text: "#fff" },
    info: { bg: "#0ea5e9", text: "#fff" }
  };
  const variantConfig = variantStyles[variant] || variantStyles.default;
  const bgColor = backgroundColor || variantConfig.bg;
  const txtColor = textColor || variantConfig.text;
  const icnColor = iconColor || txtColor;
  const sizeStyles = {
    xs: "font-size:0.65rem;padding:0.1rem 0.5rem",
    sm: "font-size:0.75rem;padding:0.25rem 0.625rem",
    md: "font-size:0.875rem;padding:0.375rem 0.75rem",
    lg: "font-size:1rem;padding:0.5rem 1rem"
  };
  const outlineStyles = variant === "outline" ? `border:1px solid ${txtColor};` : "";
  const baseClass = `fb-badge fb-badge-${variant}`;
  const className = props.className ? `${baseClass} ${props.className}` : baseClass;
  const style = `background:${bgColor};color:${txtColor};${sizeStyles[size] || sizeStyles.sm};border-radius:9999px;display:inline-flex;align-items:center;gap:0.375rem;font-weight:500;width:fit-content;${outlineStyles}`;
  const iconStyle = `display:inline-flex;color:${icnColor}`;
  const leftIcon = iconSvg && iconPosition === "left" ? `<span class="fb-badge-icon" style="${iconStyle}">${iconSvg}</span>` : "";
  const rightIcon = iconSvg && iconPosition === "right" ? `<span class="fb-badge-icon" style="${iconStyle}">${iconSvg}</span>` : "";
  return `<span id="${id}" class="${className}" style="${style}">${leftIcon}${content}${rightIcon}</span>`;
}
function renderDivider(id, props) {
  const orientation = props.orientation || "horizontal";
  const color = props.color || "#e5e5e5";
  const thickness = props.thickness || "1px";
  const margin = props.margin || "1rem 0";
  if (orientation === "vertical") {
    const style2 = `width:${thickness};background:${color};margin:${margin};height:100%`;
    const attrs2 = getCommonAttributes(id, "fb-divider fb-divider-vertical", props, style2);
    return `<div ${attrs2}></div>`;
  }
  const style = `border:none;height:${thickness};background:${color};margin:${margin}`;
  const attrs = getCommonAttributes(id, "fb-divider", props, style);
  return `<hr ${attrs} />`;
}
function renderSpacer(id, props) {
  const height = props.height || props.size || "1rem";
  const width = props.width || "auto";
  const style = `height:${height};width:${width}`;
  const attrs = getCommonAttributes(id, "fb-spacer", props, style);
  return `<div ${attrs} aria-hidden="true"></div>`;
}
function renderIcon(id, props) {
  const icon = props.icon || props.name || "\u2B50";
  const size = props.size || "md";
  const color = props.color || "currentColor";
  const iconSvg = props.iconSvg;
  const sizeStyles = {
    xs: "width:1rem;height:1rem;font-size:1rem",
    sm: "width:1.5rem;height:1.5rem;font-size:1.25rem",
    md: "width:2rem;height:2rem;font-size:1.5rem",
    lg: "width:2.5rem;height:2.5rem;font-size:2rem",
    xl: "width:3rem;height:3rem;font-size:2.5rem"
  };
  const sizeStyle = sizeStyles[size] || sizeStyles.md;
  if (iconSvg) {
    const style2 = `${sizeStyle};display:inline-flex;align-items:center;justify-content:center;color:${color}`;
    const attrs2 = getCommonAttributes(id, "fb-icon", props, style2);
    const sizedSvg = iconSvg.replace(/(\s)width="[^"]*"/g, `$1width="100%"`).replace(/(\s)height="[^"]*"/g, `$1height="100%"`);
    return `<span ${attrs2}>${sizedSvg}</span>`;
  }
  const isEmoji = icon.length <= 4 && !/^[a-zA-Z0-9\/]/.test(icon);
  const isUrl = icon.startsWith("http") || icon.startsWith("/");
  if (isUrl) {
    const style2 = `${sizeStyle};object-fit:contain`;
    const attrs2 = getCommonAttributes(id, "fb-icon", props, style2);
    return `<img ${attrs2} src="${escapeHtml(icon)}" alt="" />`;
  }
  const style = `${sizeStyle};display:inline-flex;align-items:center;justify-content:center;${isEmoji ? "" : `color:${color}`}`;
  const attrs = getCommonAttributes(id, "fb-icon", props, style);
  return `<span ${attrs}>${escapeHtml(icon)}</span>`;
}
function renderAvatar(id, props) {
  const src = props.src || props.image;
  const name = props.name || props.alt || "";
  const size = props.size || "40px";
  const shape = props.shape || "circle";
  const borderRadius = shape === "circle" ? "50%" : shape === "rounded" ? "8px" : "0";
  const baseStyle = `width:${size};height:${size};border-radius:${borderRadius};overflow:hidden;display:flex;align-items:center;justify-content:center`;
  if (src) {
    const attrs2 = getCommonAttributes(id, "fb-avatar", props, baseStyle);
    return `<div ${attrs2}>
            <img src="${escapeHtml(src)}" alt="${escapeHtml(name)}" style="width:100%;height:100%;object-fit:cover" />
        </div>`;
  }
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const style = `${baseStyle};background:#6366f1;color:#fff;font-weight:600;font-size:calc(${size} * 0.4)`;
  const attrs = getCommonAttributes(id, "fb-avatar fb-avatar-initials", props, style);
  return `<div ${attrs}>
        ${escapeHtml(initials)}
    </div>`;
}
function renderLabel(id, props) {
  const content = escapeHtml(String(props.content || props.text || ""));
  const htmlFor = props.for || props.htmlFor || "";
  const required = props.required;
  const style = `display:block;font-weight:500;margin-bottom:0.25rem`;
  const attrs = getCommonAttributes(id, "fb-label", props, style);
  const forAttr = htmlFor ? `for="${htmlFor}"` : "";
  return `<label ${attrs} ${forAttr}>
        ${content}${required ? '<span style="color:#ef4444;margin-left:0.25rem">*</span>' : ""}
    </label>`;
}
function renderMarkdown(id, props) {
  const content = String(props.content || props.markdown || "");
  const attrs = getCommonAttributes(id, "fb-markdown", props);
  return `<div ${attrs} data-fb-hydrate="markdown">
        <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(content)}</pre>
    </div>`;
}

// src/ssr/components/interactive.ts
function escapeHtml2(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function getCommonAttributes2(id, baseClass, props, extraStyle, hydrateType, propsJson) {
  let className = [baseClass, props.className].filter(Boolean).join(" ");
  let propStyleString = "";
  const propStyle = props.style || {};
  if (propStyle && typeof propStyle === "object" && ("values" in propStyle || "activeProperties" in propStyle)) {
    if (propStyle.values) {
      const { values } = propStyle;
      const styleParts = [];
      for (const [prop, value] of Object.entries(values)) {
        if (value === void 0 || value === null || value === "" || prop === "className") {
          continue;
        }
        if (prop === "size" && typeof value === "object") {
          const sizeObj = value;
          if (sizeObj.width !== void 0 && sizeObj.width !== "auto") {
            const widthUnit = sizeObj.widthUnit || "px";
            styleParts.push(`width:${sizeObj.width}${widthUnit}`);
          }
          if (sizeObj.height !== void 0 && sizeObj.height !== "auto") {
            const heightUnit = sizeObj.heightUnit || "px";
            styleParts.push(`height:${sizeObj.height}${heightUnit}`);
          }
          continue;
        }
        if ((prop === "padding" || prop === "margin") && typeof value === "object") {
          const boxObj = value;
          if (boxObj.top !== void 0) styleParts.push(`${prop}-top:${boxObj.top}px`);
          if (boxObj.right !== void 0) styleParts.push(`${prop}-right:${boxObj.right}px`);
          if (boxObj.bottom !== void 0) styleParts.push(`${prop}-bottom:${boxObj.bottom}px`);
          if (boxObj.left !== void 0) styleParts.push(`${prop}-left:${boxObj.left}px`);
          continue;
        }
        if (prop === "horizontalAlign" && typeof value === "string") {
          if (value === "center") {
            styleParts.push("margin-left:auto");
            styleParts.push("margin-right:auto");
          } else if (value === "right") {
            styleParts.push("margin-left:auto");
            styleParts.push("margin-right:0");
          } else {
            styleParts.push("margin-left:0");
            styleParts.push("margin-right:auto");
          }
          continue;
        }
        if (typeof value === "object") {
          continue;
        }
        const cssKey = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
        styleParts.push(`${cssKey}:${value}`);
      }
      if (values.className) {
        className = [className, values.className].filter(Boolean).join(" ");
      }
      propStyleString = styleParts.join(";");
    }
  } else {
    propStyleString = Object.entries(propStyle).map(([k, v]) => {
      const key = k.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `${key}:${v}`;
    }).join(";");
  }
  const finalStyle = [extraStyle, propStyleString].filter(Boolean).join(";");
  return `id="${id}" class="${className}" style="${finalStyle}" data-fb-hydrate="${hydrateType}" data-fb-props="${escapeHtml2(propsJson)}"`;
}
function renderInteractiveComponent(type, id, props, childrenHtml) {
  const propsJson = JSON.stringify(props).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  switch (type) {
    case "Button":
      return renderButton(id, props, propsJson);
    case "Link":
      return renderLink(id, props, propsJson);
    case "Tabs":
      return renderTabs(id, props, childrenHtml, propsJson);
    case "Accordion":
      return renderAccordion(id, props, childrenHtml, propsJson);
    case "Modal":
      return renderModal(id, props, childrenHtml, propsJson);
    case "Dropdown":
      return renderDropdown(id, props, childrenHtml, propsJson);
    case "Toggle":
    case "Switch":
      return renderToggle(id, props, propsJson);
    case "Checkbox":
      return renderCheckbox(id, props, propsJson);
    case "Radio":
      return renderRadio(id, props, propsJson);
    case "Tooltip":
      return renderTooltip(id, props, childrenHtml, propsJson);
    default:
      return `<div data-fb-id="${id}" data-fb-type="${type}" data-fb-hydrate="true" data-fb-props="${escapeHtml2(propsJson)}">${childrenHtml}</div>`;
  }
}
function renderButton(id, props, propsJson) {
  const label = escapeHtml2(String(props.label || props.text || props.children || "Button"));
  const variant = props.variant || "default";
  const size = props.size || "md";
  const disabled = props.disabled || false;
  const fullWidth = props.fullWidth || false;
  const loading = props.loading || false;
  const variantStyles = {
    default: "background:hsl(var(--primary));color:hsl(var(--primary-foreground));border:none",
    primary: "background:hsl(var(--primary));color:hsl(var(--primary-foreground));border:none",
    secondary: "background:hsl(var(--secondary));color:hsl(var(--secondary-foreground));border:none",
    destructive: "background:hsl(var(--destructive));color:hsl(var(--destructive-foreground));border:none",
    outline: "background:transparent;color:hsl(var(--foreground));border:1px solid hsl(var(--border))",
    ghost: "background:transparent;color:hsl(var(--foreground));border:none",
    link: "background:transparent;color:hsl(var(--primary));border:none;text-decoration:underline"
  };
  const sizeStyles = {
    xs: "padding:0.25rem 0.5rem;font-size:0.75rem",
    sm: "padding:0.375rem 0.75rem;font-size:0.875rem",
    md: "padding:0.5rem 1rem;font-size:1rem",
    lg: "padding:0.625rem 1.25rem;font-size:1.125rem",
    xl: "padding:0.75rem 1.5rem;font-size:1.25rem"
  };
  const style = `${variantStyles[variant] || variantStyles.default};${sizeStyles[size] || sizeStyles.md};border-radius:0.375rem;cursor:pointer;font-weight:500;transition:all 0.15s;${fullWidth ? "width:100%" : "width:fit-content"};${disabled ? "opacity:0.5;cursor:not-allowed" : ""}`;
  const attrs = getCommonAttributes2(id, `fb-button fb-button-${variant}`, props, style, "button", propsJson);
  return `<button ${attrs} ${disabled ? "disabled" : ""}>
        ${loading ? '<span class="fb-spinner" style="margin-right:0.5rem">\u23F3</span>' : ""}
        ${label}
    </button>`;
}
function renderLink(id, props, propsJson) {
  const text2 = escapeHtml2(String(props.text || props.label || props.children || "Link"));
  const href = escapeHtml2(String(props.href || props.to || "#"));
  const target = props.target || "_self";
  const color = props.color || "#3b82f6";
  const underline = props.underline !== false;
  const style = `color:${color};${underline ? "text-decoration:underline" : "text-decoration:none"};cursor:pointer`;
  const attrs = getCommonAttributes2(id, "fb-link", props, style, "link", propsJson);
  return `<a ${attrs} href="${href}" target="${target}">${text2}</a>`;
}
function renderTabs(id, props, childrenHtml, propsJson) {
  const tabs = props.tabs || [];
  const activeTab = props.activeTab || (tabs[0]?.id ?? "");
  const variant = props.variant || "default";
  const tabButtons = tabs.map((tab) => {
    const isActive = tab.id === activeTab;
    const activeStyle = isActive ? "border-bottom:2px solid #3b82f6;color:#3b82f6" : "border-bottom:2px solid transparent;color:#6b7280";
    return `<button class="fb-tab-button" data-tab-id="${tab.id}" style="padding:0.5rem 1rem;background:none;border:none;${activeStyle};cursor:pointer;font-weight:500">${escapeHtml2(tab.label)}</button>`;
  }).join("");
  const tabPanels = tabs.map((tab) => {
    const isActive = tab.id === activeTab;
    return `<div class="fb-tab-panel" data-tab-id="${tab.id}" style="${isActive ? "" : "display:none"};padding:1rem 0">${tab.content ? escapeHtml2(String(tab.content)) : ""}</div>`;
  }).join("");
  const attrs = getCommonAttributes2(id, `fb-tabs fb-tabs-${variant}`, props, "", "tabs", propsJson);
  return `<div ${attrs}>
        <div class="fb-tabs-list" style="display:flex;border-bottom:1px solid #e5e7eb;margin-bottom:1rem">${tabButtons}</div>
        <div class="fb-tabs-content">${tabPanels}${childrenHtml}</div>
    </div>`;
}
function renderAccordion(id, props, childrenHtml, propsJson) {
  const items = props.items || [];
  const allowMultiple = props.allowMultiple || false;
  const openItems = props.openItems || [];
  const accordionItems = items.map((item) => {
    const isOpen = openItems.includes(item.id);
    return `<div class="fb-accordion-item" data-accordion-id="${item.id}" style="border:1px solid #e5e7eb;margin-bottom:-1px">
            <button class="fb-accordion-trigger" style="width:100%;padding:1rem;display:flex;justify-content:space-between;align-items:center;background:none;border:none;cursor:pointer;font-weight:500;text-align:left">
                ${escapeHtml2(item.title)}
                <span style="transform:rotate(${isOpen ? "180deg" : "0deg"});transition:transform 0.2s">\u25BC</span>
            </button>
            <div class="fb-accordion-content" style="${isOpen ? "" : "display:none"};padding:1rem;border-top:1px solid #e5e7eb">${item.content ? escapeHtml2(String(item.content)) : ""}</div>
        </div>`;
  }).join("");
  const attrs = getCommonAttributes2(id, "fb-accordion", props, "", "accordion", propsJson);
  return `<div ${attrs} data-allow-multiple="${allowMultiple}">
        ${accordionItems}${childrenHtml}
    </div>`;
}
function renderModal(id, props, childrenHtml, propsJson) {
  const title = escapeHtml2(String(props.title || ""));
  const isOpen = props.isOpen || false;
  const size = props.size || "md";
  const sizeWidths = {
    sm: "400px",
    md: "500px",
    lg: "700px",
    xl: "900px",
    full: "95vw"
  };
  const style = `display:${isOpen ? "flex" : "none"};position:fixed;inset:0;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;z-index:1000`;
  const attrs = getCommonAttributes2(id, "fb-modal", props, style, "modal", propsJson);
  return `<div ${attrs}>
        <div class="fb-modal-content" style="background:#fff;border-radius:0.5rem;width:${sizeWidths[size] || sizeWidths.md};max-height:90vh;overflow:auto">
            ${title ? `<div class="fb-modal-header" style="padding:1rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
                <h3 style="margin:0;font-size:1.125rem">${title}</h3>
                <button class="fb-modal-close" style="background:none;border:none;font-size:1.5rem;cursor:pointer;line-height:1">\xD7</button>
            </div>` : ""}
            <div class="fb-modal-body" style="padding:1rem">${childrenHtml}</div>
        </div>
    </div>`;
}
function renderDropdown(id, props, childrenHtml, propsJson) {
  const label = escapeHtml2(String(props.label || props.trigger || "Menu"));
  const items = props.items || [];
  const menuItems = items.map((item) => {
    return `<button class="fb-dropdown-item" data-item-id="${item.id}" style="width:100%;padding:0.5rem 1rem;text-align:left;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:0.5rem">
            ${item.icon ? `<span class="fb-dropdown-icon">${escapeHtml2(item.icon)}</span>` : ""}
            ${escapeHtml2(item.label)}
        </button>`;
  }).join("");
  const style = `position:relative;display:inline-block`;
  const attrs = getCommonAttributes2(id, "fb-dropdown", props, style, "dropdown", propsJson);
  return `<div ${attrs}>
        <button class="fb-dropdown-trigger" style="padding:0.5rem 1rem;background:#f3f4f6;border:1px solid #d1d5db;border-radius:0.375rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem">
            ${label}
            <span>\u25BC</span>
        </button>
        <div class="fb-dropdown-menu" style="display:none;position:absolute;top:100%;left:0;min-width:160px;background:#fff;border:1px solid #e5e7eb;border-radius:0.375rem;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:100">
            ${menuItems}${childrenHtml}
        </div>
    </div>`;
}
function renderToggle(id, props, propsJson) {
  const checked = props.checked || props.value || false;
  const label = escapeHtml2(String(props.label || ""));
  const disabled = props.disabled || false;
  const style = `display:inline-flex;align-items:center;gap:0.5rem;cursor:${disabled ? "not-allowed" : "pointer"};opacity:${disabled ? "0.5" : "1"}`;
  const attrs = getCommonAttributes2(id, "fb-toggle", props, style, "toggle", propsJson);
  return `<label ${attrs}>
        <span class="fb-toggle-track" style="position:relative;width:44px;height:24px;background:${checked ? "#3b82f6" : "#d1d5db"};border-radius:9999px;transition:background 0.2s">
            <span class="fb-toggle-thumb" style="position:absolute;top:2px;left:${checked ? "22px" : "2px"};width:20px;height:20px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span>
        </span>
        ${label ? `<span>${label}</span>` : ""}
        <input type="checkbox" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} style="position:absolute;opacity:0;pointer-events:none" />
    </label>`;
}
function renderCheckbox(id, props, propsJson) {
  const checked = props.checked || props.value || false;
  const label = escapeHtml2(String(props.label || ""));
  const disabled = props.disabled || false;
  const style = `display:inline-flex;align-items:center;gap:0.5rem;cursor:${disabled ? "not-allowed" : "pointer"};opacity:${disabled ? "0.5" : "1"}`;
  const attrs = getCommonAttributes2(id, "fb-checkbox", props, style, "checkbox", propsJson);
  return `<label ${attrs}>
        <span class="fb-checkbox-box" style="width:18px;height:18px;border:2px solid ${checked ? "#3b82f6" : "#d1d5db"};border-radius:0.25rem;background:${checked ? "#3b82f6" : "transparent"};display:flex;align-items:center;justify-content:center">
            ${checked ? '<span style="color:#fff;font-size:12px">\u2713</span>' : ""}
        </span>
        ${label ? `<span>${label}</span>` : ""}
        <input type="checkbox" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} style="position:absolute;opacity:0;pointer-events:none" />
    </label>`;
}
function renderRadio(id, props, propsJson) {
  const checked = props.checked || props.selected || false;
  const label = escapeHtml2(String(props.label || ""));
  const name = props.name || "radio-group";
  const disabled = props.disabled || false;
  const style = `display:inline-flex;align-items:center;gap:0.5rem;cursor:${disabled ? "not-allowed" : "pointer"};opacity:${disabled ? "0.5" : "1"}`;
  const attrs = getCommonAttributes2(id, "fb-radio", props, style, "radio", propsJson);
  return `<label ${attrs}>
        <span class="fb-radio-circle" style="width:18px;height:18px;border:2px solid ${checked ? "#3b82f6" : "#d1d5db"};border-radius:50%;display:flex;align-items:center;justify-content:center">
            ${checked ? '<span style="width:10px;height:10px;background:#3b82f6;border-radius:50%"></span>' : ""}
        </span>
        ${label ? `<span>${label}</span>` : ""}
        <input type="radio" name="${name}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} style="position:absolute;opacity:0;pointer-events:none" />
    </label>`;
}
function renderTooltip(id, props, childrenHtml, propsJson) {
  const content = escapeHtml2(String(props.content || props.text || ""));
  const position = props.position || "top";
  const style = `position:relative;display:inline-block`;
  const attrs = getCommonAttributes2(id, "fb-tooltip", props, style, "tooltip", propsJson);
  return `<span ${attrs}>
        ${childrenHtml}
        <span class="fb-tooltip-content" data-position="${position}" style="display:none;position:absolute;background:#1f2937;color:#fff;padding:0.25rem 0.5rem;border-radius:0.25rem;font-size:0.75rem;white-space:nowrap;z-index:100">${content}</span>
    </span>`;
}

// src/ssr/components/data.ts
function escapeHtml3(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function getCommonAttributes3(id, baseClass, props, extraStyle, hydrateType, propsJson, extraAttrs = "") {
  let className = [baseClass, props.className].filter(Boolean).join(" ");
  let propStyleString = "";
  const propStyle = props.style || {};
  if (propStyle && typeof propStyle === "object" && ("values" in propStyle || "activeProperties" in propStyle)) {
    if (propStyle.values) {
      const { values } = propStyle;
      const styleParts = [];
      for (const [prop, value] of Object.entries(values)) {
        if (value === void 0 || value === null || value === "" || prop === "className") {
          continue;
        }
        if (prop === "size" && typeof value === "object") {
          const sizeObj = value;
          if (sizeObj.width !== void 0 && sizeObj.width !== "auto") {
            const widthUnit = sizeObj.widthUnit || "px";
            styleParts.push(`width:${sizeObj.width}${widthUnit}`);
          }
          if (sizeObj.height !== void 0 && sizeObj.height !== "auto") {
            const heightUnit = sizeObj.heightUnit || "px";
            styleParts.push(`height:${sizeObj.height}${heightUnit}`);
          }
          continue;
        }
        if ((prop === "padding" || prop === "margin") && typeof value === "object") {
          const boxObj = value;
          if (boxObj.top !== void 0) styleParts.push(`${prop}-top:${boxObj.top}px`);
          if (boxObj.right !== void 0) styleParts.push(`${prop}-right:${boxObj.right}px`);
          if (boxObj.bottom !== void 0) styleParts.push(`${prop}-bottom:${boxObj.bottom}px`);
          if (boxObj.left !== void 0) styleParts.push(`${prop}-left:${boxObj.left}px`);
          continue;
        }
        if (prop === "horizontalAlign" && typeof value === "string") {
          if (value === "center") {
            styleParts.push("margin-left:auto");
            styleParts.push("margin-right:auto");
          } else if (value === "right") {
            styleParts.push("margin-left:auto");
            styleParts.push("margin-right:0");
          } else {
            styleParts.push("margin-left:0");
            styleParts.push("margin-right:auto");
          }
          continue;
        }
        if (typeof value === "object") {
          continue;
        }
        const cssKey = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
        styleParts.push(`${cssKey}:${value}`);
      }
      if (values.className) {
        className = [className, values.className].filter(Boolean).join(" ");
      }
      propStyleString = styleParts.join(";");
    }
  } else {
    propStyleString = Object.entries(propStyle).map(([k, v]) => {
      if (typeof v === "object") return "";
      const key = k.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `${key}:${v}`;
    }).filter(Boolean).join(";");
  }
  const finalStyle = [extraStyle, propStyleString].filter(Boolean).join(";");
  return `id="${id}" class="${className}" style="${finalStyle}" data-fb-hydrate="${hydrateType}" data-fb-props="${escapeHtml3(propsJson)}" ${extraAttrs}`;
}
function renderDataComponent(type, id, props, childrenHtml) {
  const propsJson = JSON.stringify(props).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  switch (type) {
    case "DataTable":
      return renderDataTable(id, props, propsJson);
    case "Form":
      return renderForm(id, props, childrenHtml, propsJson);
    case "InfoList":
      return renderInfoList(id, props, propsJson);
    case "Chart":
      return renderChart(id, props, propsJson);
    case "Card":
    case "DataCard":
      return renderDataCard(id, props, childrenHtml, propsJson);
    case "Repeater":
    case "List":
      return renderRepeater(id, props, childrenHtml, propsJson);
    case "Grid":
      return renderDataGrid(id, props, propsJson);
    default:
      return `<div data-fb-id="${id}" data-fb-type="${type}" data-fb-hydrate="data" data-fb-props="${escapeHtml3(propsJson)}" class="fb-data-component">
                <div class="fb-skeleton" style="height:200px;border-radius:0.5rem">&nbsp;</div>
                ${childrenHtml}
            </div>`;
  }
}
function renderDataTable(id, props, propsJson) {
  const binding = props.binding || {};
  const tableName = binding.tableName || props.tableName || props.table || "";
  const columns = binding.columnOrder || props.columns || [];
  const title = escapeHtml3(String(props.title || `Table: ${tableName}`));
  const showPagination = binding.pagination?.enabled !== false;
  const pageSize = binding.pagination?.pageSize || props.pageSize || 10;
  const reactProps = {
    binding,
    tableName
  };
  const reactPropsJson = JSON.stringify(reactProps).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const headerCells = columns.length > 0 ? columns.slice(0, 5).map((col) => {
    const label = col.replace(/\./g, " \u203A ").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return `<th style="padding:0.75rem 1rem;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600">${escapeHtml3(label)}</th>`;
  }).join("") : '<th style="padding:0.75rem 1rem">Column 1</th><th style="padding:0.75rem 1rem">Column 2</th><th style="padding:0.75rem 1rem">Column 3</th>';
  const numCols = columns.length > 0 ? Math.min(columns.length, 5) : 3;
  const skeletonRows = Array(Math.min(pageSize, 5)).fill(0).map(() => {
    return `<tr>${Array(numCols).fill(0).map(
      () => '<td style="padding:0.75rem 1rem;border-bottom:1px solid #f3f4f6"><div class="fb-skeleton" style="height:1rem;width:80%;border-radius:0.25rem">&nbsp;</div></td>'
    ).join("")}</tr>`;
  }).join("");
  return `<div id="${id}" class="fb-datatable" data-react-component="DataTable" data-react-props="${escapeHtml3(reactPropsJson)}" data-component-id="${id}">
        <div class="fb-datatable-container" style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:0.5rem">
            <table style="width:100%;border-collapse:collapse">
                <thead style="background:#f9fafb">
                    <tr>${headerCells}</tr>
                </thead>
                <tbody class="fb-loading">
                    ${skeletonRows}
                </tbody>
            </table>
        </div>
        ${showPagination ? `<div class="fb-datatable-pagination" style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;padding:0.5rem 0">
            <span class="fb-skeleton" style="width:100px;height:1rem">&nbsp;</span>
            <div style="display:flex;gap:0.25rem">
                <button class="fb-skeleton" style="width:32px;height:32px;border-radius:0.25rem">&nbsp;</button>
                <button class="fb-skeleton" style="width:32px;height:32px;border-radius:0.25rem">&nbsp;</button>
            </div>
        </div>` : ""}
    </div>`;
}
function renderForm(id, props, childrenHtml, propsJson) {
  const title = escapeHtml3(String(props.title || "Form"));
  const mode = props.mode || "create";
  const tableName = props.tableName || props.table || "";
  const fields = props.fields || [];
  const formFields = fields.length > 0 ? fields.map((field) => `
            <div class="fb-form-field" style="margin-bottom:1rem">
                <label style="display:block;font-weight:500;margin-bottom:0.25rem">${escapeHtml3(field.label)}</label>
                <div class="fb-skeleton" style="height:40px;border-radius:0.375rem">&nbsp;</div>
            </div>
        `).join("") : `
            <div class="fb-form-field" style="margin-bottom:1rem">
                <div class="fb-skeleton" style="height:16px;width:60px;margin-bottom:0.25rem">&nbsp;</div>
                <div class="fb-skeleton" style="height:40px;border-radius:0.375rem">&nbsp;</div>
            </div>
            <div class="fb-form-field" style="margin-bottom:1rem">
                <div class="fb-skeleton" style="height:16px;width:80px;margin-bottom:0.25rem">&nbsp;</div>
                <div class="fb-skeleton" style="height:40px;border-radius:0.375rem">&nbsp;</div>
            </div>
        `;
  const attrs = getCommonAttributes3(id, "fb-form", props, "", "form", propsJson, `data-table="${escapeHtml3(tableName)}" data-mode="${mode}"`);
  return `<form ${attrs}>
        ${title ? `<h3 style="margin:0 0 1.5rem 0;font-size:1.125rem;font-weight:600">${title}</h3>` : ""}
        <div class="fb-form-fields fb-loading">
            ${formFields}
            ${childrenHtml}
        </div>
        <div class="fb-form-actions" style="display:flex;gap:0.75rem;margin-top:1.5rem">
            <button type="submit" class="fb-skeleton" style="padding:0.5rem 1.5rem;border-radius:0.375rem;width:100px">&nbsp;</button>
            <button type="button" class="fb-skeleton" style="padding:0.5rem 1rem;border-radius:0.375rem;width:80px">&nbsp;</button>
        </div>
    </form>`;
}
function renderInfoList(id, props, propsJson) {
  const title = escapeHtml3(String(props.title || ""));
  const items = props.items || [];
  const columns = props.columns || 1;
  const attrs = getCommonAttributes3(id, "fb-infolist", props, "", "infolist", propsJson);
  const listItems = items.length > 0 ? items.map((item) => `
            <div class="fb-infolist-item" style="display:flex;flex-direction:column;padding:0.75rem 0;border-bottom:1px solid #f3f4f6">
                <span style="font-size:0.875rem;color:#6b7280">${escapeHtml3(item.label)}</span>
                <span style="font-weight:500">${item.value !== void 0 ? escapeHtml3(String(item.value)) : '<span class="fb-skeleton" style="display:inline-block;width:120px;height:1rem">&nbsp;</span>'}</span>
            </div>
        `).join("") : Array(4).fill(0).map(() => `
            <div class="fb-infolist-item" style="display:flex;flex-direction:column;padding:0.75rem 0;border-bottom:1px solid #f3f4f6">
                <span class="fb-skeleton" style="height:0.875rem;width:80px;margin-bottom:0.25rem">&nbsp;</span>
                <span class="fb-skeleton" style="height:1rem;width:150px">&nbsp;</span>
            </div>
        `).join("");
  return `<div ${attrs}>
        ${title ? `<h4 style="margin:0 0 1rem 0;font-size:1rem;font-weight:600">${title}</h4>` : ""}
        <div class="fb-infolist-items fb-loading" style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:0 2rem">
            ${listItems}
        </div>
    </div>`;
}
function renderChart(id, props, propsJson) {
  const title = escapeHtml3(String(props.title || "Chart"));
  const chartType = props.type || props.chartType || "bar";
  const height = props.height || "300px";
  const attrs = getCommonAttributes3(id, "fb-chart", props, "", "chart", propsJson, `data-chart-type="${chartType}"`);
  return `<div ${attrs}>
        ${title ? `<h4 style="margin:0 0 1rem 0;font-size:1rem;font-weight:600">${title}</h4>` : ""}
        <div class="fb-chart-container fb-skeleton" style="height:${height};border-radius:0.5rem;display:flex;align-items:center;justify-content:center">
            <span style="color:#9ca3af">Loading chart...</span>
        </div>
    </div>`;
}
function renderDataCard(id, props, childrenHtml, propsJson) {
  const title = escapeHtml3(String(props.title || ""));
  const subtitle = escapeHtml3(String(props.subtitle || props.description || ""));
  const image = props.image || props.imageUrl || "";
  const icon = props.icon || "";
  const iconSvg = props.iconSvg || "";
  const iconSize = props.iconSize || "md";
  const iconAlignment = props.iconAlignment || "center";
  const textAlignment = props.textAlignment || "center";
  const style = `border:1px solid #e5e7eb;border-radius:0.5rem;overflow:hidden;text-align:${textAlignment}`;
  const attrs = getCommonAttributes3(id, "fb-datacard", props, style, "datacard", propsJson);
  const hasChildren = childrenHtml && childrenHtml.trim().length > 0;
  const iconAlignStyle = iconAlignment === "center" ? "margin:0 auto 0.75rem auto;" : iconAlignment === "right" ? "margin-left:auto;margin-bottom:0.75rem;" : "margin-bottom:0.75rem;";
  const iconHtml = icon || iconSvg ? `
        <div style="${iconAlignStyle}">
            ${renderIcon(`${id}-icon`, { icon, iconSvg, size: iconSize, color: "hsl(var(--primary))" })}
        </div>
    ` : "";
  const titleHtml = title ? `<h4 style="margin:0 0 0.25rem 0;font-weight:600">${title}</h4>` : hasChildren ? "" : '<div class="fb-skeleton" style="height:1.25rem;width:60%;margin-bottom:0.5rem">&nbsp;</div>';
  const subtitleHtml = subtitle ? `<p style="margin:0;color:#6b7280;font-size:0.875rem">${subtitle}</p>` : hasChildren ? "" : '<div class="fb-skeleton" style="height:0.875rem;width:80%">&nbsp;</div>';
  return `<div ${attrs}>
        ${image ? `<div class="fb-datacard-image" style="height:160px;background:#f3f4f6">
            <img src="${escapeHtml3(image)}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" />
        </div>` : ""}
        <div class="fb-datacard-content" style="padding:1rem">
            ${iconHtml}
            ${titleHtml}
            ${subtitleHtml}
            ${childrenHtml}
        </div>
    </div>`;
}
function renderRepeater(id, props, childrenHtml, propsJson) {
  const columns = props.columns || 1;
  const gap = props.gap || "1rem";
  const itemCount = props.itemCount || 3;
  const skeletonItems = Array(itemCount).fill(0).map(
    () => `<div class="fb-repeater-item fb-skeleton" style="min-height:100px;border-radius:0.5rem">&nbsp;</div>`
  ).join("");
  const style = `display:grid;grid-template-columns:repeat(${columns},1fr);gap:${gap}`;
  const attrs = getCommonAttributes3(id, "fb-repeater", props, style, "repeater", propsJson);
  return `<div ${attrs}>
        <div class="fb-repeater-items fb-loading">
            ${skeletonItems}
        </div>
        ${childrenHtml}
    </div>`;
}
function renderDataGrid(id, props, propsJson) {
  const columns = props.columns || 3;
  const rows = props.rows || 3;
  const gap = props.gap || "1rem";
  const cellCount = columns * rows;
  const skeletonCells = Array(cellCount).fill(0).map(
    () => `<div class="fb-datagrid-cell fb-skeleton" style="min-height:80px;border-radius:0.375rem">&nbsp;</div>`
  ).join("");
  const style = `display:grid;grid-template-columns:repeat(${columns},1fr);gap:${gap}`;
  const attrs = getCommonAttributes3(id, "fb-datagrid", props, style, "datagrid", propsJson);
  return `<div ${attrs}>
        ${skeletonCells}
    </div>`;
}

// src/ssr/components/lib/utils.ts
function escapeHtml4(str) {
  if (!str || typeof str !== "string") return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// src/ssr/components/lib/styles.ts
function stylesDataToCSS(stylesData) {
  if (!stylesData) return "";
  if (stylesData.stylingMode === "css" && stylesData.rawCSS) {
    return stylesData.rawCSS;
  }
  if (!stylesData.values) return "";
  const styleParts = [];
  for (const [prop, value] of Object.entries(stylesData.values)) {
    if (value === void 0 || value === null || value === "") {
      continue;
    }
    if (prop === "size" && typeof value === "object") {
      const sizeObj = value;
      if (sizeObj.width !== void 0 && sizeObj.width !== "auto") {
        const widthUnit = sizeObj.widthUnit || "px";
        styleParts.push(`width: ${sizeObj.width}${widthUnit}`);
      }
      if (sizeObj.height !== void 0 && sizeObj.height !== "auto") {
        const heightUnit = sizeObj.heightUnit || "px";
        styleParts.push(`height: ${sizeObj.height}${heightUnit}`);
      }
      continue;
    }
    if ((prop === "padding" || prop === "margin") && typeof value === "object") {
      const boxObj = value;
      if ("top" in boxObj && "right" in boxObj && "bottom" in boxObj && "left" in boxObj) {
        styleParts.push(`${prop}: ${boxObj.top}px ${boxObj.right}px ${boxObj.bottom}px ${boxObj.left}px`);
      } else {
        if (boxObj.top !== void 0) styleParts.push(`${prop}-top: ${boxObj.top}px`);
        if (boxObj.right !== void 0) styleParts.push(`${prop}-right: ${boxObj.right}px`);
        if (boxObj.bottom !== void 0) styleParts.push(`${prop}-bottom: ${boxObj.bottom}px`);
        if (boxObj.left !== void 0) styleParts.push(`${prop}-left: ${boxObj.left}px`);
      }
      continue;
    }
    if (prop === "horizontalAlign" && typeof value === "string") {
      if (value === "center") {
        styleParts.push("margin-left: auto");
        styleParts.push("margin-right: auto");
      } else if (value === "right") {
        styleParts.push("margin-left: auto");
        styleParts.push("margin-right: 0");
      } else {
        styleParts.push("margin-left: 0");
        styleParts.push("margin-right: auto");
      }
      continue;
    }
    if (typeof value === "object") {
      continue;
    }
    const cssKey = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
    styleParts.push(`${cssKey}: ${value}`);
  }
  return styleParts.join("; ");
}

// src/ssr/components/landing/Hero.ts
function renderHero(id, props, stylesData) {
  const alignment = props.alignment || "center";
  const minHeight = props.minHeight || "60vh";
  const sectionClasses = [
    "fb-hero",
    "relative",
    "flex",
    "items-center",
    "overflow-hidden",
    props.hideOnMobile ? "hidden md:flex" : "",
    props.hideOnDesktop ? "md:hidden" : ""
  ].filter(Boolean).join(" ");
  const contentClasses = [
    "container",
    "mx-auto",
    "px-4",
    "sm:px-6",
    "lg:px-8",
    "py-12",
    "sm:py-16",
    "lg:py-24",
    alignment === "center" ? "text-center" : "",
    alignment === "right" ? "text-right" : ""
  ].filter(Boolean).join(" ");
  const ctaContainerClasses = [
    "flex",
    "gap-4",
    "mt-8",
    alignment === "center" ? "justify-center" : "",
    alignment === "right" ? "justify-end" : ""
  ].filter(Boolean).join(" ");
  const baseStyles = [`min-height: ${minHeight}`];
  if (props.backgroundImage) {
    baseStyles.push(`background-image: url('${props.backgroundImage}')`);
    baseStyles.push("background-size: cover");
    baseStyles.push("background-position: center");
  }
  if (props.backgroundGradient) {
    baseStyles.push(`background: ${props.backgroundGradient}`);
  }
  const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : "";
  const combinedStyles = [...baseStyles, inlineStyles].filter(Boolean).join("; ");
  let badgeHtml = "";
  if (props.badge) {
    const badgeConfig = typeof props.badge === "string" ? { text: props.badge } : props.badge;
    badgeHtml = `<div class="mb-6" style="display:flex;${alignment === "center" ? "justify-content:center" : alignment === "right" ? "justify-content:flex-end" : ""}">${renderBadge(`${id}-badge`, {
      text: badgeConfig.text,
      icon: badgeConfig.icon,
      iconSvg: badgeConfig.iconSvg,
      backgroundColor: badgeConfig.backgroundColor,
      textColor: badgeConfig.textColor,
      iconColor: badgeConfig.iconColor,
      variant: badgeConfig.variant || "secondary"
    })}</div>`;
  }
  const titleHtml = `<div class="mb-4 sm:mb-6">${renderHeading(`${id}-title`, {
    text: props.title,
    level: 1,
    align: alignment,
    className: "text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-foreground"
  })}</div>`;
  const subtitleHtml = props.subtitle ? `<div class="mb-6 sm:mb-8 ${alignment === "center" ? "max-w-2xl mx-auto" : "max-w-2xl"}">${renderParagraph(`${id}-subtitle`, {
    text: props.subtitle,
    align: alignment,
    className: "text-lg sm:text-xl text-muted-foreground"
  })}</div>` : "";
  const primaryCtaHtml = props.ctaText ? `<a href="${escapeHtml4(props.ctaLink || "#")}" 
             class="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
             ${escapeHtml4(props.ctaText)}
           </a>` : "";
  const secondaryCtaHtml = props.secondaryCtaText ? `<a href="${escapeHtml4(props.secondaryCtaLink || "#")}" 
             class="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-input bg-background hover:bg-accent hover:text-accent-foreground font-medium transition-colors">
             ${escapeHtml4(props.secondaryCtaText)}
           </a>` : "";
  const ctaContainerHtml = props.ctaText || props.secondaryCtaText ? `<div class="${ctaContainerClasses}">${primaryCtaHtml}${secondaryCtaHtml}</div>` : "";
  return `
        <section id="${id}" class="${sectionClasses}" style="${combinedStyles}">
            <div class="${contentClasses}">
                ${badgeHtml}
                ${titleHtml}
                ${subtitleHtml}
                ${ctaContainerHtml}
            </div>
        </section>
    `.trim();
}

// src/ssr/components/landing/Features.ts
function renderFeatures(id, props, stylesData) {
  const columns = props.columns || 3;
  const headerAlignment = props.headerAlignment || "center";
  const iconAlignment = props.iconAlignment || "center";
  const textAlignment = props.textAlignment || "center";
  const iconSize = props.iconSize || "md";
  const iconColor = props.iconColor || "hsl(var(--primary))";
  const cardBackground = props.cardBackground || "hsl(var(--card))";
  const sectionBackground = props.sectionBackground || "hsl(var(--background))";
  const sectionClasses = [
    "fb-features",
    "py-16",
    "px-6",
    "md:px-12",
    props.hideOnMobile ? "hidden md:block" : "",
    props.hideOnDesktop ? "md:hidden" : ""
  ].filter(Boolean).join(" ");
  const gridClasses = [
    "grid",
    "grid-cols-1",
    "gap-6",
    "md:gap-8",
    columns === 2 ? "md:grid-cols-2" : "",
    columns === 3 ? "md:grid-cols-2 lg:grid-cols-3" : "",
    columns >= 4 ? "md:grid-cols-2 lg:grid-cols-4" : ""
  ].filter(Boolean).join(" ");
  const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : "";
  const headerHtml = props.title || props.subtitle ? `
        <div class="mb-12" style="text-align: ${headerAlignment};">
            ${props.title ? `<h2 class="text-3xl md:text-4xl font-bold mb-3">${escapeHtml4(props.title)}</h2>` : ""}
            ${props.subtitle ? `<p class="text-lg text-muted-foreground">${escapeHtml4(props.subtitle)}</p>` : ""}
        </div>
    ` : "";
  const featuresHtml = (props.features || []).map((feature, index) => {
    const featureId = feature.id || `${id}-feature-${index}`;
    const cardProps = {
      title: feature.title,
      description: feature.description,
      icon: feature.icon,
      iconSvg: feature.iconSvg,
      iconSize,
      iconColor,
      iconAlignment,
      textAlignment,
      // Card styling - use feature-specific or section default
      style: {
        values: {
          backgroundColor: feature.cardBackground || cardBackground,
          padding: "1.5rem",
          borderRadius: "0.75rem"
        }
      }
    };
    if (feature.link) {
      return `
                <a href="${escapeHtml4(feature.link)}" class="block transition-all duration-300 hover:shadow-lg">
                    ${renderDataComponent("Card", featureId, cardProps, "")}
                </a>
            `;
    }
    return renderDataComponent("Card", featureId, cardProps, "");
  }).join("");
  return `
        <section id="${id}" class="${sectionClasses}" style="background-color: ${sectionBackground}; ${inlineStyles}">
            <div class="fb-container">
                ${headerHtml}
                <div class="${gridClasses}">
                    ${featuresHtml}
                </div>
            </div>
        </section>
    `.trim();
}

// src/ssr/components/landing/Pricing.ts
function renderPricing(id, props, stylesData) {
  const sectionClasses = [
    "fb-pricing",
    "py-12",
    "sm:py-16",
    "lg:py-24",
    "bg-muted/50",
    props.hideOnMobile ? "hidden md:block" : "",
    props.hideOnDesktop ? "md:hidden" : ""
  ].filter(Boolean).join(" ");
  const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : "";
  const headerHtml = props.title || props.subtitle ? `
        <div class="text-center mb-12 sm:mb-16">
            ${props.title ? `<h2 class="text-2xl sm:text-3xl lg:text-4xl font-semibold mb-4">${escapeHtml4(props.title)}</h2>` : ""}
            ${props.subtitle ? `<p class="text-lg sm:text-xl text-muted-foreground">${escapeHtml4(props.subtitle)}</p>` : ""}
        </div>
    ` : "";
  const plansHtml = (props.plans || []).map((plan) => {
    const cardClasses = [
      "flex",
      "flex-col",
      "p-6",
      "sm:p-8",
      "rounded-xl",
      "border",
      "bg-card",
      plan.highlighted ? "border-primary shadow-lg ring-1 ring-primary" : ""
    ].filter(Boolean).join(" ");
    const badgeHtml = plan.badge ? `<span class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-semibold rounded-full bg-primary text-primary-foreground">${escapeHtml4(plan.badge)}</span>` : "";
    const featuresHtml = plan.features.map((feature) => `
            <li class="flex items-center gap-2">
                <svg class="w-5 h-5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>${escapeHtml4(feature)}</span>
            </li>
        `).join("");
    return `
            <div class="${cardClasses} relative">
                ${badgeHtml}
                <div class="mb-6">
                    <h3 class="text-xl font-semibold mb-2">${escapeHtml4(plan.name)}</h3>
                    ${plan.description ? `<p class="text-muted-foreground text-sm">${escapeHtml4(plan.description)}</p>` : ""}
                </div>
                <div class="mb-6">
                    <span class="text-4xl sm:text-5xl font-bold">${escapeHtml4(plan.price)}</span>
                    ${plan.period ? `<span class="text-muted-foreground ml-1">${escapeHtml4(plan.period)}</span>` : ""}
                </div>
                <ul class="space-y-3 mb-8 flex-1">
                    ${featuresHtml}
                </ul>
                <a href="${escapeHtml4(plan.ctaLink)}" 
                   class="inline-flex items-center justify-center w-full px-6 py-3 rounded-lg ${plan.highlighted ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-input bg-background hover:bg-accent"} font-medium transition-colors">
                    ${escapeHtml4(plan.ctaText)}
                </a>
            </div>
        `;
  }).join("");
  const gridCols = props.plans?.length === 2 ? "lg:grid-cols-2" : props.plans?.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return `
        <section id="${id}" class="${sectionClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                ${headerHtml}
                <div class="grid grid-cols-1 gap-6 sm:gap-8 sm:grid-cols-2 ${gridCols} max-w-6xl mx-auto">
                    ${plansHtml}
                </div>
            </div>
        </section>
    `.trim();
}

// src/ssr/components/landing/CTA.ts
function renderCTA(id, props, stylesData) {
  const sectionClasses = [
    "fb-cta",
    "py-12",
    "sm:py-16",
    "lg:py-24",
    props.hideOnMobile ? "hidden md:block" : "",
    props.hideOnDesktop ? "md:hidden" : ""
  ].filter(Boolean).join(" ");
  const baseStyles = [];
  if (props.background) {
    baseStyles.push(`background: ${props.background}`);
  }
  const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : "";
  const combinedStyles = [...baseStyles, inlineStyles].filter(Boolean).join("; ");
  const secondaryCtaHtml = props.secondaryCtaText ? `<a href="${escapeHtml4(props.secondaryCtaLink || "#")}" 
             class="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-input bg-background hover:bg-accent font-medium transition-colors">
             ${escapeHtml4(props.secondaryCtaText)}
           </a>` : "";
  return `
        <section id="${id}" class="${sectionClasses}" style="${combinedStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="rounded-2xl bg-card border p-8 sm:p-12 lg:p-16 shadow-lg">
                    <div class="flex flex-col lg:flex-row items-center justify-between gap-8">
                        <div class="text-center lg:text-left max-w-2xl">
                            <h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">${escapeHtml4(props.title)}</h2>
                            ${props.subtitle ? `<p class="text-lg text-muted-foreground">${escapeHtml4(props.subtitle)}</p>` : ""}
                        </div>
                        <div class="flex flex-wrap items-center gap-4">
                            <a href="${escapeHtml4(props.ctaLink)}" 
                               class="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
                                ${escapeHtml4(props.ctaText)}
                            </a>
                            ${secondaryCtaHtml}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `.trim();
}

// src/ssr/components/landing/Navbar.ts
function renderCtaLink(id, text2, target, navType, variant) {
  const scrollAttr = navType === "scroll" ? `data-scroll-to="${escapeHtml4(target)}"` : "";
  const variantClasses = variant === "primary" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border hover:bg-accent";
  return `<a id="${id}" href="${escapeHtml4(target)}" ${scrollAttr}
       class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${variantClasses}">
        ${escapeHtml4(text2)}
    </a>`;
}
function renderNavbar(id, props, stylesData) {
  const useNewFormat = !!props.logo || !!props.menuItems;
  const headerClasses = [
    "fb-navbar",
    "bg-background",
    "border-b",
    props.sticky ? "sticky top-0 z-50" : "",
    props.hideOnMobile ? "hidden md:block" : "",
    props.hideOnDesktop ? "md:hidden" : ""
  ].filter(Boolean).join(" ");
  const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : "";
  if (useNewFormat) {
    return renderNewFormat(id, props, headerClasses, inlineStyles);
  } else {
    return renderLegacyFormat(id, props, headerClasses, inlineStyles);
  }
}
function renderNewFormat(id, props, headerClasses, inlineStyles) {
  const logo = props.logo || { type: "text", text: "YourBrand", link: "/" };
  const menuItems = props.menuItems || [];
  const primaryButton = props.primaryButton;
  const secondaryButton = props.secondaryButton;
  const logoLink = logo.link || "/";
  let logoHtml;
  console.log("[Navbar SSR] Logo props:", {
    type: logo.type,
    showIcon: logo.showIcon,
    useProjectLogo: logo.useProjectLogo,
    imageUrl: logo.imageUrl ? logo.imageUrl.substring(0, 50) + "..." : "NOT SET",
    text: logo.text
  });
  if (logo.type === "image" && logo.imageUrl) {
    logoHtml = renderImage(`${id}-logo-img`, {
      src: logo.imageUrl,
      alt: "Logo",
      height: "2rem",
      width: "auto",
      objectFit: "contain"
    });
  } else if (logo.showIcon && logo.imageUrl) {
    const iconImg = renderImage(`${id}-logo-icon`, {
      src: logo.imageUrl,
      alt: "Logo",
      height: "1.5rem",
      width: "1.5rem",
      objectFit: "contain"
    });
    const brandText = renderText(`${id}-logo-text`, {
      text: logo.text || "YourBrand",
      size: "xl",
      weight: "bold"
    });
    logoHtml = `${iconImg}${brandText}`;
  } else {
    logoHtml = renderText(`${id}-logo-text`, {
      text: logo.text || "YourBrand",
      size: "xl",
      weight: "bold"
    });
  }
  const menuItemsHtml = menuItems.map((item) => {
    const href = item.navType === "scroll" ? item.target : item.target;
    const scrollAttr = item.navType === "scroll" ? `data-scroll-to="${escapeHtml4(item.target)}"` : "";
    return `
            <a href="${escapeHtml4(href)}" ${scrollAttr} 
               class="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                ${escapeHtml4(item.label)}
            </a>
        `;
  }).join("");
  const mobileMenuItemsHtml = menuItems.map((item) => {
    const href = item.navType === "scroll" ? item.target : item.target;
    const scrollAttr = item.navType === "scroll" ? `data-scroll-to="${escapeHtml4(item.target)}"` : "";
    return `
            <a href="${escapeHtml4(href)}" ${scrollAttr}
               class="block py-2 text-muted-foreground hover:text-foreground transition-colors">
                ${escapeHtml4(item.label)}
            </a>
        `;
  }).join("");
  let buttonsHtml = "";
  const darkModeToggleHtml = props.showDarkModeToggle ? `
        <button 
            type="button" 
            class="p-2 rounded-lg hover:bg-accent transition-colors" 
            data-fb-theme-toggle
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
        >
            <!-- Sun icon (shown in dark mode) -->
            <svg class="w-5 h-5 hidden dark:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
            </svg>
            <!-- Moon icon (shown in light mode) -->
            <svg class="w-5 h-5 block dark:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
            </svg>
        </button>
    ` : "";
  if (secondaryButton?.enabled) {
    buttonsHtml += renderCtaLink(
      `${id}-secondary-btn`,
      secondaryButton.text || "Learn More",
      secondaryButton.target || "#",
      secondaryButton.navType || "link",
      "secondary"
    );
  }
  if (primaryButton?.enabled !== false) {
    buttonsHtml += renderCtaLink(
      `${id}-primary-btn`,
      primaryButton?.text || "Get Started",
      primaryButton?.target || "#",
      primaryButton?.navType || "link",
      "primary"
    );
  }
  return `
        <header id="${id}" class="${headerClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex items-center justify-between py-4">
                    <!-- Logo -->
                    <a href="${escapeHtml4(logoLink)}" class="flex items-center gap-2">
                        ${logoHtml}
                    </a>
                    
                    <!-- Desktop Navigation + CTA Buttons grouped together -->
                    <div class="hidden md:flex items-center gap-8">
                        <nav class="flex items-center gap-6">
                            ${menuItemsHtml}
                        </nav>
                        <div class="flex items-center gap-3">
                            ${darkModeToggleHtml}
                            ${buttonsHtml}
                        </div>
                    </div>
                    
                    <!-- Mobile: Dark Mode Toggle + Menu Button -->
                    <div class="md:hidden flex items-center gap-2">
                        ${darkModeToggleHtml}
                        <button type="button" class="p-2 rounded-lg hover:bg-accent" data-fb-mobile-menu-toggle>
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <!-- Mobile Menu (hidden by default) -->
                <div class="md:hidden hidden pb-4" data-fb-mobile-menu>
                    <nav class="flex flex-col gap-1">
                        ${mobileMenuItemsHtml}
                    </nav>
                    <div class="flex flex-col gap-2 mt-4 pt-4 border-t">
                        ${buttonsHtml}
                    </div>
                </div>
            </div>
        </header>
        ${props.showDarkModeToggle ? `
        <script>
            (function() {
                // Initialize theme from localStorage or system preference
                var savedTheme = localStorage.getItem('fb-theme');
                if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                }
                
                // Attach click handlers to all theme toggle buttons
                var toggles = document.querySelectorAll('[data-fb-theme-toggle]');
                for (var i = 0; i < toggles.length; i++) {
                    toggles[i].addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        var isDark = document.documentElement.classList.toggle('dark');
                        localStorage.setItem('fb-theme', isDark ? 'dark' : 'light');
                    });
                }
            })();
        </script>
        ` : ""}
    `.trim();
}
function renderLegacyFormat(id, props, headerClasses, inlineStyles) {
  const logoHtml = renderText(`${id}-logo`, {
    text: props.logoText || "Logo",
    size: "xl",
    weight: "bold"
  });
  const desktopLinksHtml = (props.links || []).map((link) => `
        <a href="${escapeHtml4(link.href)}" class="text-muted-foreground hover:text-foreground transition-colors">
            ${escapeHtml4(link.text)}
        </a>
    `).join("");
  const mobileLinksHtml = (props.links || []).map((link) => `
        <a href="${escapeHtml4(link.href)}" class="block py-2 text-muted-foreground hover:text-foreground transition-colors">
            ${escapeHtml4(link.text)}
        </a>
    `).join("");
  const ctaHtml = props.ctaText ? renderCtaLink(`${id}-cta`, props.ctaText, props.ctaLink || "#", "link", "primary") : "";
  return `
        <header id="${id}" class="${headerClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex items-center justify-between py-4">
                    <!-- Logo -->
                    <a href="/" class="flex items-center">
                        ${logoHtml}
                    </a>
                    
                    <!-- Desktop Navigation -->
                    <nav class="hidden md:flex items-center gap-8">
                        ${desktopLinksHtml}
                    </nav>
                    
                    <!-- CTA + Mobile Menu -->
                    <div class="flex items-center gap-4">
                        ${ctaHtml}
                        
                        <!-- Mobile Menu Button -->
                        <button type="button" class="md:hidden p-2 rounded-lg hover:bg-accent" data-fb-mobile-menu-toggle>
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <!-- Mobile Menu (hidden by default) -->
                <div class="md:hidden hidden pb-4" data-fb-mobile-menu>
                    <nav class="flex flex-col gap-1">
                        ${mobileLinksHtml}
                    </nav>
                </div>
            </div>
        </header>
    `.trim();
}

// src/ssr/components/landing/FAQ.ts
function renderFAQ(id, props, stylesData) {
  const sectionClasses = [
    "fb-faq",
    "py-12",
    "sm:py-16",
    "lg:py-24",
    props.hideOnMobile ? "hidden md:block" : "",
    props.hideOnDesktop ? "md:hidden" : ""
  ].filter(Boolean).join(" ");
  const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : "";
  const headerHtml = props.title || props.subtitle ? `
        <div class="text-center mb-12 sm:mb-16">
            ${props.title ? `<h2 class="text-2xl sm:text-3xl lg:text-4xl font-semibold mb-4">${escapeHtml4(props.title)}</h2>` : ""}
            ${props.subtitle ? `<p class="text-lg sm:text-xl text-muted-foreground">${escapeHtml4(props.subtitle)}</p>` : ""}
        </div>
    ` : "";
  const itemsHtml = (props.items || []).map((item, index) => `
        <div class="border-b" data-fb-accordion-item>
            <button type="button" 
                    class="flex items-center justify-between w-full py-4 text-left font-medium hover:text-primary transition-colors"
                    data-fb-accordion-trigger>
                <span class="text-lg">${escapeHtml4(item.question)}</span>
                <svg class="w-5 h-5 shrink-0 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-fb-accordion-icon>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </button>
            <div class="pb-4 hidden" data-fb-accordion-content>
                <p class="text-muted-foreground">${escapeHtml4(item.answer)}</p>
            </div>
        </div>
    `).join("");
  return `
        <section id="${id}" class="${sectionClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                ${headerHtml}
                <div class="max-w-3xl mx-auto" data-fb-accordion>
                    ${itemsHtml}
                </div>
            </div>
        </section>
    `.trim();
}

// src/ssr/components/landing/LogoCloud.ts
var SIZE_MAP = {
  sm: { height: "24px", fontSize: "14px" },
  md: { height: "32px", fontSize: "18px" },
  lg: { height: "48px", fontSize: "24px" }
};
function renderLogoCloud(id, props, stylesData) {
  const logos = props.logos || [];
  const displayMode = props.displayMode || "static";
  const speed = props.speed || 20;
  const pauseOnHover = props.pauseOnHover !== false;
  const grayscale = props.grayscale !== false;
  const logoSize = props.logoSize || "md";
  const mappedSize = typeof logoSize === "string" ? SIZE_MAP[logoSize] : void 0;
  const baseHeight = mappedSize ? mappedSize.height : `${logoSize}px`;
  const baseFontSize = mappedSize ? mappedSize.fontSize : `${Math.max(14, Number(logoSize) * 0.5)}px`;
  const basePx = parseInt(baseHeight, 10) || 32;
  const baseFontSizePx = parseInt(baseFontSize, 10) || 18;
  const sectionClasses = ["fb-logo-cloud", "py-12", "px-6"].join(" ");
  const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : "";
  const headerHtml = props.title ? `
        <p class="text-center text-muted-foreground text-sm mb-8">
            ${escapeHtml4(props.title)}
        </p>
    ` : "";
  const renderItem = (logo, idx) => {
    const scale = logo.scale || 1;
    const currentHeight = `${basePx * scale}px`;
    const currentFontSize = `${baseFontSizePx * scale}px`;
    let content = "";
    if (logo.type === "image") {
      const grayscaleClass = grayscale ? "grayscale hover:grayscale-0 opacity-60 hover:opacity-100" : "";
      const altText = escapeHtml4(logo.name || logo.value || `Logo ${idx + 1}`);
      content = `<img 
                src="${escapeHtml4(logo.value)}" 
                alt="${altText}" 
                class="object-contain transition-all duration-300 ${grayscaleClass}"
                style="height: ${currentHeight}; width: auto;"
            />`;
    } else {
      const grayscaleClass = grayscale ? "opacity-60 hover:opacity-100" : "";
      content = `<span 
                class="font-semibold whitespace-nowrap transition-all duration-300 ${grayscaleClass}"
                style="font-size: ${currentFontSize};"
            >
                ${escapeHtml4(logo.value)}
            </span>`;
    }
    if (logo.url) {
      return `<a 
                href="${escapeHtml4(logo.url)}" 
                target="_blank" 
                rel="noopener noreferrer"
                class="flex items-center justify-center hover:scale-105 transition-transform"
            >
                ${content}
            </a>`;
    }
    return `<div class="flex items-center justify-center">
            ${content}
        </div>`;
  };
  const logosHtml = logos.map((logo, idx) => renderItem(logo, idx)).join("");
  if (displayMode === "static") {
    return `
            <section id="${id}" class="${sectionClasses}" style="${inlineStyles}">
                ${headerHtml}
                <div class="flex flex-wrap justify-center items-center gap-8 md:gap-12 text-center">
                    ${logosHtml}
                </div>
            </section>
        `.trim();
  }
  const duplicatedLogosHtml = [...logos, ...logos].map((logo, idx) => `
        <div class="logo-marquee-item px-6 md:px-8">
            ${renderItem(logo, idx)}
        </div>
    `).join("");
  const pauseClass = pauseOnHover ? "logo-marquee-pause-on-hover" : "";
  const mobileOnlyClass = displayMode === "marqueeOnMobile" ? "logo-marquee-mobile-only" : "";
  return `
        <section id="${id}" class="${sectionClasses} overflow-hidden ${mobileOnlyClass}" style="${inlineStyles}">
            ${headerHtml}
            <div class="logo-marquee-container ${pauseClass}">
                <div 
                    class="logo-marquee-track" 
                    style="--marquee-speed: ${speed}s; --logo-count: ${logos.length};"
                >
                    ${duplicatedLogosHtml}
                </div>
            </div>
        </section>
    `.trim();
}

// src/ssr/components/landing/Footer.ts
var socialIcons = {
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  twitter: '<path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>',
  instagram: '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>',
  linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>',
  youtube: '<path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>',
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>'
};
function renderFooter(id, props, stylesData) {
  const footerClasses = [
    "fb-footer",
    "border-t",
    "w-full",
    "max-w-full",
    "overflow-x-hidden",
    props.hideOnMobile ? "hidden md:block" : "",
    props.hideOnDesktop ? "md:hidden" : ""
  ].filter(Boolean).join(" ");
  const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : "";
  const logoHtml = props.logo ? `<img src="${escapeHtml4(props.logo)}" alt="${escapeHtml4(props.logoText || "Logo")}" class="h-8" />` : props.logoText ? `<span class="text-xl font-bold">${escapeHtml4(props.logoText)}</span>` : "";
  const descriptionHtml = props.description ? `<p class="text-muted-foreground mt-4 max-w-xs">${escapeHtml4(props.description)}</p>` : "";
  const socialsHtml = (props.socials || []).map((social) => `
        <a href="${escapeHtml4(social.href)}" class="text-muted-foreground hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                ${socialIcons[social.icon] || ""}
            </svg>
        </a>
    `).join("");
  const columnsHtml = (props.columns || []).map((column) => `
        <div>
            <h4 class="font-semibold mb-4">${escapeHtml4(column.title)}</h4>
            <ul class="space-y-2">
                ${column.links.map((link) => `
                    <li><a href="${escapeHtml4(link.href)}" class="text-muted-foreground hover:text-foreground transition-colors">${escapeHtml4(link.text)}</a></li>
                `).join("")}
            </ul>
        </div>
    `).join("");
  const year = (/* @__PURE__ */ new Date()).getFullYear();
  const copyrightText = props.copyright || `\xA9 ${year} All rights reserved.`;
  return `
        <footer id="${id}" class="${footerClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
                <div class="flex flex-col gap-8 md:flex-row md:flex-wrap md:justify-between">
                    <!-- Brand -->
                    <div class="flex-shrink-0 max-w-sm">
                        <a href="/" class="inline-flex items-center">${logoHtml}</a>
                        ${descriptionHtml}
                        ${socialsHtml ? `<div class="flex gap-4 mt-6">${socialsHtml}</div>` : ""}
                    </div>
                    
                    <!-- Link Columns -->
                    <div class="grid grid-cols-${props.mobileColumns || 1} gap-6 sm:grid-cols-2 md:grid-cols-3 lg:flex lg:gap-12">
                        ${columnsHtml}
                    </div>
                </div>
                
                <!-- Copyright -->
                <div class="border-t mt-12 pt-8 text-center text-muted-foreground text-sm">
                    ${escapeHtml4(copyrightText)}
                </div>
            </div>
        </footer>
    `.trim();
}

// src/ssr/lib/liquid.ts
import { Liquid } from "liquidjs";
var liquid = new Liquid({
  strictVariables: false,
  // Allow undefined variables (render as empty)
  strictFilters: false,
  // Allow undefined filters (pass through)
  trimTagLeft: false,
  // Preserve whitespace
  trimTagRight: false,
  trimOutputLeft: false,
  trimOutputRight: false
});
liquid.registerFilter("money", (value, currency = "USD") => {
  const symbols = {
    USD: "$",
    EUR: "\u20AC",
    GBP: "\xA3",
    KES: "KSh",
    JPY: "\xA5",
    CNY: "\xA5",
    INR: "\u20B9",
    BRL: "R$",
    AUD: "A$",
    CAD: "C$"
  };
  const symbol = symbols[currency] || currency + " ";
  const num = Number(value);
  if (isNaN(num)) return value;
  return `${symbol}${num.toFixed(2)}`;
});
liquid.registerFilter("time_ago", (value) => {
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  const now = /* @__PURE__ */ new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 6e4);
  const diffHours = Math.floor(diffMs / 36e5);
  const diffDays = Math.floor(diffMs / 864e5);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? "s" : ""} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} year${years > 1 ? "s" : ""} ago`;
});
liquid.registerFilter("timezone", (value, tz) => {
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleString("en-US", { timeZone: tz || "UTC" });
  } catch {
    return value;
  }
});
liquid.registerFilter("date_format", (value, format = "short") => {
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    switch (format) {
      case "short":
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      case "long":
        return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      case "iso":
        return date.toISOString().split("T")[0];
      case "time":
        return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      default:
        return date.toLocaleDateString();
    }
  } catch {
    return value;
  }
});
liquid.registerFilter("json", (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
});
liquid.registerFilter("pluralize", (count, singular, plural) => {
  return count === 1 ? singular : plural;
});
liquid.registerFilter("escape_html", (value) => {
  if (typeof value !== "string") return value;
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
});
liquid.registerFilter("truncate_words", (value, wordCount = 10) => {
  if (typeof value !== "string") return value;
  const words = value.split(/\s+/);
  if (words.length <= wordCount) return value;
  return words.slice(0, wordCount).join(" ") + "...";
});
liquid.registerFilter("slugify", (value) => {
  if (typeof value !== "string") return value;
  return value.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
});
liquid.registerFilter("number", (value, locale = "en-US") => {
  const num = Number(value);
  if (isNaN(num)) return value;
  return num.toLocaleString(locale);
});
liquid.registerFilter("percent", (value, decimals = 0) => {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `${(num * 100).toFixed(decimals)}%`;
});

// src/ssr/PageRenderer.ts
var STATIC_COMPONENTS = /* @__PURE__ */ new Set([
  "Text",
  "Heading",
  "Paragraph",
  "Image",
  "Badge",
  "Divider",
  "Spacer",
  "Icon",
  "Avatar",
  "Logo",
  "Label",
  "MarkdownContent"
]);
var INTERACTIVE_COMPONENTS = /* @__PURE__ */ new Set([
  "Button",
  "Link",
  "Tabs",
  "Accordion",
  "Modal",
  "Dropdown",
  "Tooltip",
  "Toggle",
  "Checkbox",
  "Radio",
  "Switch"
]);
var DATA_COMPONENTS = /* @__PURE__ */ new Set([
  "DataTable",
  "Form",
  "InfoList",
  "Chart",
  "Grid",
  "List",
  "Card",
  "Repeater",
  "DataCard"
]);
var LAYOUT_COMPONENTS = /* @__PURE__ */ new Set([
  "Container",
  "Section",
  "Row",
  "Column",
  "Flex",
  "Grid",
  "Stack",
  "Group",
  "Box",
  "Paper",
  "Panel"
]);
var LANDING_COMPONENTS = /* @__PURE__ */ new Set([
  "Hero",
  "Features",
  "FeatureSection",
  "Pricing",
  "CTA",
  "Navbar",
  "FAQ",
  "LogoCloud",
  "Footer"
]);
function classifyComponent(type) {
  if (STATIC_COMPONENTS.has(type)) return "static";
  if (INTERACTIVE_COMPONENTS.has(type)) return "interactive";
  if (DATA_COMPONENTS.has(type)) return "data";
  if (LAYOUT_COMPONENTS.has(type)) return "layout";
  if (LANDING_COMPONENTS.has(type)) return "landing";
  return "unknown";
}
async function resolveProps(props, context) {
  if (!props) return {};
  const resolved = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "string" && (value.includes("{{") || value.includes("{%"))) {
      try {
        resolved[key] = await liquid.parseAndRender(value, context);
      } catch (error) {
        console.error(`Template error in prop "${key}":`, error);
        resolved[key] = value;
      }
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      resolved[key] = await resolveProps(value, context);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}
async function renderComponent(component, context, depth = 0) {
  const { id, type, props, styles, children, binding } = component;
  let resolvedProps = await resolveProps(props, context);
  if (type === "Navbar" && resolvedProps.logo) {
    const logoProps = resolvedProps.logo;
    if (logoProps.useProjectLogo || logoProps.showIcon) {
      const { getFaviconUrl: getFaviconUrl2 } = await import("./project-settings-CJ6JOH4I.js");
      const faviconUrl = await getFaviconUrl2();
      resolvedProps = {
        ...resolvedProps,
        logo: {
          ...logoProps,
          imageUrl: faviconUrl
        }
      };
    }
  }
  if (styles) {
    resolvedProps.style = styles;
  }
  if (props && props.className) {
    resolvedProps.className = props.className;
  }
  const classification = classifyComponent(type);
  const childrenHtml = children ? (await Promise.all(children.map((child) => renderComponent(child, context, depth + 1)))).join("") : "";
  const stylesForCSS = component.stylesData || component.styles;
  const responsiveCSS = stylesForCSS ? buildResponsiveCSS(id, stylesForCSS) : "";
  const visibilityCSS = buildVisibilityCSS(id, component.visibility);
  const combinedCSS = responsiveCSS + visibilityCSS;
  switch (classification) {
    case "static":
      return combinedCSS + renderStaticComponent(type, id, resolvedProps, childrenHtml);
    case "interactive":
      return combinedCSS + renderInteractiveComponent(type, id, resolvedProps, childrenHtml);
    case "data":
      if (binding) {
        resolvedProps.binding = binding;
      }
      return combinedCSS + renderDataComponent(type, id, resolvedProps, childrenHtml);
    case "layout":
      return renderLayoutComponent(type, id, resolvedProps, component.styles || {}, childrenHtml, component.visibility);
    case "landing":
      return combinedCSS + renderLandingComponent(type, id, resolvedProps, component.styles);
    default:
      return combinedCSS + `<div data-fb-component="${type}" data-fb-id="${id}" class="fb-unknown">${childrenHtml}</div>`;
  }
}
function renderLandingComponent(type, id, props, stylesData) {
  switch (type) {
    case "Hero":
      return renderHero(id, props, stylesData);
    case "Features":
    case "FeatureSection":
      return renderFeatures(id, props, stylesData);
    case "Pricing":
      return renderPricing(id, props, stylesData);
    case "CTA":
      return renderCTA(id, props, stylesData);
    case "Navbar":
      return renderNavbar(id, props, stylesData);
    case "FAQ":
      return renderFAQ(id, props, stylesData);
    case "LogoCloud":
      return renderLogoCloud(id, props, stylesData);
    case "Footer":
      return renderFooter(id, props, stylesData);
    default:
      return `<div data-fb-component="${type}" data-fb-id="${id}" class="fb-landing-unknown"></div>`;
  }
}
function renderLayoutComponent(type, id, props, styles, childrenHtml, visibility) {
  const inlineStyle = buildInlineStyles(props, styles);
  const className = buildClassName("fb-layout", type.toLowerCase(), props.className);
  const responsiveCSS = buildResponsiveCSS(id, styles);
  const visibilityCSS = buildVisibilityCSS(id, visibility);
  const combinedCSS = responsiveCSS + visibilityCSS;
  switch (type) {
    case "Container":
      const containerDisplay = styles.display || "";
      const isGridContainer = containerDisplay === "grid";
      if (isGridContainer) {
        const gridCols = (() => {
          const colsStyle = styles.gridTemplateColumns || "";
          if (typeof colsStyle === "string") {
            const match = colsStyle.match(/repeat\((\d+)/);
            if (match) return parseInt(match[1], 10);
          }
          return 2;
        })();
        const responsiveGridClass = gridCols <= 2 ? "grid grid-cols-1 md:grid-cols-2" : gridCols === 3 ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(gridCols, 4)}`;
        const gridGapStyle = styles.gap ? `gap:${styles.gap};` : "";
        return `${combinedCSS}<div id="${id}" class="${className} ${responsiveGridClass}" style="margin:0 auto;width:100%;${gridGapStyle}${inlineStyle.replace(/display:\s*grid[^;]*;?/gi, "").replace(/grid-template-columns[^;]*;?/gi, "")}">${childrenHtml}</div>`;
      }
      return `${combinedCSS}<div id="${id}" class="${className}" style="margin:0 auto;width:100%;${inlineStyle}">${childrenHtml}</div>`;
    case "Section":
      return `${combinedCSS}<section id="${id}" class="${className}" style="${inlineStyle}">${childrenHtml}</section>`;
    case "Row":
      return `${combinedCSS}<div id="${id}" class="${className} fb-row flex flex-col md:flex-row" style="width:100%;min-height:50px;${inlineStyle}">${childrenHtml}</div>`;
    case "Column":
      return `${combinedCSS}<div id="${id}" class="${className} fb-column" style="display:flex;flex-direction:column;min-height:50px;min-width:50px;${inlineStyle}">${childrenHtml}</div>`;
    case "Flex":
      const flexDirection = styles.flexDirection || props.direction || "row";
      const justify = styles.justifyContent || props.justify || "flex-start";
      const align = styles.alignItems || props.align || "stretch";
      const gap = styles.gap || props.gap || "0";
      return `${combinedCSS}<div id="${id}" class="${className}" style="display:flex;flex-direction:${flexDirection};justify-content:${justify};align-items:${align};gap:${gap};${inlineStyle}">${childrenHtml}</div>`;
    case "Grid":
      const columns = props.columns || 2;
      const gridGap = styles.gap || props.gap || "1rem";
      const gridResponsiveClass = columns <= 2 ? "grid grid-cols-1 md:grid-cols-2" : columns === 3 ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(columns, 4)}`;
      return `${combinedCSS}<div id="${id}" class="${className} ${gridResponsiveClass}" style="gap:${gridGap};${inlineStyle}">${childrenHtml}</div>`;
    case "Stack":
      const stackGap = styles.gap || props.gap || "1rem";
      return `${combinedCSS}<div id="${id}" class="${className}" style="display:flex;flex-direction:column;gap:${stackGap};${inlineStyle}">${childrenHtml}</div>`;
    case "Box":
    case "Paper":
    case "Panel":
    case "Group":
    default:
      return `${combinedCSS}<div id="${id}" class="${className}" style="${inlineStyle}">${childrenHtml}</div>`;
  }
}
function buildInlineStyles(props, styles) {
  const cssProps = {};
  const propMap = {
    padding: "padding",
    margin: "margin",
    width: "width",
    height: "height",
    maxWidth: "max-width",
    minWidth: "min-width",
    backgroundColor: "background-color",
    color: "color"
  };
  for (const [prop, css] of Object.entries(propMap)) {
    if (props[prop] !== void 0) {
      cssProps[css] = String(props[prop]);
    }
  }
  let styleValues = {};
  if (styles && typeof styles === "object") {
    if ("values" in styles && typeof styles.values === "object") {
      styleValues = styles.values || {};
    } else {
      const nonCssKeys = ["activeProperties", "stylingMode"];
      for (const [key, value] of Object.entries(styles)) {
        if (!nonCssKeys.includes(key)) {
          styleValues[key] = value;
        }
      }
    }
  }
  for (const [key, value] of Object.entries(styleValues)) {
    if (value === void 0 || value === null || value === "") continue;
    if (key === "size" && typeof value === "object") {
      const sizeObj = value;
      if (sizeObj.width !== void 0 && sizeObj.width !== "auto") {
        const widthUnit = sizeObj.widthUnit || "px";
        cssProps["width"] = `${sizeObj.width}${widthUnit}`;
      }
      if (sizeObj.height !== void 0 && sizeObj.height !== "auto") {
        const heightUnit = sizeObj.heightUnit || "px";
        cssProps["height"] = `${sizeObj.height}${heightUnit}`;
      }
      continue;
    }
    if ((key === "padding" || key === "margin") && typeof value === "object") {
      const boxObj = value;
      if (boxObj.top !== void 0) cssProps[`${key}-top`] = `${boxObj.top}px`;
      if (boxObj.right !== void 0) cssProps[`${key}-right`] = `${boxObj.right}px`;
      if (boxObj.bottom !== void 0) cssProps[`${key}-bottom`] = `${boxObj.bottom}px`;
      if (boxObj.left !== void 0) cssProps[`${key}-left`] = `${boxObj.left}px`;
      continue;
    }
    if (key === "horizontalAlign" && typeof value === "string") {
      if (value === "center") {
        cssProps["margin-left"] = "auto";
        cssProps["margin-right"] = "auto";
      } else if (value === "right") {
        cssProps["margin-left"] = "auto";
        cssProps["margin-right"] = "0";
      } else {
        cssProps["margin-left"] = "0";
        cssProps["margin-right"] = "auto";
      }
      continue;
    }
    if (typeof value === "object") continue;
    const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
    let cssValue = String(value);
    const unitlessProps = [
      "opacity",
      "z-index",
      "flex",
      "flex-grow",
      "flex-shrink",
      "order",
      "line-height",
      "font-weight",
      "grid-column",
      "grid-row",
      "grid-area",
      "grid-column-start",
      "grid-column-end",
      "grid-row-start",
      "grid-row-end",
      "column-count",
      "fill-opacity",
      "stroke-opacity"
    ];
    if (/^-?\d+(\.\d+)?$/.test(cssValue) && !unitlessProps.includes(cssKey)) {
      cssValue += "px";
    }
    cssProps[cssKey] = cssValue;
  }
  return Object.entries(cssProps).map(([key, value]) => `${key}:${value}`).join(";");
}
function buildResponsiveCSS(componentId, styles) {
  if (!styles || !styles.viewportOverrides) {
    return "";
  }
  const viewportOverrides = styles.viewportOverrides;
  const cssRules = [];
  const valuesToCSS = (values) => {
    const props = [];
    for (const [key, value] of Object.entries(values)) {
      if (value === void 0 || value === null || value === "") continue;
      const withImp = (val) => `${val} !important`;
      if (key === "size" && typeof value === "object") {
        const sizeObj = value;
        if (sizeObj.width !== void 0 && sizeObj.width !== "auto") {
          const widthUnit = sizeObj.widthUnit || "px";
          props.push(`width:${withImp(sizeObj.width + widthUnit)}`);
        }
        if (sizeObj.height !== void 0 && sizeObj.height !== "auto") {
          const heightUnit = sizeObj.heightUnit || "px";
          props.push(`height:${withImp(sizeObj.height + heightUnit)}`);
        }
        continue;
      }
      if ((key === "padding" || key === "margin") && typeof value === "object") {
        const boxObj = value;
        if (boxObj.top !== void 0) props.push(`${key}-top:${withImp(boxObj.top + "px")}`);
        if (boxObj.right !== void 0) props.push(`${key}-right:${withImp(boxObj.right + "px")}`);
        if (boxObj.bottom !== void 0) props.push(`${key}-bottom:${withImp(boxObj.bottom + "px")}`);
        if (boxObj.left !== void 0) props.push(`${key}-left:${withImp(boxObj.left + "px")}`);
        continue;
      }
      if (key === "horizontalAlign" && typeof value === "string") {
        if (value === "center") {
          props.push(`margin-left:${withImp("auto")}`, `margin-right:${withImp("auto")}`);
        } else if (value === "right") {
          props.push(`margin-left:${withImp("auto")}`, `margin-right:${withImp(0)}`);
        } else {
          props.push(`margin-left:${withImp(0)}`, `margin-right:${withImp("auto")}`);
        }
        continue;
      }
      if (typeof value === "object") continue;
      const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      let cssValue = String(value);
      const unitlessProps = [
        "opacity",
        "z-index",
        "flex",
        "flex-grow",
        "flex-shrink",
        "order",
        "line-height",
        "font-weight",
        "grid-column",
        "grid-row",
        "grid-area",
        "grid-column-start",
        "grid-column-end",
        "grid-row-start",
        "grid-row-end",
        "column-count",
        "fill-opacity",
        "stroke-opacity"
      ];
      if (/^-?\d+(\.\d+)?$/.test(cssValue) && !unitlessProps.includes(cssKey)) {
        cssValue += "px";
      }
      props.push(`${cssKey}:${withImp(cssValue)}`);
    }
    return props.join(";");
  };
  if (viewportOverrides.tablet && Object.keys(viewportOverrides.tablet).length > 0) {
    const tabletCSS = valuesToCSS(viewportOverrides.tablet);
    if (tabletCSS) {
      cssRules.push(`@media(max-width:1024px){[id="${componentId}"]{${tabletCSS}}}`);
    }
  }
  if (viewportOverrides.mobile && Object.keys(viewportOverrides.mobile).length > 0) {
    const mobileCSS = valuesToCSS(viewportOverrides.mobile);
    if (mobileCSS) {
      cssRules.push(`@media(max-width:640px){[id="${componentId}"]{${mobileCSS}}}`);
    }
  }
  if (cssRules.length === 0) {
    return "";
  }
  return `<style>${cssRules.join("")}</style>`;
}
function buildVisibilityCSS(componentId, visibility) {
  if (!visibility) return "";
  const { mobile = true, tablet = true, desktop = true } = visibility;
  if (mobile && tablet && desktop) return "";
  const cssRules = [];
  if (!desktop) {
    cssRules.push(`@media(min-width:1025px){[id="${componentId}"]{display:none!important}}`);
  }
  if (!tablet) {
    cssRules.push(`@media(min-width:641px) and (max-width:1024px){[id="${componentId}"]{display:none!important}}`);
  }
  if (!mobile) {
    cssRules.push(`@media(max-width:640px){[id="${componentId}"]{display:none!important}}`);
  }
  if (cssRules.length === 0) return "";
  return `<style>${cssRules.join("")}</style>`;
}
function buildStyleString(props) {
  const styleProps = {};
  const propMap = {
    padding: "padding",
    margin: "margin",
    width: "width",
    height: "height",
    maxWidth: "max-width",
    minWidth: "min-width",
    maxHeight: "max-height",
    minHeight: "min-height",
    background: "background",
    backgroundColor: "background-color",
    color: "color",
    border: "border",
    borderRadius: "border-radius",
    boxShadow: "box-shadow",
    opacity: "opacity",
    overflow: "overflow"
  };
  for (const [prop, css] of Object.entries(propMap)) {
    if (props[prop] !== void 0) {
      styleProps[css] = String(props[prop]);
    }
  }
  if (props.style && typeof props.style === "object") {
    Object.assign(styleProps, props.style);
  }
  return Object.entries(styleProps).map(([key, value]) => `${key}:${value}`).join(";");
}
function buildClassName(...classes) {
  return classes.filter(Boolean).join(" ");
}
async function renderPage(layoutData, context) {
  if (!layoutData || !layoutData.content) {
    return '<div class="fb-empty">No content</div>';
  }
  const rootProps = layoutData.root || {};
  const containerStyles = rootProps.containerStyles;
  let rootStyle = "";
  let rootClass = rootProps.className || "";
  if (containerStyles) {
    if ("values" in containerStyles && containerStyles.values) {
      const { values } = containerStyles;
      const styleParts = [];
      for (const [prop, value] of Object.entries(values)) {
        if (value === void 0 || value === null || value === "" || prop === "className") {
          continue;
        }
        if (prop === "size" && typeof value === "object") {
          const sizeObj = value;
          if (sizeObj.width !== void 0 && sizeObj.width !== "auto") {
            const widthUnit = sizeObj.widthUnit || "px";
            styleParts.push(`width:${sizeObj.width}${widthUnit}`);
          }
          if (sizeObj.height !== void 0 && sizeObj.height !== "auto") {
            const heightUnit = sizeObj.heightUnit || "px";
            styleParts.push(`height:${sizeObj.height}${heightUnit}`);
          }
          continue;
        }
        if ((prop === "padding" || prop === "margin") && typeof value === "object") {
          const boxObj = value;
          if (boxObj.top !== void 0) styleParts.push(`${prop}-top:${boxObj.top}px`);
          if (boxObj.right !== void 0) styleParts.push(`${prop}-right:${boxObj.right}px`);
          if (boxObj.bottom !== void 0) styleParts.push(`${prop}-bottom:${boxObj.bottom}px`);
          if (boxObj.left !== void 0) styleParts.push(`${prop}-left:${boxObj.left}px`);
          continue;
        }
        if (prop === "horizontalAlign" && typeof value === "string") {
          if (value === "center") {
            styleParts.push("margin-left:auto");
            styleParts.push("margin-right:auto");
          } else if (value === "right") {
            styleParts.push("margin-left:auto");
            styleParts.push("margin-right:0");
          } else {
            styleParts.push("margin-left:0");
            styleParts.push("margin-right:auto");
          }
          continue;
        }
        if (typeof value === "object") {
          continue;
        }
        const cssKey = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
        styleParts.push(`${cssKey}:${value}`);
      }
      if (values.className) {
        rootClass = buildClassName(rootClass, String(values.className));
      }
      rootStyle = styleParts.join(";");
    } else {
      rootStyle = buildStyleString(containerStyles);
    }
  } else {
    rootStyle = buildStyleString(rootProps);
  }
  const contentHtml = (await Promise.all(
    layoutData.content.map((component) => renderComponent(component, context))
  )).join("");
  return `<div class="fb-page ${rootClass}" style="${rootStyle}">${contentHtml}</div>`;
}

// src/ssr/lib/auth.ts
import { createClient as createClient2 } from "@supabase/supabase-js";
var supabase = null;
function getSupabaseClient() {
  if (supabase) return supabase;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase credentials not configured. User auth will be disabled.");
    return null;
  }
  supabase = createClient2(supabaseUrl, supabaseAnonKey);
  return supabase;
}
async function getUserFromSession(request) {
  try {
    const client2 = getSupabaseClient();
    if (!client2) return null;
    const accessToken = extractAccessToken(request);
    if (!accessToken) return null;
    const { data: { user }, error } = await client2.auth.getUser(accessToken);
    if (error || !user) {
      console.warn("Auth verification failed:", error?.message);
      return null;
    }
    const { data: contact, error: contactError } = await client2.from("contacts").select("*").eq("email", user.email).single();
    if (contactError || !contact) {
      return {
        id: user.id,
        email: user.email || "",
        name: user.user_metadata?.full_name || user.user_metadata?.name || "",
        firstName: user.user_metadata?.first_name || "",
        lastName: user.user_metadata?.last_name || "",
        avatar: user.user_metadata?.avatar_url,
        role: "user"
      };
    }
    return {
      id: contact.id,
      email: contact.email,
      name: contact.name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
      firstName: contact.first_name || "",
      lastName: contact.last_name || "",
      avatar: contact.avatar_url,
      role: contact.role || "user",
      phone: contact.phone,
      company: contact.company,
      createdAt: contact.created_at,
      // Include all other contact fields dynamically
      ...contact
    };
  } catch (error) {
    console.error("getUserFromSession error:", error);
    return null;
  }
}
function extractAccessToken(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = parseCookies(cookieHeader);
  const tokenCookieNames = [
    "sb-access-token",
    "supabase-auth-token",
    "sb-auth-token"
  ];
  for (const name of tokenCookieNames) {
    if (cookies[name]) {
      try {
        const parsed = JSON.parse(cookies[name]);
        if (parsed.access_token) return parsed.access_token;
        if (typeof parsed === "string") return parsed;
      } catch {
        return cookies[name];
      }
    }
  }
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}
function parseCookies(cookieHeader) {
  const cookies = {};
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) {
      cookies[name] = decodeURIComponent(rest.join("="));
    }
  });
  return cookies;
}

// src/ssr/lib/tracking.ts
var TRACKING_COOKIE_NAME = "fb_visitor";
var CONSENT_COOKIE_NAME = "fb_consent";
function applyVisitorTracking(visitor, request, config, cookies) {
  if (!config.enableVisitorTracking) {
    return visitor;
  }
  if (config.requireCookieConsent && cookies[CONSENT_COOKIE_NAME] !== "accepted") {
    return visitor;
  }
  const trackingData = parseTrackingCookie(cookies[TRACKING_COOKIE_NAME]);
  const isFirstVisit = !trackingData;
  const tracking = {
    isFirstVisit,
    visitCount: (trackingData?.visitCount || 0) + 1,
    firstVisitAt: trackingData?.firstVisitAt || (/* @__PURE__ */ new Date()).toISOString(),
    landingPage: trackingData?.landingPage || new URL(request.url).pathname
  };
  return {
    ...visitor,
    ...tracking
  };
}
function getDefaultTrackingConfig() {
  return {
    enableVisitorTracking: false,
    cookieExpiryDays: 365,
    requireCookieConsent: true
  };
}
function parseTrackingCookie(value) {
  if (!value) return null;
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return null;
  }
}

// src/ssr/lib/context.ts
async function buildTemplateContext(request, pageData, trackingConfig, dataContext) {
  const cookies = parseCookies2(request.headers.get("Cookie") || "");
  const user = await getUserFromSession(request);
  let visitor = buildVisitorContext(request);
  const config = trackingConfig || getDefaultTrackingConfig();
  visitor = applyVisitorTracking(visitor, request, config, cookies);
  const url = buildUrlContext(request);
  const system = buildSystemContext();
  const origin = new URL(request.url).origin;
  return {
    page: {
      id: pageData.id,
      title: pageData.title,
      url: pageData.canonicalUrl || `${origin}/${pageData.slug}`,
      slug: pageData.slug,
      description: pageData.description || "",
      published: pageData.published,
      createdAt: pageData.createdAt,
      updatedAt: pageData.updatedAt,
      image: pageData.ogImage || "",
      type: pageData.ogType || "website",
      custom: pageData.customVariables || {}
    },
    user,
    visitor,
    url,
    system,
    cookies,
    local: {},
    // Populated by page-level state
    session: {},
    // Client-only, empty on SSR
    record: dataContext?.record,
    records: dataContext?.records
  };
}
function parseCookies2(cookieHeader) {
  const cookies = {};
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) {
      try {
        cookies[name] = decodeURIComponent(rest.join("="));
      } catch {
        cookies[name] = rest.join("=");
      }
    }
  });
  return cookies;
}
function buildVisitorContext(request) {
  const headers = request.headers;
  const userAgent = headers.get("User-Agent") || "";
  const isMobile = /Mobile|Android|iPhone/i.test(userAgent) && !/iPad|Tablet/i.test(userAgent);
  const isTablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent);
  let browser = "Unknown";
  if (userAgent.includes("Edg/")) browser = "Edge";
  else if (userAgent.includes("Chrome/")) browser = "Chrome";
  else if (userAgent.includes("Firefox/")) browser = "Firefox";
  else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome")) browser = "Safari";
  let os = "Unknown";
  if (userAgent.includes("Windows")) os = "Windows";
  else if (userAgent.includes("Mac OS")) os = "macOS";
  else if (userAgent.includes("Linux") && !userAgent.includes("Android")) os = "Linux";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) os = "iOS";
  const cf = request.cf;
  const rawIp = headers.get("CF-Connecting-IP") || headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "";
  const isLocalhost = !rawIp || rawIp === "127.0.0.1" || rawIp === "::1" || rawIp.startsWith("192.168.") || rawIp.startsWith("10.");
  const countryCode = headers.get("CF-IPCountry") || cf?.country || "";
  let country = countryCode;
  const cookies = parseCookies2(headers.get("Cookie") || "");
  let clientEnhanced = {};
  const enhancedCookie = cookies["visitor-enhanced"];
  if (enhancedCookie) {
    try {
      clientEnhanced = JSON.parse(decodeURIComponent(enhancedCookie));
    } catch {
    }
  }
  let timezone = clientEnhanced.tz || cookies["visitor-tz"] || cf?.timezone || "UTC";
  let city = cf?.city || "";
  if (!city && timezone && timezone.includes("/")) {
    city = timezone.split("/").pop()?.replace(/_/g, " ") || "";
  }
  if (countryCode && countryCode.length === 2 && countryCode !== "XX") {
    try {
      const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
      country = regionNames.of(countryCode) || countryCode;
    } catch (e) {
      console.warn("[SSR] Failed to convert country code:", countryCode);
    }
  }
  if (isLocalhost && (!countryCode || countryCode === "")) {
    country = "Local";
    city = "Development";
    timezone = clientEnhanced.tz || cookies["visitor-tz"] || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
  return {
    ip: rawIp,
    country,
    city,
    timezone,
    device: isTablet ? "tablet" : isMobile ? "mobile" : "desktop",
    browser,
    os,
    language: headers.get("Accept-Language")?.split(",")[0]?.split(";")[0] || "en",
    referrer: headers.get("Referer") || "",
    isBot: /bot|crawl|spider|slurp|googlebot|bingbot/i.test(userAgent),
    // Client-side enhanced fields
    viewport: clientEnhanced.vp,
    themePreference: clientEnhanced.theme,
    connectionType: clientEnhanced.conn
  };
}
function buildUrlContext(request) {
  const url = {};
  try {
    const searchParams = new URL(request.url).searchParams;
    searchParams.forEach((value, key) => {
      url[key] = value;
    });
  } catch {
  }
  return url;
}
function buildSystemContext() {
  const now = /* @__PURE__ */ new Date();
  return {
    date: now.toISOString().split("T")[0],
    time: now.toISOString().split("T")[1],
    datetime: now.toISOString(),
    timestamp: now.getTime(),
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
    env: process.env.NODE_ENV || "development"
  };
}

// src/routes/pages.ts
var ErrorResponseSchema2 = z7.object({
  error: z7.string(),
  message: z7.string().optional()
});
var pagesRoute = new OpenAPIHono6();
var renderPageRoute = createRoute6({
  method: "get",
  path: "/:slug",
  tags: ["Pages"],
  summary: "Render a published page",
  description: "Server-side renders a published page by slug. Returns full HTML document.",
  request: {
    params: z7.object({
      slug: z7.string().min(1).describe("Page slug")
    })
  },
  responses: {
    200: {
      description: "Rendered HTML page",
      content: {
        "text/html": {
          schema: z7.string()
        }
      }
    },
    404: {
      description: "Page not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema2
        }
      }
    }
  }
});
initPagesDb().catch(console.error);
async function fetchPage(slug) {
  try {
    const publishedPage = await getPublishedPageBySlug(slug);
    if (publishedPage) {
      console.log(`[SSR] Found published page: ${slug} (v${publishedPage.version})`);
      return {
        id: publishedPage.id,
        name: publishedPage.name,
        slug: publishedPage.slug,
        title: publishedPage.title,
        description: publishedPage.description,
        isPublic: publishedPage.isPublic,
        isHomepage: publishedPage.isHomepage,
        layoutData: publishedPage.layoutData,
        createdAt: publishedPage.publishedAt,
        updatedAt: publishedPage.publishedAt
      };
    }
  } catch (error) {
    console.warn("[SSR] Error reading local storage:", error);
  }
  const apiBase = process.env.FASTAPI_URL || "http://127.0.0.1:8000";
  try {
    const url = `${apiBase}/api/pages/public/${slug}`;
    console.log(`[SSR] Fallback to FastAPI: ${url}`);
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      redirect: "follow"
    });
    if (!response.ok) {
      if (response.status === 404) return null;
      console.error(`Failed to fetch page: ${response.status}`);
      return null;
    }
    const result = await response.json();
    return result.success ? result.data : null;
  } catch (error) {
    console.error("Error fetching page from FastAPI:", error);
    return null;
  }
}
async function fetchTrackingConfig() {
  const apiBase = process.env.FASTAPI_URL || "http://127.0.0.1:8000";
  try {
    const response = await fetch(`${apiBase}/api/settings/privacy`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn("[SSR] Failed to fetch tracking config:", error);
  }
  return getDefaultTrackingConfig();
}
function generateHtmlDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl = DEFAULT_FAVICON) {
  const title = page.title || page.name;
  const description = page.description || "";
  const keywords = page.keywords || "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml5(title)}</title>
    ${description ? `<meta name="description" content="${escapeHtml5(description)}">` : ""}
    ${keywords ? `<meta name="keywords" content="${escapeHtml5(keywords)}">` : ""}
    <meta name="generator" content="Frontbase">
    
    <!-- Favicon -->
    <link rel="icon" type="image/png" href="${faviconUrl}">
    <link rel="apple-touch-icon" href="${faviconUrl}">
    
    <!-- Prefetch hydration bundles -->
    <link rel="modulepreload" href="/static/hydrate.js">
    <link rel="modulepreload" href="/static/react/hydrate.js">

    <!-- Client-Side Visitor Context Enhancement -->
    <script>
    (function() {
        if (sessionStorage.getItem('visitor-enhanced')) return;
        
        // Configuration from advancedVariables
        const adv = ${JSON.stringify(trackingConfig.advancedVariables || {})};
        const data = {};

        // Timezone as UTC offset (+3, -5.5)
        if (adv.timezone?.collect !== false) {
            const offset = -new Date().getTimezoneOffset() / 60;
            data.tz = (offset >= 0 ? '+' : '') + offset;
        }

        // Viewport only
        if (adv.viewport?.collect !== false) {
            data.vp = innerWidth + 'x' + innerHeight;
        }

        // Theme preference
        if (adv.themePreference?.collect !== false) {
            data.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        // Connection type
        if (adv.connectionType?.collect !== false && navigator.connection) {
            data.conn = navigator.connection.effectiveType;
        }

        if (Object.keys(data).length > 0) {
            document.cookie = "visitor-enhanced=" + encodeURIComponent(JSON.stringify(data)) + "; path=/; max-age=31536000; SameSite=Lax";
            sessionStorage.setItem('visitor-enhanced', '1');
        }
    })();
    </script>
    
    <!-- Tailwind CSS (for builder previews) -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              border: "hsl(var(--border))",
              input: "hsl(var(--input))",
              ring: "hsl(var(--ring))",
              background: "hsl(var(--background))",
              foreground: "hsl(var(--foreground))",
              primary: {
                DEFAULT: "hsl(var(--primary))",
                foreground: "hsl(var(--primary-foreground))",
              },
              secondary: {
                DEFAULT: "hsl(var(--secondary))",
                foreground: "hsl(var(--secondary-foreground))",
              },
              destructive: {
                DEFAULT: "hsl(var(--destructive))",
                foreground: "hsl(var(--destructive-foreground))",
              },
              muted: {
                DEFAULT: "hsl(var(--muted))",
                foreground: "hsl(var(--muted-foreground))",
              },
              accent: {
                DEFAULT: "hsl(var(--accent))",
                foreground: "hsl(var(--accent-foreground))",
              },
              popover: {
                DEFAULT: "hsl(var(--popover))",
                foreground: "hsl(var(--popover-foreground))",
              },
              card: {
                DEFAULT: "hsl(var(--card))",
                foreground: "hsl(var(--card-foreground))",
              },
            },
          },
        },
      }
    </script>
    
    <!-- Base styles (from CSS Bundle or fallback) -->
    <style>
        ${page.cssBundle || `
        /* FALLBACK CSS - Used when cssBundle is not available (legacy pages) */
        :root {
            --background: 0 0% 100%;
            --foreground: 222.2 84% 4.9%;
            --muted: 210 40% 96.1%;
            --muted-foreground: 215.4 16.3% 46.9%;
            --popover: 0 0% 100%;
            --popover-foreground: 222.2 84% 4.9%;
            --card: 0 0% 100%;
            --card-foreground: 222.2 84% 4.9%;
            --border: 214.3 31.8% 91.4%;
            --input: 214.3 31.8% 91.4%;
            --primary: 222.2 47.4% 11.2%;
            --primary-foreground: 210 40% 98%;
            --secondary: 210 40% 96.1%;
            --secondary-foreground: 222.2 47.4% 11.2%;
            --accent: 210 40% 96.1%;
            --accent-foreground: 222.2 47.4% 11.2%;
            --destructive: 0 84.2% 60.2%;
            --destructive-foreground: 210 40% 98%;
            --ring: 222.2 84% 4.9%;
            --radius: 0.5rem;
        }
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; }
        .fb-page { min-height: 100vh; display: flex; flex-direction: column; padding: 2rem; gap: 1rem; }
        .fb-button { display: inline-flex; align-items: center; justify-content: center; }
        .fb-heading { margin: 0; }
        .fb-heading-1 { font-size: 2.25rem; font-weight: 700; }
        .fb-heading-2 { font-size: 1.875rem; font-weight: 600; }
        .fb-heading-3 { font-size: 1.5rem; font-weight: 600; }
        .fb-loading { opacity: 0.7; pointer-events: none; }
        .fb-skeleton { background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: skeleton 1.5s infinite; }
        @keyframes skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes marquee-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .logo-marquee-container { overflow: hidden; width: 100%; mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); }
        .logo-marquee-track { display: flex; width: max-content; animation: marquee-scroll var(--marquee-speed, 20s) linear infinite; }
        .logo-marquee-pause-on-hover:hover .logo-marquee-track { animation-play-state: paused; }
        .logo-marquee-item { flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .logo-marquee-mobile-only .logo-marquee-track { animation: none; flex-wrap: wrap; justify-content: center; gap: 2rem; width: 100%; }
        .logo-marquee-mobile-only .logo-marquee-container { mask-image: none; -webkit-mask-image: none; }
        @media (max-width: 640px) {
            .logo-marquee-mobile-only .logo-marquee-track { animation: marquee-scroll var(--marquee-speed, 20s) linear infinite; flex-wrap: nowrap; justify-content: flex-start; gap: 0; width: max-content; }
            .logo-marquee-mobile-only .logo-marquee-container { mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); }
        }
        `}
    </style>
</head>
<body>
    <div id="root">${bodyHtml}</div>
    
    <!-- Initial state for hydration -->
    <script>
        window.__INITIAL_STATE__ = ${JSON.stringify(initialState)};
        window.__PAGE_DATA__ = ${JSON.stringify({
    id: page.id,
    slug: page.slug,
    layoutData: page.layoutData,
    // Include for hydration access to bindings with dataRequest
    datasources: page.datasources
  })};
    </script>
    
    <!-- Hydration bundle (vanilla JS for simple components) -->
    <script type="module" src="/static/hydrate.js"></script>
    
    <!-- React hydration bundle (DataTable, Charts, Forms) -->
    <script type="module" src="/static/react/hydrate.js"></script>
</body>
</html>`;
}
function escapeHtml5(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
pagesRoute.openapi(renderPageRoute, async (c) => {
  const { slug } = c.req.param();
  const page = await fetchPage(slug);
  if (!page) {
    return c.json(
      { error: "Page not found", message: `No page found with slug: ${slug}` },
      404
    );
  }
  const contextPageData = {
    id: page.id,
    title: page.title || page.name,
    slug: page.slug,
    description: page.description,
    published: page.isPublic,
    createdAt: page.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: page.updatedAt || (/* @__PURE__ */ new Date()).toISOString(),
    canonicalUrl: void 0,
    ogImage: void 0,
    ogType: "website",
    customVariables: {}
  };
  const context = await buildTemplateContext(
    c.req.raw,
    contextPageData,
    void 0,
    // trackingConfig (use defaults)
    void 0
    // dataContext
  );
  console.log("[SSR] Visitor Context:", JSON.stringify({
    country: context.visitor.country,
    city: context.visitor.city,
    ip: context.visitor.ip,
    device: context.visitor.device,
    browser: context.visitor.browser
  }, null, 2));
  const bodyHtml = await renderPage(page.layoutData, context);
  const initialState = {
    pageVariables: context.local,
    sessionVariables: context.session,
    cookies: context.cookies
  };
  const trackingConfig = await fetchTrackingConfig();
  const faviconUrl = await getFaviconUrl();
  const htmlDoc = generateHtmlDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl);
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.html(htmlDoc);
});
pagesRoute.get("/", async (c) => {
  const { getHomepage: getLocalHomepage, upsertPublishedPage: upsertPublishedPage2 } = await import("./pages-store-REUKSNSS.js");
  try {
    let homepage = await getLocalHomepage();
    if (homepage) {
      console.log(`[SSR] Rendering homepage: ${homepage.slug} (v${homepage.version})`);
    } else {
      console.log("[SSR] No local homepage found, pulling from FastAPI...");
      const fastapiUrl = process.env.FASTAPI_URL || "http://backend:8000";
      try {
        const response = await fetch(`${fastapiUrl}/api/pages/homepage/`);
        if (response.ok) {
          const result = await response.json();
          const pageData = result.data;
          const publishData = {
            id: pageData.id,
            slug: pageData.slug,
            name: pageData.name,
            title: pageData.title || void 0,
            description: pageData.description || void 0,
            layoutData: pageData.layoutData,
            seoData: pageData.seoData || void 0,
            datasources: pageData.datasources || void 0,
            version: 1,
            publishedAt: (/* @__PURE__ */ new Date()).toISOString(),
            isPublic: pageData.isPublic ?? true,
            isHomepage: true
          };
          await upsertPublishedPage2(publishData);
          console.log(`[SSR] Pull-published homepage: ${pageData.slug}`);
          homepage = publishData;
        } else {
          console.warn(`[SSR] FastAPI homepage fetch failed: ${response.status}`);
        }
      } catch (fetchError) {
        console.error("[SSR] Pull-publish failed:", fetchError);
      }
    }
    if (homepage) {
      const page = {
        id: homepage.id,
        slug: homepage.slug,
        title: homepage.title,
        description: homepage.description,
        name: homepage.name,
        isPublic: homepage.isPublic,
        isHomepage: homepage.isHomepage,
        layoutData: homepage.layoutData,
        datasources: homepage.datasources
      };
      const contextPageData = {
        id: homepage.id,
        title: homepage.title || homepage.name,
        slug: homepage.slug,
        description: homepage.description,
        published: homepage.isPublic,
        createdAt: homepage.publishedAt || (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: homepage.publishedAt || (/* @__PURE__ */ new Date()).toISOString(),
        canonicalUrl: void 0,
        ogImage: void 0,
        ogType: "website",
        customVariables: {}
      };
      const context = await buildTemplateContext(
        c.req.raw,
        contextPageData,
        void 0,
        // trackingConfig
        void 0
        // dataContext
      );
      const bodyHtml = await renderPage(page.layoutData, context);
      const initialState = {
        pageVariables: context.local,
        sessionVariables: context.session,
        cookies: context.cookies
      };
      const trackingConfig = await fetchTrackingConfig();
      const faviconUrl = await getFaviconUrl();
      const fullHtml = generateHtmlDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl);
      return c.html(fullHtml);
    }
  } catch (error) {
    console.error("Error fetching homepage:", error);
  }
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>No Homepage Configured</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; }
        .container { max-width: 600px; margin: 0 auto; text-align: center; padding-top: 4rem; }
        h1 { color: #1e293b; }
        p { color: #64748b; }
        a { display: inline-block; background: #1e293b; color: white; padding: 0.75rem 2rem; border-radius: 0.5rem; text-decoration: none; margin-top: 1rem; }
        a:hover { background: #334155; }
    </style>
</head>
<body>
    <div class="container">
        <h1>No Homepage Configured</h1>
        <p>Create a homepage in the dashboard and mark it as the homepage.</p>
        <a href="/dashboard">Go to Dashboard</a>
    </div>
</body>
</html>
    `);
});

// src/routes/import.ts
import { Hono } from "hono";

// src/schemas/publish.ts
import { z as z8 } from "zod";
var ComponentTypeSchema = z8.enum([
  // Static
  "Text",
  "Heading",
  "Image",
  "Badge",
  "Divider",
  "Spacer",
  "Icon",
  "Avatar",
  "Label",
  "MarkdownContent",
  // Interactive
  "Button",
  "Link",
  "Tabs",
  "Accordion",
  "Modal",
  "Dropdown",
  "Toggle",
  "Checkbox",
  "Radio",
  // Data-Driven
  "DataTable",
  "Form",
  "InfoList",
  "Chart",
  "DataCard",
  "Repeater",
  "Grid",
  // Layout
  "Container",
  "Row",
  "Column",
  "Section",
  "Card",
  "Panel"
]);
var DatasourceTypeSchema = z8.enum([
  "supabase",
  "neon",
  "planetscale",
  "turso",
  "postgres",
  "mysql",
  "sqlite"
]);
var DatasourceConfigSchema = z8.object({
  id: z8.string(),
  type: DatasourceTypeSchema,
  name: z8.string(),
  // URL is safe to publish (no password)
  url: z8.string().optional(),
  // For Supabase: anon key is safe to publish
  anonKey: z8.string().optional(),
  // Secret environment variable name (actual secret NOT published)
  secretEnvVar: z8.string().optional()
});
var ColumnOverrideSchema = z8.object({
  visible: z8.boolean().nullish(),
  label: z8.string().nullish(),
  width: z8.string().nullish(),
  sortable: z8.boolean().nullish(),
  filterable: z8.boolean().nullish(),
  type: z8.string().nullish(),
  primaryKey: z8.string().nullish()
  // Added for FK reference
});
var DataRequestSchema = z8.object({
  url: z8.string(),
  // Full URL with query params (may contain {{ENV_VAR}} placeholders)
  method: z8.string().default("GET"),
  // HTTP method
  headers: z8.record(z8.string(), z8.string()).default({}),
  // Headers
  body: z8.record(z8.string(), z8.unknown()).optional(),
  // For POST requests
  resultPath: z8.string().default(""),
  // JSON path to extract data
  flattenRelations: z8.boolean().default(true),
  // Flatten nested objects
  queryConfig: z8.record(z8.string(), z8.unknown()).optional()
  // RPC config for DataTable
});
var ComponentBindingSchema = z8.object({
  componentId: z8.string(),
  datasourceId: z8.string().nullish(),
  tableName: z8.string().nullish(),
  columns: z8.array(z8.string()).nullish(),
  columnOrder: z8.array(z8.string()).nullish(),
  // Added for React DataTable support
  columnOverrides: z8.record(z8.string(), ColumnOverrideSchema).nullish(),
  filters: z8.record(z8.string(), z8.unknown()).nullish(),
  primaryKey: z8.string().nullish(),
  foreignKeys: z8.array(z8.object({
    column: z8.string(),
    referencedTable: z8.string(),
    referencedColumn: z8.string()
  })).nullish(),
  dataRequest: DataRequestSchema.nullish(),
  // Pre-computed HTTP request
  // Dynamic feature configuration (for DataTable server-side features)
  frontendFilters: z8.array(z8.record(z8.string(), z8.unknown())).nullish(),
  sorting: z8.record(z8.string(), z8.unknown()).nullish(),
  pagination: z8.record(z8.string(), z8.unknown()).nullish(),
  filtering: z8.record(z8.string(), z8.unknown()).nullish()
});
var VisibilitySettingsSchema = z8.object({
  mobile: z8.boolean().default(true),
  tablet: z8.boolean().default(true),
  desktop: z8.boolean().default(true)
});
var ViewportOverridesSchema = z8.object({
  mobile: z8.record(z8.string(), z8.any()).nullable().optional(),
  tablet: z8.record(z8.string(), z8.any()).nullable().optional()
}).passthrough();
var StylesDataSchema = z8.object({
  values: z8.record(z8.string(), z8.any()).nullable().optional(),
  activeProperties: z8.array(z8.string()).nullable().optional(),
  stylingMode: z8.string().default("visual"),
  viewportOverrides: ViewportOverridesSchema.nullable().optional()
}).passthrough();
var ComponentStylesSchema = z8.record(z8.string(), z8.any()).nullable().optional();
var PageComponentSchema = z8.lazy(
  () => z8.object({
    id: z8.string(),
    type: z8.string(),
    // ComponentTypeSchema is too strict for flexibility
    props: z8.record(z8.string(), z8.unknown()).nullable().optional(),
    styles: ComponentStylesSchema,
    // Legacy: direct styles
    stylesData: StylesDataSchema.nullable().optional(),
    // New: structured styles with overrides
    visibility: VisibilitySettingsSchema.nullable().optional(),
    // Per-viewport visibility
    children: z8.array(PageComponentSchema).nullable().optional(),
    binding: ComponentBindingSchema.nullable().optional()
  })
);
var PageLayoutSchema = z8.object({
  content: z8.array(PageComponentSchema),
  root: z8.record(z8.string(), z8.unknown()).optional()
});
var SeoDataSchema = z8.object({
  title: z8.string().optional(),
  description: z8.string().optional(),
  keywords: z8.array(z8.string()).optional(),
  ogImage: z8.string().optional(),
  canonical: z8.string().optional()
});
var PublishPageSchema = z8.object({
  // Page identity (can be UUID or custom string ID like "default-homepage")
  id: z8.string().min(1),
  slug: z8.string().min(1),
  name: z8.string(),
  title: z8.string().optional(),
  description: z8.string().optional(),
  // Layout & structure
  layoutData: PageLayoutSchema,
  // SEO
  seoData: SeoDataSchema.nullable().optional(),
  // Datasources (non-sensitive config only)
  datasources: z8.array(DatasourceConfigSchema).nullable().optional(),
  // CSS Bundle (tree-shaken, component-specific CSS from FastAPI)
  cssBundle: z8.string().nullable().optional(),
  // Versioning
  version: z8.number().int().min(1),
  publishedAt: z8.string().datetime(),
  // Flags
  isPublic: z8.boolean().default(true),
  isHomepage: z8.boolean().default(false)
});
var ImportPageRequestSchema = z8.object({
  page: PublishPageSchema,
  // Optional: force overwrite even if version is same
  force: z8.boolean().default(false)
});
var ImportPageResponseSchema = z8.object({
  success: z8.boolean(),
  slug: z8.string(),
  version: z8.number(),
  previewUrl: z8.string(),
  message: z8.string().optional()
});
var ErrorResponseSchema3 = z8.object({
  success: z8.literal(false),
  error: z8.string(),
  details: z8.record(z8.string(), z8.unknown()).optional()
});

// src/routes/import.ts
var importRoute = new Hono();
importRoute.post("/", async (c) => {
  try {
    const rawBody = await c.req.json();
    console.log("[Import] Received raw body keys:", Object.keys(rawBody));
    console.log("[Import] Page keys:", rawBody.page ? Object.keys(rawBody.page) : "NO PAGE");
    const validationResult = ImportPageRequestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      console.error("[Import] Zod Validation Failed!");
      console.error("[Import] Errors:", JSON.stringify(validationResult.error.issues, null, 2));
      for (const issue of validationResult.error.issues) {
        console.error(`[Import] Field: ${issue.path.join(".")} - ${issue.message}`);
        let value = rawBody;
        for (const key of issue.path) {
          value = value?.[key];
        }
        console.error(`[Import] Actual value: ${JSON.stringify(value)?.slice(0, 200)}`);
      }
      return c.json({
        success: false,
        error: "Validation failed",
        details: validationResult.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message
        }))
      }, 400);
    }
    const { page, force } = validationResult.data;
    console.log(`[Import] Validated page: ${page.slug} (v${page.version})`);
    if (!force) {
      const existing = await getPublishedPageBySlug(page.slug);
      if (existing && existing.version >= page.version) {
        return c.json({
          success: false,
          error: "Version conflict",
          details: {
            existingVersion: existing.version,
            newVersion: page.version,
            message: "Use force=true to overwrite"
          }
        }, 400);
      }
    }
    const result = await upsertPublishedPage(page);
    const publicUrl = process.env.PUBLIC_URL;
    let previewUrl;
    const pageUrlPath = page.isHomepage ? "" : page.slug;
    console.log(`[Import] Building preview URL - PUBLIC_URL env: "${publicUrl}", isHomepage: ${page.isHomepage}`);
    if (publicUrl) {
      previewUrl = `${publicUrl.replace(/\/$/, "")}/${pageUrlPath}`;
      console.log(`[Import] Using PUBLIC_URL: ${previewUrl}`);
    } else {
      const host = c.req.header("host") || "localhost:3002";
      if (host.includes("edge")) {
        previewUrl = `/${pageUrlPath}`;
        console.log(`[Import] Internal host detected (${host}), returning relative path: ${previewUrl}`);
      } else {
        const protocol = c.req.header("x-forwarded-proto") || "http";
        previewUrl = `${protocol}://${host}/${pageUrlPath}`;
        console.log(`[Import] Using request headers fallback: ${previewUrl}`);
      }
    }
    return c.json({
      success: true,
      slug: page.slug,
      version: result.version,
      previewUrl,
      message: `Page "${page.name}" published successfully`
    }, 200);
  } catch (error) {
    console.error("[Import] Error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});
importRoute.delete("/:slug", async (c) => {
  try {
    const slug = c.req.param("slug");
    if (!slug) {
      return c.json({
        success: false,
        error: "Missing slug parameter"
      }, 400);
    }
    console.log(`[Import] Unpublishing page: ${slug}`);
    const existing = await getPublishedPageBySlug(slug);
    if (!existing) {
      console.log(`[Import] Page not found in SSR: ${slug}`);
      return c.json({
        success: true,
        message: `Page "${slug}" was not published`
      }, 200);
    }
    await deletePublishedPage(slug);
    console.log(`[Import] Successfully unpublished: ${slug}`);
    return c.json({
      success: true,
      slug,
      message: `Page "${slug}" unpublished successfully`
    }, 200);
  } catch (error) {
    console.error("[Import] Unpublish error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});
importRoute.post("/settings", async (c) => {
  try {
    const body = await c.req.json();
    console.log("[Import Settings] Received:", Object.keys(body));
    await updateProjectSettings({
      faviconUrl: body.faviconUrl || null,
      logoUrl: body.logoUrl || null,
      siteName: body.siteName || body.name || null,
      siteDescription: body.siteDescription || body.description || null,
      appUrl: body.appUrl || null
    });
    return c.json({
      success: true,
      message: "Project settings synced successfully"
    }, 200);
  } catch (error) {
    console.error("[Import Settings] Error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});
importRoute.get("/settings", async (c) => {
  try {
    const settings = await getProjectSettings();
    return c.json({
      success: true,
      settings
    }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});
importRoute.get("/status", async (c) => {
  return c.json({
    status: "ok",
    ready: true
  });
});
initPagesDb().catch(console.error);
initProjectSettingsDb().catch(console.error);

// src/routes/data.ts
import { Hono as Hono2 } from "hono";

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
      const response = await fetch(url, {
        headers: {
          "apikey": this.anonKey,
          "Authorization": `Bearer ${this.anonKey}`,
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
      const { createClient: createClient4 } = await import("@libsql/client");
      const client2 = createClient4({
        url: this.url,
        authToken: this.authToken
      });
      const result = await client2.execute(sql);
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

// src/cache/redis.ts
import { Redis as UpstashRedis } from "@upstash/redis";
var UpstashAdapter = class {
  client;
  constructor(url, token) {
    this.client = new UpstashRedis({ url, token });
  }
  async get(key) {
    return this.client.get(key);
  }
  async set(key, value) {
    return this.client.set(key, value);
  }
  async setex(key, seconds, value) {
    return this.client.setex(key, seconds, value);
  }
  async del(...keys) {
    return this.client.del(...keys);
  }
  async keys(pattern) {
    return this.client.keys(pattern);
  }
  async ping() {
    return this.client.ping();
  }
  async lpush(key, ...elements) {
    return this.client.lpush(key, ...elements);
  }
  async rpop(key) {
    return this.client.rpop(key);
  }
  async llen(key) {
    return this.client.llen(key);
  }
  async incr(key) {
    return this.client.incr(key);
  }
  async expire(key, seconds) {
    return this.client.expire(key, seconds);
  }
};
var IoRedisAdapter = class {
  client;
  initialized;
  constructor(url) {
    this.initialized = this.initClient(url);
  }
  async initClient(url) {
    try {
      const { default: IORedis } = await import("ioredis");
      this.client = new IORedis(url);
    } catch (error) {
      console.error("Failed to load ioredis. Ensure you are running in a Node.js environment for TCP connections.", error);
      throw error;
    }
  }
  async ensureClient() {
    await this.initialized;
    if (!this.client) throw new Error("Redis client not initialized");
  }
  async get(key) {
    await this.ensureClient();
    const value = await this.client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  async set(key, value) {
    await this.ensureClient();
    return this.client.set(key, value);
  }
  async setex(key, seconds, value) {
    await this.ensureClient();
    return this.client.setex(key, seconds, value);
  }
  async del(...keys) {
    await this.ensureClient();
    return this.client.del(...keys);
  }
  async keys(pattern) {
    await this.ensureClient();
    return this.client.keys(pattern);
  }
  async ping() {
    await this.ensureClient();
    return this.client.ping();
  }
  async lpush(key, ...elements) {
    await this.ensureClient();
    return this.client.lpush(key, ...elements);
  }
  async rpop(key) {
    await this.ensureClient();
    return this.client.rpop(key);
  }
  async llen(key) {
    await this.ensureClient();
    return this.client.llen(key);
  }
  async incr(key) {
    await this.ensureClient();
    return this.client.incr(key);
  }
  async expire(key, seconds) {
    await this.ensureClient();
    return this.client.expire(key, seconds);
  }
};
var redisInstance = null;
function initRedis(config) {
  if (config.url.startsWith("http")) {
    if (!config.token) {
      throw new Error("Redis Token is required for Upstash HTTP connection");
    }
    redisInstance = new UpstashAdapter(config.url, config.token);
  } else {
    redisInstance = new IoRedisAdapter(config.url);
  }
  return redisInstance;
}
function getRedis() {
  if (!redisInstance) {
    throw new Error("Redis not initialized. Call initRedis() first.");
  }
  return redisInstance;
}
async function cached(key, fn, ttlSeconds = 60) {
  const redis = getRedis();
  const cachedValue = await redis.get(key);
  if (cachedValue !== null) {
    return cachedValue;
  }
  const result = await fn();
  await redis.setex(key, ttlSeconds, JSON.stringify(result));
  return result;
}
async function invalidate(key) {
  const redis = getRedis();
  await redis.del(key);
}
async function invalidatePattern(pattern) {
  const redis = getRedis();
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
async function testConnection() {
  try {
    const redis = getRedis();
    await redis.ping();
    return { success: true, message: "Redis connection successful" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed"
    };
  }
}

// src/routes/data.ts
var dataRoute = new Hono2();
var cachedDatasource = null;
function resolveEnvVars(template) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return process.env[key] || "";
  });
}
function getByPath(obj, path2) {
  if (!path2) return obj;
  const parts = path2.replace(/\[(\d+)\]/g, ".$1").split(".");
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
async function executeDataRequest(dataRequest) {
  const url = resolveEnvVars(dataRequest.url);
  const headers = {};
  for (const [key, value] of Object.entries(dataRequest.headers || {})) {
    headers[key] = resolveEnvVars(value);
  }
  console.log(`[Data Execute] Fetching: ${url.substring(0, 100)}...`);
  const cacheKey = `data:${url}:${dataRequest.body ? JSON.stringify(dataRequest.body) : ""}`;
  const cacheTTL = 60;
  try {
    const redis = getRedis();
    return await cached(cacheKey, async () => {
      return await executeDataRequestUncached(dataRequest, url, headers);
    }, cacheTTL);
  } catch (e) {
    if (e.message?.includes("not initialized")) {
    } else {
      console.warn("[Data Execute] Redis cache error, falling back to direct fetch:", e);
    }
  }
  return await executeDataRequestUncached(dataRequest, url, headers);
}
async function executeDataRequestUncached(dataRequest, url, headers) {
  const fetchOptions = {
    method: dataRequest.method || "GET",
    headers
  };
  if (dataRequest.body && dataRequest.method === "POST") {
    fetchOptions.body = JSON.stringify(dataRequest.body);
    const filters = dataRequest.body.filters;
    if (Array.isArray(filters) && filters.length > 0) {
      console.log(`[Data Execute] Filters:`, JSON.stringify(dataRequest.body.filters));
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
async function getDefaultDatasource2() {
  if (cachedDatasource) return cachedDatasource;
  try {
    const pages = await listPublishedPages();
    if (pages.length > 0) {
      const page = await getPublishedPageBySlug(pages[0].slug);
      if (page?.datasources && page.datasources.length > 0) {
        cachedDatasource = page.datasources[0];
        console.log(`[Data API] Using datasource: ${cachedDatasource.name} (${cachedDatasource.type})`);
        return cachedDatasource;
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
    const datasource = await getDefaultDatasource2();
    const result = await handleDataQuery(table, {
      columns,
      limit,
      offset,
      orderBy
    }, datasource || void 0);
    if (result.error) {
      console.error(`[Data API] Error:`, result.error);
      return c.json({
        success: false,
        error: result.error
      }, 500);
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
    const datasource = await getDefaultDatasource2();
    const result = await handleDataQuery(table, {
      filters: { id },
      limit: 1
    }, datasource || void 0);
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
    if (!dataRequest || !dataRequest.url) {
      return c.json({
        success: false,
        error: "Invalid dataRequest: missing url"
      }, 400);
    }
    console.log(`[Data Execute] Processing request for: ${dataRequest.url.substring(0, 80)}...`);
    const { data, total } = await executeDataRequest(dataRequest);
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
  return c.json({ success: true, message: "Cache cleared" });
});

// src/routes/storage.ts
import { OpenAPIHono as OpenAPIHono7, createRoute as createRoute7, z as z10 } from "@hono/zod-openapi";

// src/storage/supabase_provider.ts
import { createClient as createClient3 } from "@supabase/supabase-js";
var SupabaseStorage = class {
  client;
  bucket;
  datasourceName;
  constructor(config) {
    const url = config.supabaseUrl || config.url;
    const key = config.supabaseKey || config.key;
    this.client = createClient3(url, key);
    this.bucket = config.bucket || "uploads";
    this.datasourceName = config.datasourceName || "Supabase";
    console.log("[SUPABASE.TS] Class instance created, datasourceName:", this.datasourceName);
  }
  /**
   * Upload a file to Supabase Storage
   */
  async upload(path2, file, options) {
    const targetBucket = options?.bucket || this.bucket;
    const { data, error } = await this.client.storage.from(targetBucket).upload(path2, file, {
      contentType: options?.contentType,
      upsert: options?.upsert ?? false
    });
    if (error) {
      const err = error;
      let msg = error.message;
      if (!msg || msg === "{}") {
        if (err.originalError && typeof err.originalError.status === "number") {
          const status = err.originalError.status;
          const statusText = err.originalError.statusText || "";
          const statusMessages = {
            400: "Bad request - the file may already exist or be invalid",
            401: "Authentication failed - please check your credentials",
            403: "Permission denied - you do not have access to this bucket",
            404: "Bucket or path not found",
            409: "The resource already exists",
            413: "File too large",
            429: "Too many requests - please try again later"
          };
          msg = statusMessages[status] || `Upload failed: ${status} ${statusText}`.trim();
        } else {
          msg = err.error_description || err.error || err.code || err.statusText || "Unknown upload error";
        }
      }
      throw new Error(msg);
    }
    return {
      path: data.path,
      publicUrl: this.getPublicUrl(data.path, targetBucket)
    };
  }
  /**
   * Download a file from Supabase Storage
   */
  async download(path2, bucket) {
    const targetBucket = bucket || this.bucket;
    const { data, error } = await this.client.storage.from(targetBucket).download(path2);
    if (error) {
      throw new Error(`Storage download failed: ${error.message}`);
    }
    return data;
  }
  /**
   * Delete a file or folder (recursively) from Supabase Storage
   */
  async delete(paths, options) {
    const pathArray = Array.isArray(paths) ? paths : [paths];
    const targetBucket = options?.bucket || this.bucket;
    let allPathsToDelete = [];
    for (const path2 of pathArray) {
      const descendants = await this.listAllDescendants(targetBucket, path2);
      allPathsToDelete.push(...descendants);
      allPathsToDelete.push(path2);
    }
    allPathsToDelete = [...new Set(allPathsToDelete)];
    if (allPathsToDelete.length === 0) return;
    const chunkSize = 50;
    for (let i = 0; i < allPathsToDelete.length; i += chunkSize) {
      const chunk = allPathsToDelete.slice(i, i + chunkSize);
      const { error } = await this.client.storage.from(targetBucket).remove(chunk);
      if (error) {
        console.error("Supabase delete error details:", JSON.stringify(error, null, 2));
        const err = error;
        const msg = err.message || err.error_description || err.error || JSON.stringify(error);
        throw new Error(`Storage delete failed: ${msg}`);
      }
    }
  }
  /**
   * Recursively list all files under a path
   */
  async listAllDescendants(bucket, prefix) {
    const { data, error } = await this.client.storage.from(bucket).list(prefix);
    if (error || !data) return [];
    let paths = [];
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      paths.push(fullPath);
      if (!item.metadata) {
        const children = await this.listAllDescendants(bucket, fullPath);
        paths.push(...children);
      }
    }
    return paths;
  }
  /**
   * Calculate total size of a folder recursively
   */
  async getFolderSize(bucket, prefix) {
    const { data, error } = await this.client.storage.from(bucket).list(prefix);
    if (error || !data) return 0;
    let totalSize = 0;
    const folderPromises = [];
    for (const item of data) {
      if (item.name === ".folder") continue;
      if (item.metadata) {
        totalSize += item.metadata.size || 0;
      } else {
        const folderPath = prefix ? `${prefix}/${item.name}` : item.name;
        folderPromises.push(this.getFolderSize(bucket, folderPath));
      }
    }
    const subFolderSizes = await Promise.all(folderPromises);
    return totalSize + subFolderSizes.reduce((a, b) => a + b, 0);
  }
  /**
   * List files in a directory
   */
  async list(path2, options) {
    const targetBucket = options?.bucket || this.bucket;
    const { data, error } = await this.client.storage.from(targetBucket).list(path2 || "", {
      limit: options?.limit || 100,
      offset: options?.offset || 0,
      search: options?.search
    });
    if (error) {
      throw new Error(`Storage list failed: ${error.message}`);
    }
    const items = data.filter((file) => file.name !== ".folder");
    return Promise.all(
      items.map(async (file) => {
        const isFolder = !file.metadata;
        let size = file.metadata?.size || 0;
        if (isFolder) {
          const fullPath = path2 ? `${path2}/${file.name}` : file.name;
          size = await this.getFolderSize(targetBucket, fullPath);
        }
        return {
          name: file.name,
          id: file.id || file.name,
          size,
          updated_at: file.updated_at || file.last_accessed_at || file.created_at,
          mimetype: file.metadata?.mimetype,
          metadata: file.metadata,
          isFolder
        };
      })
    );
  }
  /**
   * Create a virtual folder (via placeholder file)
   */
  async createFolder(folderPath, bucket) {
    const placeholder = new Blob([""], { type: "application/x-directory" });
    const targetBucket = bucket || this.bucket;
    await this.upload(`${folderPath}/.folder`, placeholder, { bucket: targetBucket });
  }
  /**
   * Generate a signed URL for direct upload (presigned)
   */
  async createSignedUploadUrl(path2) {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUploadUrl(path2);
    if (error) {
      throw new Error(`Signed upload URL failed: ${error.message}`);
    }
    return data.signedUrl;
  }
  /**
   * Generate a signed URL for temporary download access
   */
  async createSignedUrl(path2, expiresIn = 3600, bucket) {
    const targetBucket = bucket || this.bucket;
    const { data, error } = await this.client.storage.from(targetBucket).createSignedUrl(path2, expiresIn);
    if (error) {
      throw new Error(`Signed URL failed: ${error.message}`);
    }
    return data.signedUrl;
  }
  /**
   * Get public URL for a file (bucket must be public)
   */
  getPublicUrl(path2, bucket) {
    const targetBucket = bucket || this.bucket;
    const { data } = this.client.storage.from(targetBucket).getPublicUrl(path2);
    return data.publicUrl;
  }
  /**
   * List all buckets with metadata and calculated total size
   */
  async listBuckets() {
    const { data, error } = await this.client.storage.listBuckets();
    if (error) {
      throw new Error(`List buckets failed: ${error.message}`);
    }
    return Promise.all(data.map(async (bucket) => {
      const size = await this.getFolderSize(bucket.name, "");
      return {
        id: bucket.id,
        name: bucket.name,
        public: bucket.public,
        created_at: bucket.created_at,
        provider: this.datasourceName,
        size
      };
    }));
  }
  /**
   * Create a new bucket
   */
  async createBucket(name, options) {
    const { data, error } = await this.client.storage.createBucket(name, {
      public: options?.public ?? false,
      fileSizeLimit: options?.file_size_limit,
      allowedMimeTypes: options?.allowed_mime_types
    });
    if (error) {
      throw new Error(`Create bucket failed: ${error.message}`);
    }
    return { id: data.name, name: data.name };
  }
  /**
   * Get a bucket
   */
  async getBucket(id) {
    const { data, error } = await this.client.storage.getBucket(id);
    if (error) {
      throw new Error(`Get bucket failed: ${error.message}`);
    }
    return {
      id: data.id,
      name: data.name,
      public: data.public
    };
  }
  /**
   * Update a bucket
   */
  async updateBucket(id, options) {
    const { data, error } = await this.client.storage.updateBucket(id, {
      public: options.public,
      fileSizeLimit: options.file_size_limit,
      allowedMimeTypes: options.allowed_mime_types
    });
    if (error) {
      throw new Error(`Update bucket failed: ${error.message}`);
    }
    return { message: data.message };
  }
  /**
   * Delete a bucket
   */
  async deleteBucket(id) {
    const { data, error } = await this.client.storage.deleteBucket(id);
    if (error) {
      console.error("Supabase deleteBucket error details:", JSON.stringify(error, null, 2));
      const errorStr = JSON.stringify(error);
      const err = error;
      let msg = err.message || err.error_description || err.error;
      if (!msg) {
        if (err.name === "StorageUnknownError" || errorStr.includes("StorageUnknownError")) {
          msg = "StorageUnknownError: Bucket likely not empty. Please empty it first.";
        } else {
          msg = errorStr;
        }
      }
      throw new Error(`Delete bucket failed: ${msg}`);
    }
    return { message: data.message };
  }
  /**
   * Empty a bucket
   */
  async emptyBucket(id) {
    const { data, error } = await this.client.storage.emptyBucket(id);
    if (error) {
      console.error("Supabase emptyBucket error:", JSON.stringify(error, null, 2));
      const err = error;
      let msg = err.message || err.error_description || err.error;
      if (!msg && err.name) {
        msg = err.name;
        if (err.name === "StorageUnknownError") {
          msg += ". Potential causes: Network issue or permission error.";
        }
      } else if (!msg) {
        msg = JSON.stringify(error);
      }
      throw new Error(`Empty bucket failed: ${msg}`);
    }
    return { message: data.message };
  }
  /**
   * Move a file (supports cross-bucket by Copy + Delete)
   */
  async move(sourceKey, destinationKey, options) {
    const sBucket = options?.sourceBucket || this.bucket;
    const dBucket = options?.destBucket || sBucket;
    if (sBucket === dBucket) {
      const { data, error } = await this.client.storage.from(sBucket).move(sourceKey, destinationKey);
      if (error) {
        throw new Error(`Move file failed: ${error.message}`);
      }
      return { message: data.message };
    } else {
      await this.copy(sourceKey, destinationKey, { sourceBucket: sBucket, destBucket: dBucket });
      await this.delete(sourceKey, { bucket: sBucket });
      return { message: "Successfully moved across buckets" };
    }
  }
  /**
   * Copy a file
   */
  async copy(sourceKey, destinationKey, options) {
    const sBucket = options?.sourceBucket || this.bucket;
    const dBucket = options?.destBucket || sBucket;
    const { data, error } = await this.client.storage.from(sBucket).copy(sourceKey, destinationKey, { destinationBucket: dBucket });
    if (error) {
      throw new Error(`Copy file failed: ${error.message}`);
    }
    return { message: "Successfully copied" };
  }
};
function createStorage(config) {
  return new SupabaseStorage(config);
}

// src/schemas/storage.ts
import { z as z9 } from "@hono/zod-openapi";
var StorageErrorSchema = z9.object({
  success: z9.literal(false),
  error: z9.string().openapi({ example: "Error message" }),
  details: z9.any().optional()
}).openapi("StorageError");
var PresignRequestSchema = z9.object({
  path: z9.string().openapi({ example: "uploads/file.png" })
}).openapi("PresignRequest");
var PresignResponseSchema = z9.object({
  success: z9.literal(true),
  signedUrl: z9.string(),
  path: z9.string()
}).openapi("PresignResponse");
var CreateFolderRequestSchema = z9.object({
  folderPath: z9.string().openapi({ example: "images" }),
  bucket: z9.string().openapi({ example: "uploads" })
}).openapi("CreateFolderRequest");
var CreateFolderResponseSchema = z9.object({
  success: z9.literal(true),
  folderPath: z9.string(),
  message: z9.string()
}).openapi("CreateFolderResponse");
var UploadRequestSchema = z9.object({
  file: z9.instanceof(File).openapi({ type: "string", format: "binary" }),
  path: z9.string().optional(),
  bucket: z9.string().optional()
}).openapi("UploadRequest");
var UploadResponseSchema = z9.object({
  success: z9.literal(true),
  path: z9.string(),
  publicUrl: z9.string()
}).openapi("UploadResponse");
var ListFilesQuerySchema = z9.object({
  bucket: z9.string().optional(),
  path: z9.string().optional(),
  limit: z9.string().optional().default("100"),
  offset: z9.string().optional().default("0"),
  search: z9.string().optional()
}).openapi("ListFilesQuery");
var ListFilesResponseSchema = z9.object({
  success: z9.literal(true),
  files: z9.array(z9.object({
    name: z9.string(),
    id: z9.string(),
    size: z9.number(),
    updated_at: z9.string().optional(),
    mimetype: z9.string().optional(),
    isFolder: z9.boolean(),
    metadata: z9.any().optional()
  }))
}).openapi("ListFilesResponse");
var DeleteRequestSchema = z9.object({
  paths: z9.union([z9.string(), z9.array(z9.string())]),
  bucket: z9.string().optional()
}).openapi("DeleteRequest");
var BucketSchema = z9.object({
  id: z9.string(),
  name: z9.string(),
  public: z9.boolean().optional(),
  created_at: z9.string().optional(),
  provider: z9.string().optional(),
  size: z9.number().optional(),
  file_size_limit: z9.number().optional(),
  allowed_mime_types: z9.array(z9.string()).optional()
}).openapi("Bucket");
var BucketResponseSchema = z9.object({
  success: z9.literal(true),
  bucket: BucketSchema
}).openapi("BucketResponse");
var ListBucketsResponseSchema = z9.object({
  success: z9.literal(true),
  buckets: z9.array(BucketSchema)
}).openapi("ListBucketsResponse");
var CreateBucketRequestSchema = z9.object({
  name: z9.string().openapi({ example: "new-bucket" }),
  public: z9.boolean().optional(),
  file_size_limit: z9.number().optional(),
  allowed_mime_types: z9.array(z9.string()).optional()
}).openapi("CreateBucketRequest");
var UpdateBucketRequestSchema = z9.object({
  public: z9.boolean(),
  file_size_limit: z9.number().optional(),
  allowed_mime_types: z9.array(z9.string()).optional()
}).openapi("UpdateBucketRequest");
var MoveRequestSchema = z9.object({
  sourceKey: z9.string(),
  destinationKey: z9.string(),
  sourceBucket: z9.string().optional(),
  destBucket: z9.string().optional()
}).openapi("MoveRequest");
var SignedUrlQuerySchema = z9.object({
  path: z9.string(),
  bucket: z9.string().optional(),
  expiresIn: z9.string().optional().default("3600")
}).openapi("SignedUrlQuery");
var SuccessResponseSchema2 = z9.object({
  success: z9.literal(true),
  message: z9.string().optional()
}).openapi("SuccessResponse");

// src/routes/storage.ts
var storageRoute = new OpenAPIHono7();
var cachedConfig = null;
var lastFetchTime = 0;
var CACHE_TTL = 60 * 1e3;
async function getStorageConfig() {
  const envUrl = process.env.SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_KEY;
  const envBucket = process.env.SUPABASE_STORAGE_BUCKET || "uploads";
  const envDatasourceName = process.env.SUPABASE_DATASOURCE_NAME || "Supabase";
  if (envUrl && envKey) {
    return { supabaseUrl: envUrl, supabaseKey: envKey, bucket: envBucket, datasourceName: envDatasourceName };
  }
  const now = Date.now();
  if (cachedConfig && now - lastFetchTime < CACHE_TTL) {
    return cachedConfig;
  }
  try {
    const fastApiUrl = process.env.FASTAPI_URL || "http://localhost:8000";
    console.log(`[Storage Config] Fetching credentials from: ${fastApiUrl}/api/project/internal/creds/`);
    const response = await fetch(`${fastApiUrl}/api/project/internal/creds/`);
    if (response.ok) {
      const data = await response.json();
      console.log(`[Storage Config] Credentials fetched: ${data.supabaseUrl ? "Yes" : "No"}`);
      if (data.supabaseUrl && (data.supabaseServiceKey || data.supabaseKey)) {
        cachedConfig = {
          supabaseUrl: data.supabaseUrl,
          supabaseKey: data.supabaseServiceKey || data.supabaseKey,
          bucket: envBucket,
          // Bucket still mainly from env or default
          datasourceName: data.datasourceName || envDatasourceName
        };
        console.log(`[Storage Config] datasourceName: ${cachedConfig.datasourceName}`);
        lastFetchTime = now;
        return cachedConfig;
      }
    }
  } catch (error) {
    console.error("Failed to fetch storage config from backend:", error);
  }
  return null;
}
var presignRoute = createRoute7({
  method: "post",
  path: "/presign",
  tags: ["Storage"],
  summary: "Get presigned upload URL",
  description: "Generates a signed URL for direct file upload to Supabase Storage.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: PresignRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Presigned URL generated",
      content: {
        "application/json": {
          schema: PresignResponseSchema
        }
      }
    },
    400: {
      description: "Storage not configured",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(presignRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  try {
    const { path: path2 } = c.req.valid("json");
    const storage = createStorage(config);
    const signedUrl = await storage.createSignedUploadUrl(path2);
    return c.json({ success: true, signedUrl, path: path2 }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Upload URL generation failed"
    }, 500);
  }
});
var createFolderRoute = createRoute7({
  method: "post",
  path: "/create-folder",
  tags: ["Storage"],
  summary: "Create a folder",
  description: "Creates a folder by uploading a .folder placeholder file to Supabase Storage.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateFolderRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Folder created",
      content: {
        "application/json": {
          schema: CreateFolderResponseSchema
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(createFolderRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  try {
    const { folderPath, bucket } = c.req.valid("json");
    const placeholderPath = folderPath.endsWith("/") ? `${folderPath}.folder` : `${folderPath}/.folder`;
    const storage = createStorage(config);
    const placeholderContent = new Blob([""], { type: "text/plain" });
    await storage.upload(placeholderPath, placeholderContent, { bucket, upsert: true });
    return c.json({ success: true, folderPath, message: "Folder created" }, 200);
  } catch (error) {
    console.error("Create folder error:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Create folder failed"
    }, 500);
  }
});
var uploadRoute = createRoute7({
  method: "post",
  path: "/upload",
  tags: ["Storage"],
  summary: "Direct file upload",
  description: "Uploads a file directly (limited to 5MB, use presigned URL for larger files).",
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: UploadRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "File uploaded",
      content: {
        "application/json": {
          schema: UploadResponseSchema
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    413: {
      description: "File too large",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(uploadRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  try {
    const formData = await c.req.formData();
    const file = formData.get("file");
    const customPath = formData.get("path");
    if (!file) {
      return c.json({ success: false, error: "No file provided" }, 400);
    }
    if (file.size > 5 * 1024 * 1024) {
      return c.json({
        success: false,
        error: "File too large. Use presigned URL for files over 5MB."
      }, 413);
    }
    const path2 = customPath || `uploads/${Date.now()}-${file.name}`;
    const bucket = formData.get("bucket");
    console.log("[Storage Upload] bucket from formData:", bucket, "path:", path2);
    const storage = createStorage(config);
    const result = await storage.upload(path2, file, {
      contentType: file.type,
      bucket: bucket || void 0
    });
    return c.json({
      success: true,
      path: result.path,
      publicUrl: result.publicUrl || ""
    }, 200);
  } catch (error) {
    console.error("Upload Error:", error);
    let errorMessage = "Upload failed";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "string") {
      errorMessage = error;
    } else if (error && typeof error === "object") {
      errorMessage = error.message || JSON.stringify(error);
    }
    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
});
var listFilesRoute = createRoute7({
  method: "get",
  path: "/list",
  tags: ["Storage"],
  summary: "List files",
  description: "Lists files and folders in a specified path within a bucket.",
  request: {
    query: ListFilesQuerySchema
  },
  responses: {
    200: {
      description: "File list retrieved",
      content: {
        "application/json": {
          schema: ListFilesResponseSchema
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(listFilesRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  const { bucket: queryBucket, path: queryPath, limit: queryLimit, offset: queryOffset, search } = c.req.valid("query");
  const bucket = queryBucket || config.bucket;
  const path2 = queryPath || "";
  const limit = parseInt(queryLimit);
  const offset = parseInt(queryOffset);
  const storage = createStorage(config);
  try {
    const files = await storage.list(path2, { limit, offset, bucket, search });
    return c.json({ success: true, files }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "List failed"
    }, 500);
  }
});
var deleteFileRoute = createRoute7({
  method: "delete",
  path: "/delete",
  tags: ["Storage"],
  summary: "Delete files",
  description: "Deletes one or more files from a bucket.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: DeleteRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Files deleted",
      content: {
        "application/json": {
          schema: SuccessResponseSchema2
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(deleteFileRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  try {
    const { paths, bucket } = c.req.valid("json");
    const storage = createStorage(config);
    await storage.delete(paths, { bucket });
    return c.json({ success: true }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Delete failed"
    }, 500);
  }
});
var listBucketsRoute = createRoute7({
  method: "get",
  path: "/buckets",
  tags: ["Storage"],
  summary: "List buckets",
  description: "Lists all available storage buckets.",
  responses: {
    200: {
      description: "Bucket list retrieved",
      content: {
        "application/json": {
          schema: ListBucketsResponseSchema
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(listBucketsRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  const storage = createStorage(config);
  try {
    const buckets = await storage.listBuckets();
    return c.json({ success: true, buckets }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "List buckets failed"
    }, 500);
  }
});
var createBucketRoute = createRoute7({
  method: "post",
  path: "/buckets",
  tags: ["Storage"],
  summary: "Create a bucket",
  description: "Creates a new storage bucket in Supabase.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateBucketRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Bucket created",
      content: {
        "application/json": {
          schema: BucketResponseSchema
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(createBucketRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  try {
    const { name, public: isPublic, file_size_limit, allowed_mime_types } = c.req.valid("json");
    const storage = createStorage(config);
    const bucket = await storage.createBucket(name, {
      public: isPublic,
      file_size_limit,
      allowed_mime_types
    });
    return c.json({ success: true, bucket }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Create bucket failed"
    }, 500);
  }
});
var getBucketRoute = createRoute7({
  method: "get",
  path: "/buckets/{id}",
  tags: ["Storage"],
  summary: "Get bucket details",
  description: "Retrieves details for a specific storage bucket.",
  request: {
    params: z10.object({
      id: z10.string().openapi({ example: "my-bucket" })
    })
  },
  responses: {
    200: {
      description: "Bucket details retrieved",
      content: {
        "application/json": {
          schema: BucketResponseSchema
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    404: {
      description: "Bucket not found",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(getBucketRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  const id = c.req.param("id");
  const storage = createStorage(config);
  try {
    const bucket = await storage.getBucket(id);
    return c.json({ success: true, bucket }, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Get bucket failed";
    if (errorMessage.includes("not found") || errorMessage.includes("does not exist")) {
      return c.json({ success: false, error: "Bucket not found" }, 404);
    }
    return c.json({ success: false, error: errorMessage }, 500);
  }
});
var updateBucketRoute = createRoute7({
  method: "put",
  path: "/buckets/{id}",
  tags: ["Storage"],
  summary: "Update a bucket",
  description: "Updates settings for an existing storage bucket.",
  request: {
    params: z10.object({
      id: z10.string()
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateBucketRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Bucket updated",
      content: {
        "application/json": {
          schema: SuccessResponseSchema2
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(updateBucketRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  const id = c.req.param("id");
  const storage = createStorage(config);
  try {
    const { public: isPublic, file_size_limit, allowed_mime_types } = c.req.valid("json");
    const result = await storage.updateBucket(id, {
      public: isPublic,
      file_size_limit,
      allowed_mime_types
    });
    return c.json({ success: true, message: result.message }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Update bucket failed"
    }, 500);
  }
});
var deleteBucketRoute = createRoute7({
  method: "delete",
  path: "/buckets/{id}",
  tags: ["Storage"],
  summary: "Delete a bucket",
  description: "Deletes a storage bucket. The bucket must be empty.",
  request: {
    params: z10.object({
      id: z10.string()
    })
  },
  responses: {
    200: {
      description: "Bucket deleted",
      content: {
        "application/json": {
          schema: SuccessResponseSchema2
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(deleteBucketRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  const id = c.req.param("id");
  const storage = createStorage(config);
  try {
    const result = await storage.deleteBucket(id);
    return c.json({ success: true, message: result.message }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Delete bucket failed"
    }, 500);
  }
});
var emptyBucketRoute = createRoute7({
  method: "post",
  path: "/buckets/{id}/empty",
  tags: ["Storage"],
  summary: "Empty a bucket",
  description: "Deletes all files within a storage bucket.",
  request: {
    params: z10.object({
      id: z10.string()
    })
  },
  responses: {
    200: {
      description: "Bucket emptied",
      content: {
        "application/json": {
          schema: SuccessResponseSchema2
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(emptyBucketRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  const id = c.req.param("id");
  const storage = createStorage(config);
  try {
    const result = await storage.emptyBucket(id);
    return c.json({ success: true, message: result.message }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Empty bucket failed"
    }, 500);
  }
});
var moveFileRoute = createRoute7({
  method: "post",
  path: "/move",
  tags: ["Storage"],
  summary: "Move files",
  description: "Moves a file from one path/bucket to another.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: MoveRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "File moved",
      content: {
        "application/json": {
          schema: SuccessResponseSchema2
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(moveFileRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  try {
    const { sourceKey, destinationKey, sourceBucket, destBucket } = c.req.valid("json");
    const storage = createStorage(config);
    const result = await storage.move(sourceKey, destinationKey, { sourceBucket, destBucket });
    return c.json({ success: true, message: result.message }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Move file failed"
    }, 500);
  }
});
var copyFileRoute = createRoute7({
  method: "post",
  path: "/copy",
  tags: ["Storage"],
  summary: "Copy files",
  description: "Copies a file from one path/bucket to another.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: MoveRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "File copied",
      content: {
        "application/json": {
          schema: SuccessResponseSchema2
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(copyFileRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  try {
    const { sourceKey, destinationKey, sourceBucket, destBucket } = c.req.valid("json");
    const storage = createStorage(config);
    const result = await storage.copy(sourceKey, destinationKey, { sourceBucket, destBucket });
    return c.json({ success: true, message: result.message }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Copy file failed"
    }, 500);
  }
});
var getSignedUrlRoute = createRoute7({
  method: "get",
  path: "/signed-url",
  tags: ["Storage"],
  summary: "Get signed download URL",
  description: "Generates a signed URL for temporary access to a private file.",
  request: {
    query: SignedUrlQuerySchema
  },
  responses: {
    200: {
      description: "Signed URL generated",
      content: {
        "application/json": {
          schema: PresignResponseSchema
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: StorageErrorSchema
        }
      }
    }
  }
});
storageRoute.openapi(getSignedUrlRoute, async (c) => {
  const config = await getStorageConfig();
  if (!config) {
    return c.json({ success: false, error: "Storage not configured" }, 400);
  }
  const { path: path2, bucket, expiresIn: queryExpiresIn } = c.req.valid("query");
  const expiresIn = parseInt(queryExpiresIn);
  if (!path2) {
    return c.json({ success: false, error: "Path is required" }, 400);
  }
  const storage = createStorage(config);
  try {
    const signedUrl = await storage.createSignedUrl(path2, expiresIn, bucket);
    return c.json({ success: true, signedUrl, path: path2 }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Signed URL generation failed"
    }, 500);
  }
});

// src/routes/cache.ts
import { OpenAPIHono as OpenAPIHono8, createRoute as createRoute8, z as z11 } from "@hono/zod-openapi";
var cacheRoute = new OpenAPIHono8();
function isRedisInitialized() {
  try {
    getRedis();
    return true;
  } catch {
    return false;
  }
}
function ensureRedisInitialized() {
  if (isRedisInitialized()) {
    return true;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return false;
  }
  try {
    initRedis({ url, token });
    return true;
  } catch {
    return false;
  }
}
var CacheStatusSchema = z11.object({
  success: z11.boolean(),
  message: z11.string()
});
var CacheStatsSchema = z11.object({
  success: z11.boolean(),
  configured: z11.boolean(),
  connected: z11.boolean().optional(),
  message: z11.string()
});
var InvalidateRequestSchema = z11.object({
  key: z11.string().optional().openapi({ description: "Single cache key to invalidate" }),
  pattern: z11.string().optional().openapi({ description: "Glob pattern to match multiple keys" })
});
var InvalidateResponseSchema = z11.object({
  success: z11.boolean(),
  message: z11.string()
});
var testRoute = createRoute8({
  method: "get",
  path: "/test",
  tags: ["Cache"],
  summary: "Test Redis connection",
  description: "Tests the Redis connection and returns the status.",
  responses: {
    200: {
      description: "Connection test result",
      content: {
        "application/json": {
          schema: CacheStatusSchema
        }
      }
    }
  }
});
cacheRoute.openapi(testRoute, async (c) => {
  if (!ensureRedisInitialized()) {
    return c.json({ success: false, message: "Redis not configured" }, 200);
  }
  const result = await testConnection();
  return c.json(result, 200);
});
var invalidateRoute = createRoute8({
  method: "post",
  path: "/invalidate",
  tags: ["Cache"],
  summary: "Invalidate cache entries",
  description: "Invalidates a single cache key or all keys matching a pattern.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: InvalidateRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Invalidation result",
      content: {
        "application/json": {
          schema: InvalidateResponseSchema
        }
      }
    },
    400: {
      description: "Bad request",
      content: {
        "application/json": {
          schema: InvalidateResponseSchema
        }
      }
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: InvalidateResponseSchema
        }
      }
    }
  }
});
cacheRoute.openapi(invalidateRoute, async (c) => {
  if (!ensureRedisInitialized()) {
    return c.json({ success: false, message: "Redis not configured" }, 400);
  }
  try {
    const { key, pattern } = c.req.valid("json");
    if (key) {
      await invalidate(key);
      return c.json({ success: true, message: `Invalidated key: ${key}` }, 200);
    } else if (pattern) {
      await invalidatePattern(pattern);
      return c.json({ success: true, message: `Invalidated pattern: ${pattern}` }, 200);
    } else {
      return c.json({ success: false, message: "Provide key or pattern" }, 400);
    }
  } catch (error) {
    return c.json({
      success: false,
      message: error instanceof Error ? error.message : "Invalidation failed"
    }, 500);
  }
});
var statsRoute = createRoute8({
  method: "get",
  path: "/stats",
  tags: ["Cache"],
  summary: "Get cache status",
  description: "Returns the current cache configuration and connection status.",
  responses: {
    200: {
      description: "Cache status",
      content: {
        "application/json": {
          schema: CacheStatsSchema
        }
      }
    }
  }
});
cacheRoute.openapi(statsRoute, async (c) => {
  const configured = ensureRedisInitialized();
  if (!configured) {
    return c.json({
      success: true,
      configured: false,
      message: "Redis not configured. Configure via Settings > Cache & Performance."
    }, 200);
  }
  const connectionResult = await testConnection();
  return c.json({
    success: true,
    configured: true,
    connected: connectionResult.success,
    message: connectionResult.message
  }, 200);
});

// src/startup/sync.ts
var FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";
var MAX_RETRIES = 5;
var RETRY_DELAY_MS = 3e3;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function syncRedisSettingsFromFastAPI() {
  try {
    const response = await fetch(`${FASTAPI_URL}/api/sync/settings/redis/`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(5e3)
    });
    if (!response.ok) {
      console.warn(`[Startup Sync] Redis settings fetch failed: ${response.status}`);
      return { status: "error", retry: response.status >= 500 };
    }
    const settings = await response.json();
    if (settings.redis_enabled && settings.redis_url && settings.redis_token) {
      initRedis({ url: settings.redis_url, token: settings.redis_token });
      console.log("[Startup Sync] \u2705 Redis initialized from settings");
      return { status: "success" };
    } else {
      console.log("[Startup Sync] \u2139\uFE0F Redis not enabled or not configured in Settings UI");
      return { status: "not-configured" };
    }
  } catch (error) {
    const isConnectionError = error?.cause?.code === "ECONNREFUSED";
    if (isConnectionError) {
      console.warn("[Startup Sync] \u23F3 FastAPI not ready yet, will retry...");
    } else {
      console.warn("[Startup Sync] Redis settings sync failed:", error.message);
    }
    return { status: "error", retry: true };
  }
}
async function syncHomepageFromFastAPI() {
  try {
    const response = await fetch(`${FASTAPI_URL}/api/pages/homepage/`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(5e3)
      // 5s timeout
    });
    if (!response.ok) {
      if (response.status === 404) {
        console.log("[Startup Sync] No homepage configured in FastAPI yet");
        return false;
      }
      console.warn(`[Startup Sync] FastAPI returned ${response.status}`);
      return false;
    }
    const result = await response.json();
    const pageData = result.data;
    if (!pageData) {
      console.warn("[Startup Sync] No page data in response");
      return false;
    }
    const publishData = {
      id: pageData.id,
      slug: pageData.slug,
      name: pageData.name,
      title: pageData.title || void 0,
      description: pageData.description || void 0,
      layoutData: pageData.layoutData,
      seoData: pageData.seoData || void 0,
      datasources: pageData.datasources || void 0,
      version: 1,
      publishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      isPublic: pageData.isPublic ?? true,
      isHomepage: true
    };
    await upsertPublishedPage(publishData);
    console.log(`[Startup Sync] \u2705 Homepage synced: ${pageData.slug}`);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      console.warn("[Startup Sync] FastAPI request timed out");
    } else {
      console.warn("[Startup Sync] Failed to fetch homepage:", error);
    }
    return false;
  }
}
async function runStartupSync() {
  console.log("[Startup Sync] \u{1F680} Starting homepage + Redis sync...");
  await initPagesDb();
  console.log("[Startup Sync] Syncing Redis settings...");
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await syncRedisSettingsFromFastAPI();
    if (result.status === "success") {
      break;
    }
    if (result.status === "not-configured") {
      break;
    }
    if (result.status === "error" && result.retry && attempt < MAX_RETRIES) {
      console.log(`[Startup Sync] Attempt ${attempt}/${MAX_RETRIES}, retrying in ${RETRY_DELAY_MS / 1e3}s...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
  const existingHomepage = await getHomepage();
  if (existingHomepage) {
    console.log(`[Startup Sync] Homepage already exists: ${existingHomepage.slug} (v${existingHomepage.version})`);
    return;
  }
  console.log("[Startup Sync] No local homepage, syncing from FastAPI...");
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Startup Sync] Attempt ${attempt}/${MAX_RETRIES}...`);
    const success = await syncHomepageFromFastAPI();
    if (success) {
      return;
    }
    if (attempt < MAX_RETRIES) {
      console.log(`[Startup Sync] Waiting ${RETRY_DELAY_MS / 1e3}s before retry...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
  console.warn("[Startup Sync] \u26A0\uFE0F Could not sync homepage after all retries. Homepage will be pull-published on first request.");
}

// src/middleware/auth.ts
import { bearerAuth } from "hono/bearer-auth";
import { jwt } from "hono/jwt";
import { csrf } from "hono/csrf";
var apiKeyAuth = bearerAuth({
  verifyToken: async (token, c) => {
    const validKeys = (process.env.API_KEYS || "").split(",").filter((k) => k.trim());
    if (validKeys.length === 0) {
      console.warn("\u26A0\uFE0F No API_KEYS configured - webhook auth disabled");
      return true;
    }
    return validKeys.includes(token.trim());
  }
});
var csrfProtection = csrf({
  origin: (origin, c) => {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(",");
    return allowedOrigins.includes(origin);
  }
});

// src/index.ts
var app = new OpenAPIHono9({
  defaultHook: (result, c) => {
    if (!result.success) {
      console.error("[Zod Validation Error] Request body validation failed:");
      console.error(JSON.stringify(result.error.issues, null, 2));
      return c.json({
        success: false,
        error: "Validation failed",
        details: result.error.issues
      }, 400);
    }
  }
});
app.onError((err, c) => {
  console.error("[Global Error]", err);
  if (err.name === "ZodError" || err.issues) {
    console.error("[Zod Validation Error] Details:");
    console.error(JSON.stringify(err.issues || err, null, 2));
    return c.json({
      success: false,
      error: "Validation failed",
      details: err.issues || err.message
    }, 400);
  }
  return c.json({
    success: false,
    error: err.message || "Internal server error"
  }, 500);
});
app.use("*", requestId());
app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", compress());
app.use("*", timeout(29e3));
app.use("*", bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/*", cors({
  origin: ["http://localhost:5173", "http://localhost:8000"],
  credentials: true
}));
app.use("*", cors({
  origin: ["http://localhost:5173", "http://localhost:8000"],
  credentials: true
}));
app.use("/api/webhook/*", apiKeyAuth);
app.doc("/api/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Frontbase Edge Engine API",
    version: "0.1.0",
    description: "Edge runtime API for SSR pages, workflows, and triggers."
  },
  servers: [
    { url: "http://localhost:3002", description: "Local development" }
  ]
});
app.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }));
app.route("/api/health", healthRoute);
app.route("/api/deploy", deployRoute);
app.route("/api/execute", executeRoute);
app.route("/api/webhook", webhookRoute);
app.route("/api/executions", executionsRoute);
app.route("/api/import", importRoute);
app.route("/api/data", dataRoute);
app.use("/api/storage/upload", bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.route("/api/storage", storageRoute);
app.route("/api/cache", cacheRoute);
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var publicPath = path.resolve(__dirname, "../public");
app.use("/static/*", serveStatic({
  root: publicPath,
  rewriteRequestPath: (p) => p.replace(/^\/static/, "")
}));
app.route("", pagesRoute);
var port = parseInt(process.env.PORT || "3002");
serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`\u{1F680} Edge Engine running on http://localhost:${info.port}`);
  console.log(`\u{1F4CD} PUBLIC_URL: ${process.env.PUBLIC_URL || "(not set - using request headers)"}`);
  runStartupSync().catch((err) => {
    console.error("[Startup Sync] Error:", err);
  });
});
var index_default = app;
export {
  index_default as default
};
