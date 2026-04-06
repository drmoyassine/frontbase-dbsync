import {
  SupabaseAuthProvider
} from "./chunk-R2ERTRIO.js";
import {
  edgeLogsTable,
  ensureInitialized,
  getStateProvider,
  stateProvider
} from "./chunk-J7G2UYPF.js";
import {
  shouldDebounce
} from "./chunk-ESNN5VK7.js";
import {
  cacheProvider
} from "./chunk-C5H4IGGO.js";
import {
  getAgentProfilesConfig,
  getApiKeysConfig,
  getAuthConfig,
  getCacheConfig,
  getGpuModels,
  getQueueConfig,
  getStateDbConfig,
  init_env,
  overrideApiKeysConfig,
  overrideCacheConfig,
  overrideQueueConfig
} from "./chunk-YLQ7CKVG.js";
import {
  cached,
  getRedis,
  initRedis,
  init_redis,
  invalidate,
  invalidatePattern,
  rateLimit,
  testConnection
} from "./chunk-2T6KJ3IO.js";
import {
  handleDataQuery
} from "./chunk-Z42UIXOU.js";
import {
  __require
} from "./chunk-KFQGP6VL.js";

// src/index.ts
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { compress } from "hono/compress";
import path from "path";
import { fileURLToPath } from "url";

// src/engine/lite.ts
import { OpenAPIHono as OpenAPIHono15 } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";
import { timeout } from "hono/timeout";
import { bodyLimit } from "hono/body-limit";
import { etag } from "hono/etag";
import { timing } from "hono/timing";
import { Liquid } from "liquidjs";

// src/routes/health.ts
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

// src/adapters/shared.ts
var _platform = "docker";
function getPlatform() {
  return _platform;
}

// src/routes/health.ts
var startedAt = Date.now();
var healthRoute = new OpenAPIHono();
var PING_TIMEOUT_MS = 8e3;
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}
async function checkStateDb() {
  const { getStateDbConfig: getStateDbConfig2 } = await import("./env-IFXQKGIA.js");
  const cfg = getStateDbConfig2();
  if (cfg.provider === "local" && !cfg.url) {
    return { provider: "none", status: "not_configured" };
  }
  const result = {
    provider: cfg.provider || "auto",
    status: "ok"
  };
  if (cfg.schema) result.schema = cfg.schema;
  try {
    const { stateProvider: stateProvider2 } = await import("./storage-5TVM5HGK.js");
    await withTimeout(stateProvider2.listPages(), PING_TIMEOUT_MS);
    result.status = "ok";
  } catch (e) {
    result.status = "error";
    result.error = (e?.message || String(e)).slice(0, 120);
  }
  return result;
}
async function checkCache() {
  const { getCacheConfig: getCacheConfig2 } = await import("./env-IFXQKGIA.js");
  const cfg = getCacheConfig2();
  if (cfg.provider === "none" && !cfg.url) {
    return { provider: "none", status: "not_configured" };
  }
  try {
    const { cacheProvider: cacheProvider2 } = await import("./cache-VJNABVJY.js");
    await withTimeout(cacheProvider2.get("__health_check__"), PING_TIMEOUT_MS);
    return { provider: cfg.provider || "redis", status: "ok" };
  } catch (e) {
    return {
      provider: cfg.provider || "redis",
      status: "error",
      error: (e?.message || String(e)).slice(0, 120)
    };
  }
}
async function checkQueue() {
  const { getQueueConfig: getQueueConfig3 } = await import("./env-IFXQKGIA.js");
  const cfg = getQueueConfig3();
  if (cfg.provider === "none" && !cfg.token && !cfg.url) {
    return { provider: "none", status: "not_configured" };
  }
  return { provider: cfg.provider || "qstash", status: "ok" };
}
var bindingSchema = z.object({
  provider: z.string(),
  status: z.enum(["ok", "error", "not_configured"]),
  error: z.string().optional(),
  schema: z.string().optional()
});
var route = createRoute({
  method: "get",
  path: "/",
  tags: ["System"],
  summary: "Health check",
  description: "Returns service health status, version, provider info, and binding health",
  responses: {
    200: {
      description: "Service is healthy",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string(),
            service: z.string(),
            version: z.string(),
            provider: z.string(),
            uptime_seconds: z.number().optional(),
            timestamp: z.string(),
            bindings: z.object({
              stateDb: bindingSchema,
              cache: bindingSchema,
              queue: bindingSchema
            })
          })
        }
      }
    }
  }
});
healthRoute.openapi(route, async (c) => {
  const systemKey = process.env.FRONTBASE_SYSTEM_KEY;
  const provided = c.req.header("x-system-key");
  const isAuthenticated = !systemKey || provided === systemKey;
  if (!isAuthenticated) {
    return c.json({
      status: "ok",
      service: "frontbase-edge",
      version: "0.1.0",
      provider: getPlatform(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      bindings: {
        stateDb: { provider: "hidden", status: "ok" },
        cache: { provider: "hidden", status: "ok" },
        queue: { provider: "hidden", status: "ok" }
      }
    });
  }
  const platform = getPlatform();
  const isServerless = platform !== "docker";
  const [stateDb, cache, queue] = await Promise.all([
    checkStateDb(),
    checkCache(),
    checkQueue()
  ]);
  return c.json({
    status: "ok",
    service: "frontbase-edge",
    version: "0.1.0",
    provider: platform,
    ...isServerless ? {} : { uptime_seconds: Math.floor((Date.now() - startedAt) / 1e3) },
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    bindings: { stateDb, cache, queue }
  });
});

// src/routes/manifest.ts
import { OpenAPIHono as OpenAPIHono2 } from "@hono/zod-openapi";

// src/routes/ai.ts
init_env();
var _aiBinding = null;
function getAIBinding() {
  return _aiBinding;
}
var _gpuModels = [];
function getGPUModels() {
  if (_gpuModels.length === 0) {
    try {
      const envModels = getGpuModels();
      if (Array.isArray(envModels) && envModels.length > 0) {
        _gpuModels = envModels.map((m) => ({
          slug: m.slug,
          model_id: m.modelId || m.model_id,
          model_type: m.modelType || m.model_type,
          provider: m.provider,
          provider_config: m.providerConfig || m.provider_config
        }));
        console.log(`[AI] Auto-loaded ${_gpuModels.length} GPU model(s) from env:`, _gpuModels.map((m) => m.slug).join(", "));
      }
    } catch (e) {
      console.error("[AI] Failed to load GPU models from env:", e);
    }
  }
  return _gpuModels;
}

// src/routes/manifest.ts
init_env();
var manifestRoute = new OpenAPIHono2();
function getAdapterType() {
  const platform = process.env.FRONTBASE_ADAPTER_PLATFORM || "docker";
  if (platform.endsWith("-lite")) return "lite";
  return "full";
}
function getCapabilities() {
  const caps = ["workflows"];
  const adapterType = getAdapterType();
  if (adapterType === "full") caps.push("ssr");
  if (getGPUModels().length > 0) caps.push("ai");
  return caps;
}
function getBindings() {
  const bindings = {};
  const dbCfg = getStateDbConfig();
  if (dbCfg.provider && dbCfg.provider !== "local") {
    bindings.db = dbCfg.provider;
  } else if (dbCfg.url) {
    bindings.db = "custom";
  } else {
    bindings.db = "none";
  }
  const cacheCfg = getCacheConfig();
  bindings.cache = cacheCfg.provider !== "none" ? cacheCfg.provider : "none";
  const queueCfg = getQueueConfig();
  bindings.queue = queueCfg.provider !== "none" ? queueCfg.provider : "none";
  return bindings;
}
manifestRoute.get("/", (c) => {
  const gpuModels = getGPUModels();
  return c.json({
    engine_name: process.env.FRONTBASE_ENGINE_NAME || "frontbase-edge",
    frontbase_version: "0.1.0",
    adapter_type: getAdapterType(),
    platform: process.env.FRONTBASE_ADAPTER_PLATFORM || "docker",
    deployed_at: process.env.FRONTBASE_DEPLOYED_AT || null,
    bundle_checksum: process.env.FRONTBASE_BUNDLE_CHECKSUM || null,
    capabilities: getCapabilities(),
    tech_stack: {
      runtime: process.env.FRONTBASE_ADAPTER_PLATFORM === "cloudflare" || process.env.FRONTBASE_ADAPTER_PLATFORM === "cloudflare-lite" ? "Cloudflare Workers" : "Node.js",
      framework: "Hono",
      orm: "Drizzle ORM",
      templating: "LiquidJS",
      validation: "Zod + OpenAPI 3.1"
    },
    gpu_models: gpuModels.map((m) => ({
      slug: m.slug,
      model_id: m.model_id,
      model_type: m.model_type,
      provider: m.provider
    })),
    bindings: getBindings()
  });
});

// src/routes/deploy.ts
import { OpenAPIHono as OpenAPIHono3, createRoute as createRoute2, z as z3 } from "@hono/zod-openapi";

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
  value: z2.any().optional().nullable(),
  description: z2.string().optional().nullable(),
  required: z2.boolean().optional().nullable()
}).passthrough().openapi("Parameter");
var WorkflowNodeSchema = z2.object({
  id: z2.string(),
  // ReactFlow uses 'type' at root level
  type: z2.string(),
  position: NodePositionSchema,
  // ReactFlow wraps node data in 'data' object
  data: z2.object({
    label: z2.string().optional().nullable(),
    type: z2.string().optional().nullable(),
    inputs: z2.array(ParameterSchema).optional().nullable(),
    outputs: z2.array(ParameterSchema).optional().nullable()
  }).passthrough().optional().nullable(),
  // Legacy format: direct properties (for backward compatibility)
  name: z2.string().optional().nullable(),
  inputs: z2.array(ParameterSchema).optional().nullable(),
  outputs: z2.array(ParameterSchema).optional().nullable(),
  error: z2.string().optional().nullable()
}).passthrough().openapi("WorkflowNode");
var WorkflowEdgeSchema = z2.object({
  id: z2.string().optional(),
  // ReactFlow adds id
  source: z2.string(),
  target: z2.string(),
  // ReactFlow uses sourceHandle/targetHandle
  sourceHandle: z2.string().nullable().optional(),
  targetHandle: z2.string().nullable().optional(),
  // Legacy format
  sourceOutput: z2.string().optional(),
  targetInput: z2.string().optional()
}).passthrough().openapi("WorkflowEdge");
var WorkflowSchema = z2.object({
  id: z2.string().uuid(),
  name: z2.string().min(1).max(255),
  description: z2.string().optional(),
  triggerType: z2.string().openapi({ description: "Trigger type(s), comma-separated for multi-trigger" }),
  triggerConfig: z2.record(z2.any()).optional().nullable(),
  nodes: z2.array(WorkflowNodeSchema),
  edges: z2.array(WorkflowEdgeSchema),
  version: z2.number().int().positive().optional().nullable(),
  isActive: z2.boolean().optional().nullable()
}).openapi("Workflow");
var DeployWorkflowSchema = z2.object({
  id: z2.string().uuid(),
  name: z2.string().min(1),
  description: z2.string().optional().nullable(),
  triggerType: z2.string().openapi({ description: "Trigger type(s), comma-separated for multi-trigger" }),
  triggerConfig: z2.record(z2.any()).optional().nullable(),
  nodes: z2.array(WorkflowNodeSchema),
  edges: z2.array(WorkflowEdgeSchema),
  isActive: z2.boolean().optional(),
  publishedBy: z2.string().optional().nullable()
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
var deployRoute = new OpenAPIHono3();
var route2 = createRoute2({
  method: "post",
  path: "/",
  tags: ["Workflows"],
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
    const workflow = {
      id: body.id,
      name: body.name,
      description: body.description || null,
      triggerType: body.triggerType,
      triggerConfig: JSON.stringify(body.triggerConfig || {}),
      nodes: JSON.stringify(body.nodes),
      edges: JSON.stringify(body.edges),
      settings: body.settings ? JSON.stringify(body.settings) : null,
      version: 1,
      isActive: body.isActive ?? true,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      publishedBy: body.publishedBy || null
    };
    const { version } = await stateProvider.upsertWorkflow(workflow);
    return c.json({
      success: true,
      message: version > 1 ? "Workflow updated successfully" : "Workflow deployed successfully",
      workflowId: body.id,
      version
    }, 200);
  } catch (error) {
    return c.json({
      error: "DeploymentError",
      message: error.message || "Failed to deploy workflow",
      details: error
    }, 400);
  }
});

// src/routes/execute.ts
import { OpenAPIHono as OpenAPIHono4, createRoute as createRoute3, z as z4 } from "@hono/zod-openapi";
import { v4 as uuidv4 } from "uuid";

// src/engine/checkpoint.ts
var CHECKPOINT_TTL = 3600;
function checkpointKey(executionId) {
  return `exec:${executionId}:checkpoint`;
}
async function saveCheckpoint(cp) {
  try {
    await cacheProvider.setex(
      checkpointKey(cp.executionId),
      CHECKPOINT_TTL,
      JSON.stringify(cp)
    );
  } catch {
  }
}
async function loadCheckpoint(executionId) {
  try {
    const data = await cacheProvider.get(checkpointKey(executionId));
    if (!data) return null;
    if (typeof data === "string") return JSON.parse(data);
    return data;
  } catch {
    return null;
  }
}
async function clearCheckpoint(executionId) {
  try {
    await cacheProvider.del(checkpointKey(executionId));
  } catch {
  }
}

// src/engine/logger.ts
function createWorkflowLogger(level = "all", prefix = "[Workflow]") {
  return {
    info: (msg, ...args) => {
      if (level === "all") console.log(prefix, msg, ...args);
    },
    error: (msg, ...args) => {
      if (level !== "none") console.error(prefix, msg, ...args);
    },
    warn: (msg, ...args) => {
      if (level !== "none") console.warn(prefix, msg, ...args);
    }
  };
}

// src/engine/node-executors.ts
async function executeNode(node, inputs, context) {
  switch (node.type) {
    case "trigger":
    case "manual_trigger":
      return { ...inputs };
    case "data_request":
      return await executeDataRequest(node, inputs);
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
    case "http_response": {
      const nodeInputs = node.inputs || [];
      const getVal = (name) => {
        const inp = nodeInputs.find((i) => i.name === name);
        return inp?.value !== void 0 ? inp.value : inputs[name];
      };
      return {
        statusCode: getVal("statusCode") || 200,
        body: getVal("body") ?? inputs,
        headers: getVal("headers"),
        contentType: getVal("contentType") || "application/json"
      };
    }
    default:
      console.warn(`Unknown node type: ${node.type}`);
      return { ...inputs };
  }
}
async function executeDataRequest(node, inputs) {
  const BACKEND_URL2 = process.env.BACKEND_URL || "http://localhost:8000";
  const nodeData = node.data || {};
  const nodeInputs = nodeData.inputs || node.inputs || [];
  const getInputValue = (name) => {
    if (Array.isArray(nodeInputs)) {
      const input = nodeInputs.find((i) => i.name === name);
      if (input?.value !== void 0) return input.value;
    }
    if (nodeData[name] !== void 0) return nodeData[name];
    return inputs[name];
  };
  const dataSource = getInputValue("dataSource");
  const table = getInputValue("table");
  const operation = getInputValue("operation") || "select";
  const selectFields = getInputValue("selectFields") || [];
  const whereConditions = getInputValue("whereConditions") || [];
  const limit = getInputValue("limit") || 100;
  const returnData = getInputValue("returnData") !== false;
  console.log(`[Data Request] table=${table}, operation=${operation}`);
  if (!table) {
    return {
      success: false,
      error: "Table is required",
      data: [],
      rowCount: 0
    };
  }
  try {
    let selectParam = "*";
    if (Array.isArray(selectFields) && selectFields.length > 0) {
      selectParam = selectFields.map((f) => f.key || f.name || f).filter(Boolean).join(",") || "*";
    }
    const queryUrl = new URL(`${BACKEND_URL2}/api/database/table-data/${table}/`);
    queryUrl.searchParams.set("limit", String(limit));
    queryUrl.searchParams.set("select", selectParam);
    queryUrl.searchParams.set("mode", "builder");
    if (Array.isArray(whereConditions) && whereConditions.length > 0) {
      whereConditions.forEach((condition) => {
        if (condition.key && condition.value !== void 0) {
          queryUrl.searchParams.set(`filter_${condition.key}`, String(condition.value));
        }
      });
    }
    console.log(`[Data Request] Fetching: ${queryUrl.toString()}`);
    const response = await fetch(queryUrl.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Data Request] Error: ${response.status} - ${errorText}`);
      return {
        success: false,
        error: `Query failed: ${response.status} - ${errorText}`,
        data: [],
        rowCount: 0
      };
    }
    const result = await response.json();
    const data = returnData ? result.data || result.rows || [] : [];
    const total = result.total || data.length;
    console.log(`[Data Request] Success: ${data.length} rows (total: ${total})`);
    return {
      success: true,
      data,
      rowCount: data.length,
      total
    };
  } catch (error) {
    console.error(`[Data Request] Error:`, error);
    return {
      success: false,
      error: error.message || "Query execution failed",
      data: [],
      rowCount: 0
    };
  }
}
async function executeHttpRequest(node, inputs) {
  const nodeInputs = node.inputs || [];
  const url = inputs.url || nodeInputs.find((i) => i.name === "url")?.value;
  const method = inputs.method || nodeInputs.find((i) => i.name === "method")?.value || "GET";
  const headers = inputs.headers || nodeInputs.find((i) => i.name === "headers")?.value || {};
  const body = inputs.body || nodeInputs.find((i) => i.name === "body")?.value;
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
  const expression = (node.inputs || []).find((i) => i.name === "expression")?.value;
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
  const condition = (node.inputs || []).find((i) => i.name === "condition")?.value;
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
async function updateExecutionStatus(executionId, status, nodeExecutions, stateProvider2) {
  await stateProvider2.updateExecution(executionId, {
    status,
    nodeExecutions: JSON.stringify(nodeExecutions)
  });
}

// src/engine/runtime.ts
async function executeWorkflow(executionId, workflow, inputParameters, settings) {
  const s = settings || (workflow.settings ? JSON.parse(workflow.settings) : {});
  const timeoutMs = s.execution_timeout_ms || 3e4;
  const cooldownMs = s.cooldown_ms || 0;
  const tz = s.timezone || "UTC";
  const log = createWorkflowLogger(s.log_level || "all", `[Workflow:${executionId.slice(0, 8)}]`);
  const formatTime = () => {
    try {
      return (/* @__PURE__ */ new Date()).toLocaleString("sv-SE", { timeZone: tz }).replace(" ", "T");
    } catch {
      return (/* @__PURE__ */ new Date()).toISOString();
    }
  };
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
  async function coreExecute() {
    try {
      const checkpoint = await loadCheckpoint(executionId);
      const executed = /* @__PURE__ */ new Set();
      if (checkpoint) {
        log.info(`Resuming from checkpoint (${checkpoint.completedNodes.length} nodes done)`);
        for (const nodeId of checkpoint.completedNodes) {
          executed.add(nodeId);
        }
        Object.assign(context.nodeOutputs, checkpoint.nodeOutputs);
        context.nodeExecutions = checkpoint.nodeExecutions;
      }
      await updateExecutionStatus(executionId, "executing", context.nodeExecutions, stateProvider);
      const targetNodeIds = new Set(edges.map((e) => e.target));
      const startNodes = nodes.filter((n) => !targetNodeIds.has(n.id));
      const queue = [...startNodes.map((n) => n.id)];
      while (queue.length > 0) {
        const nodeId = queue.shift();
        if (executed.has(nodeId)) {
          const outgoingEdges = edges.filter((e) => e.source === nodeId);
          for (const edge of outgoingEdges) {
            if (!executed.has(edge.target)) {
              queue.push(edge.target);
            }
          }
          continue;
        }
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
          if (edge.targetInput && edge.sourceOutput) {
            inputs[edge.targetInput] = sourceOutputs[edge.sourceOutput];
          }
        }
        if (startNodes.some((n) => n.id === nodeId)) {
          Object.assign(inputs, context.parameters);
        }
        try {
          updateNodeStatus(context, nodeId, "executing");
          const outputs = await executeNode(node, inputs, context);
          context.nodeOutputs[nodeId] = outputs;
          updateNodeStatus(context, nodeId, "completed", outputs);
          executed.add(nodeId);
          log.info(`Node ${node.type || nodeId} completed`);
          await saveCheckpoint({
            executionId,
            workflowId: workflow.id,
            completedNodes: Array.from(executed),
            nodeOutputs: context.nodeOutputs,
            nodeExecutions: context.nodeExecutions
          });
          const outgoingEdges = edges.filter((e) => e.source === nodeId);
          for (const edge of outgoingEdges) {
            if (!executed.has(edge.target)) {
              queue.push(edge.target);
            }
          }
        } catch (error) {
          updateNodeStatus(context, nodeId, "error", void 0, error.message);
          log.error(`Node ${node?.type || nodeId} failed: ${error.message}`);
          throw error;
        }
      }
      const sourceNodeIds = new Set(edges.map((e) => e.source));
      const endNodes = nodes.filter((n) => !sourceNodeIds.has(n.id));
      const result = {};
      for (const node of endNodes) {
        result[node.id] = context.nodeOutputs[node.id];
      }
      const responseNode = endNodes.find((n) => n.type === "http_response");
      let httpResponse = void 0;
      if (responseNode && context.nodeOutputs[responseNode.id]) {
        const out = context.nodeOutputs[responseNode.id];
        httpResponse = {
          statusCode: out.statusCode || 200,
          body: out.body,
          headers: out.headers,
          contentType: out.contentType || "application/json"
        };
      }
      await stateProvider.updateExecution(executionId, {
        status: "completed",
        nodeExecutions: JSON.stringify(context.nodeExecutions),
        result: JSON.stringify(result),
        endedAt: formatTime()
      });
      await clearCheckpoint(executionId);
      if (cooldownMs > 0) {
        try {
          const cooldownSec = Math.ceil(cooldownMs / 1e3);
          await cacheProvider.setex(`wf:${workflow.id}:cooldown`, cooldownSec, "1");
        } catch {
        }
      }
      log.info(`Execution completed (${executed.size} nodes)`);
      return { status: "completed", result, httpResponse };
    } catch (error) {
      if (s.dlq_enabled) {
        try {
          await stateProvider.createDeadLetter?.({
            id: crypto.randomUUID?.() || executionId + "-dlq",
            workflowId: workflow.id,
            executionId,
            error: error.message,
            payload: JSON.stringify(inputParameters)
          });
        } catch {
        }
      }
      await stateProvider.updateExecution(executionId, {
        status: "error",
        nodeExecutions: JSON.stringify(context.nodeExecutions),
        error: error.message,
        endedAt: formatTime()
      });
      log.error(`Execution failed: ${error.message}`);
      return { status: "error", result: {}, error: error.message };
    }
  }
  const timeoutPromise = new Promise(
    (_, reject) => setTimeout(() => reject(new Error(
      `Execution timed out after ${timeoutMs}ms`
    )), timeoutMs)
  );
  return Promise.race([coreExecute(), timeoutPromise]);
}
async function executeSingleNode(executionId, workflow, targetNodeId, inputParameters) {
  const nodes = JSON.parse(workflow.nodes);
  const edges = JSON.parse(workflow.edges);
  const targetNode = nodes.find((n) => n.id === targetNodeId);
  if (!targetNode) {
    throw new Error(`Node ${targetNodeId} not found in workflow`);
  }
  const context = {
    executionId,
    workflowId: workflow.id,
    parameters: inputParameters,
    nodeOutputs: {},
    nodeExecutions: []
  };
  try {
    await updateExecutionStatus(executionId, "executing", context.nodeExecutions, stateProvider);
    const upstreamNodes = getUpstreamNodes(targetNodeId, nodes, edges);
    const nodesToExecute = [...upstreamNodes, targetNodeId];
    context.nodeExecutions = nodesToExecute.map((nodeId) => ({
      nodeId,
      status: "idle"
    }));
    const executed = /* @__PURE__ */ new Set();
    const queue = [...nodesToExecute];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (executed.has(nodeId)) continue;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      const incomingEdges = edges.filter((e) => e.target === nodeId);
      const dependenciesMet = incomingEdges.every(
        (e) => !nodesToExecute.includes(e.source) || executed.has(e.source)
      );
      if (!dependenciesMet) {
        queue.push(nodeId);
        continue;
      }
      const inputs = {};
      for (const edge of incomingEdges) {
        const sourceOutputs = context.nodeOutputs[edge.source] || {};
        if (edge.targetInput && edge.sourceOutput) {
          inputs[edge.targetInput] = sourceOutputs[edge.sourceOutput];
        }
      }
      const allTargetNodeIds = new Set(edges.map((e) => e.target));
      if (!allTargetNodeIds.has(nodeId)) {
        Object.assign(inputs, context.parameters);
      }
      try {
        updateNodeStatus(context, nodeId, "executing");
        await updateExecutionStatus(executionId, "executing", context.nodeExecutions, stateProvider);
        const outputs = await executeNode(node, inputs, context);
        context.nodeOutputs[nodeId] = outputs;
        updateNodeStatus(context, nodeId, "completed", outputs);
        executed.add(nodeId);
      } catch (error) {
        updateNodeStatus(context, nodeId, "error", void 0, error.message);
        throw error;
      }
    }
    const result = {
      [targetNodeId]: context.nodeOutputs[targetNodeId]
    };
    await stateProvider.updateExecution(executionId, {
      status: "completed",
      nodeExecutions: JSON.stringify(context.nodeExecutions),
      result: JSON.stringify(result),
      endedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (error) {
    await stateProvider.updateExecution(executionId, {
      status: "error",
      nodeExecutions: JSON.stringify(context.nodeExecutions),
      error: error.message,
      endedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
}
function getUpstreamNodes(targetNodeId, nodes, edges) {
  const upstream = [];
  const visited = /* @__PURE__ */ new Set();
  const queue = [targetNodeId];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    const incomingEdges = edges.filter((e) => e.target === nodeId);
    for (const edge of incomingEdges) {
      if (!visited.has(edge.source)) {
        upstream.push(edge.source);
        queue.push(edge.source);
      }
    }
  }
  return upstream;
}

// src/routes/execute.ts
init_redis();

// src/engine/queue.ts
init_env();
var queueClient = null;
var queueInitialized = false;
function getQueueProvider() {
  return getQueueConfig().provider || "none";
}
function getQueueClient() {
  if (queueInitialized) return queueClient;
  queueInitialized = true;
  const cfg = getQueueConfig();
  const token = cfg.token;
  const provider = cfg.provider || "none";
  if (!token && provider !== "cloudflare" && provider !== "cloudflare_queues") {
    console.log("\u2B1C Queue: not configured (no token in FRONTBASE_QUEUE)");
    return null;
  }
  if (provider === "qstash") {
    try {
      const { Client: Client2 } = __require("@upstash/qstash");
      queueClient = new Client2({ token });
      console.log("\u{1F504} Queue: QStash durable execution enabled");
      return queueClient;
    } catch {
      console.warn("\u26A0\uFE0F Queue: @upstash/qstash not installed, durable execution disabled");
      return null;
    }
  }
  if (provider === "cloudflare" || provider === "cloudflare_queues") {
    const apiToken = cfg.cfApiToken;
    const accountId = cfg.cfAccountId;
    const queueUrl = cfg.url || "";
    const queueId = queueUrl.startsWith("cfq://") ? queueUrl.replace("cfq://", "") : queueUrl;
    if (!apiToken || !accountId || !queueId) {
      console.warn("\u26A0\uFE0F Queue: CF Queues missing cfApiToken, cfAccountId, or url in FRONTBASE_QUEUE");
      return null;
    }
    queueClient = { provider: "cloudflare", apiToken, accountId, queueId };
    console.log(`\u{1F504} Queue: CF Queues enabled (queue ${queueId.substring(0, 8)}...)`);
    return queueClient;
  }
  console.warn(`\u26A0\uFE0F Queue: unsupported provider "${provider}", durable execution disabled`);
  return null;
}
function isQueueEnabled() {
  return getQueueClient() !== null;
}
var isQStashEnabled = isQueueEnabled;
async function publishExecution(destinationUrl, payload, options) {
  const client = getQueueClient();
  if (!client) return null;
  const provider = getQueueProvider();
  if (provider === "qstash") {
    try {
      const result = await client.publishJSON({
        url: destinationUrl,
        body: payload,
        retries: options?.retries ?? 3
      });
      return result.messageId || null;
    } catch (error) {
      console.error("[Queue] Publish failed:", error.message);
      return null;
    }
  }
  if ((provider === "cloudflare" || provider === "cloudflare_queues") && client?.provider === "cloudflare") {
    try {
      const cfApi = `https://api.cloudflare.com/client/v4/accounts/${client.accountId}/queues/${client.queueId}/messages`;
      const resp = await fetch(cfApi, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${client.apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          body: JSON.stringify({ destinationUrl, payload }),
          content_type: "json"
        })
      });
      if (!resp.ok) {
        const text = await resp.text();
        console.error(`[Queue] CF Queue publish failed: ${resp.status} ${text.substring(0, 200)}`);
        return null;
      }
      const data = await resp.json();
      return data?.result?.messageId || "cf-queued";
    } catch (error) {
      console.error("[Queue] CF Queue publish failed:", error.message);
      return null;
    }
  }
  console.warn(`[Queue] Publishing not implemented for provider "${provider}"`);
  return null;
}
async function verifyQueueSignature(signature, _body) {
  if (!signature) return false;
  const provider = getQueueProvider();
  if (provider === "qstash") {
    const cfg = getQueueConfig();
    const currentKey = cfg.signingKey;
    const nextKey = cfg.nextSigningKey;
    if (!currentKey && !nextKey) {
      console.warn("[Queue] No signing keys configured, skipping verification");
      return true;
    }
    try {
      const { Receiver } = __require("@upstash/qstash");
      const receiver = new Receiver({
        currentSigningKey: currentKey || "",
        nextSigningKey: nextKey || ""
      });
      return await receiver.verify({ signature, body: _body });
    } catch {
      return false;
    }
  }
  if (provider === "cloudflare" || provider === "cloudflare_queues") {
    return true;
  }
  return false;
}

// src/engine/concurrency.ts
async function acquireConcurrency(workflowId, limit) {
  if (limit <= 0) return true;
  try {
    const key = `wf:${workflowId}:concurrency`;
    const current = await cacheProvider.incr(key);
    if (current === 1) {
      await cacheProvider.expire(key, 300);
    }
    if (current > limit) {
      await cacheProvider.decr(key);
      return false;
    }
    return true;
  } catch {
    return true;
  }
}
async function releaseConcurrency(workflowId) {
  try {
    const key = `wf:${workflowId}:concurrency`;
    await cacheProvider.decr(key);
  } catch {
  }
}

// src/routes/execute.ts
var executeRoute = new OpenAPIHono4();
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
    },
    429: {
      description: "Rate limited / concurrency exceeded / cooldown",
      content: {
        "application/json": {
          schema: ErrorResponseSchema
        }
      }
    },
    401: {
      description: "Unauthorized (invalid QStash signature)",
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
  const rawBody = await c.req.text();
  const body = rawBody ? JSON.parse(rawBody) : {};
  const qstashSignature = c.req.header("Upstash-Signature");
  if (qstashSignature) {
    const valid = await verifyQueueSignature(qstashSignature, rawBody);
    if (!valid) {
      return c.json({
        error: "Unauthorized",
        message: "Invalid QStash signature"
      }, 401);
    }
  }
  const workflow = await stateProvider.getWorkflowById(id);
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
  const settings = workflow.settings ? JSON.parse(workflow.settings) : {};
  const rateLimitEnabled = settings.rate_limit_enabled !== false;
  const rateLimitMax = settings.rate_limit_max || 60;
  const debounceSec = Math.ceil((settings.debounce_ms || 0) / 1e3);
  const cooldownMs = settings.cooldown_ms || 0;
  const concurrencyLimit = settings.concurrency_limit || 0;
  if (cooldownMs > 0) {
    try {
      const existing = await cacheProvider.get(`wf:${id}:cooldown`);
      if (existing) {
        return c.json({
          error: "CoolDown",
          message: `Workflow ${id} is cooling down. Try again later.`
        }, 429);
      }
      const timeoutSec = Math.ceil((settings.execution_timeout_ms || 3e4) / 1e3);
      await cacheProvider.setex(`wf:${id}:cooldown`, timeoutSec, "running");
    } catch {
    }
  }
  if (debounceSec > 0) {
    const { shouldDebounce: shouldDebounce2 } = await import("./debounce-DDWODTYS.js");
    const debounced = await shouldDebounce2(id, debounceSec);
    if (debounced) {
      return c.json({
        error: "Debounced",
        message: `Workflow ${id} was triggered too recently (${settings.debounce_ms}ms window)`
      }, 429);
    }
  }
  if (rateLimitEnabled) {
    try {
      const { allowed, remaining } = await rateLimit(
        `wf:${id}:rate:${Math.floor(Date.now() / 6e4)}`,
        rateLimitMax,
        60
      );
      if (!allowed) {
        return c.json({
          error: "RateLimited",
          message: `Workflow ${id} rate limit exceeded (${rateLimitMax}/min). Retry after 1 minute.`
        }, 429);
      }
      c.header("X-RateLimit-Remaining", String(remaining));
    } catch {
    }
  }
  if (concurrencyLimit > 0) {
    const acquired = await acquireConcurrency(id, concurrencyLimit);
    if (!acquired) {
      return c.json({
        error: "ConcurrencyLimitExceeded",
        message: `Workflow ${id} has reached its concurrency limit (${concurrencyLimit}). Try again later.`
      }, 429);
    }
  }
  const executionId = uuidv4();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await stateProvider.createExecution({
    id: executionId,
    workflowId: id,
    status: "started",
    triggerType: "manual",
    triggerPayload: JSON.stringify(body.parameters || {}),
    nodeExecutions: JSON.stringify([]),
    startedAt: now
  });
  executeWorkflow(executionId, workflow, body.parameters || {}, settings).catch((err) => console.error(`Execution ${executionId} failed:`, err)).finally(() => {
    if (concurrencyLimit > 0) releaseConcurrency(id);
  });
  return c.json({
    executionId,
    status: "started",
    message: "Workflow execution started"
  }, 200);
});
var singleNodeRoute = createRoute3({
  method: "post",
  path: "/:id/node/:nodeId",
  tags: ["Execution"],
  summary: "Execute a single node",
  description: "Executes a single node (and its upstream dependencies) for testing",
  request: {
    params: z4.object({
      id: z4.string().uuid().openapi({ description: "Workflow ID" }),
      nodeId: z4.string().openapi({ description: "Node ID to execute" })
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
      description: "Node execution started",
      content: {
        "application/json": {
          schema: ExecuteResponseSchema
        }
      }
    },
    404: {
      description: "Workflow or node not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});
executeRoute.openapi(singleNodeRoute, async (c) => {
  const { id, nodeId } = c.req.valid("param");
  const body = await c.req.json().catch(() => ({}));
  const workflow = await stateProvider.getWorkflowById(id);
  if (!workflow) {
    return c.json({
      error: "NotFound",
      message: `Workflow ${id} not found`
    }, 404);
  }
  const executionId = uuidv4();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await stateProvider.createExecution({
    id: executionId,
    workflowId: id,
    status: "started",
    triggerType: "node_test",
    triggerPayload: JSON.stringify({ nodeId, parameters: body.parameters || {} }),
    nodeExecutions: JSON.stringify([]),
    startedAt: now
  });
  executeSingleNode(executionId, workflow, nodeId, body.parameters || {}).catch((err) => console.error(`Node execution ${executionId} failed:`, err));
  return c.json({
    executionId,
    status: "started",
    message: `Executing node ${nodeId}`
  }, 200);
});

// src/routes/webhook.ts
import { OpenAPIHono as OpenAPIHono5, createRoute as createRoute4, z as z5 } from "@hono/zod-openapi";
import { v4 as uuidv42 } from "uuid";
init_redis();
var webhookRoute = new OpenAPIHono5();
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
    },
    429: {
      description: "Rate limited / concurrency exceeded / cooldown",
      content: {
        "application/json": {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});
webhookRoute.openapi(route4, async (c) => {
  try {
    const { id } = c.req.valid("param");
    const payload = c.req.valid("json");
    const workflow = await stateProvider.getActiveWebhookWorkflow(id);
    if (!workflow) {
      return c.json({
        error: "NotFound",
        message: `Active workflow ${id} not found`
      }, 404);
    }
    const wfNodes = JSON.parse(workflow.nodes);
    const triggerNode = wfNodes.find(
      (n) => n.type === "webhook_trigger" || n.data?.type === "webhook_trigger"
    );
    if (triggerNode) {
      const inputs = triggerNode.data?.inputs || triggerNode.inputs || [];
      const getInput = (name) => {
        const inp = inputs.find((i) => i.name === name);
        return inp?.value;
      };
      const authMode = getInput("authentication") || "none";
      if (authMode === "header") {
        const expectedName = getInput("headerName") || "X-API-Key";
        const expectedValue = getInput("headerValue");
        if (expectedValue) {
          const actual = c.req.header(expectedName);
          if (actual !== expectedValue) {
            return c.json({
              error: "Unauthorized",
              message: `Missing or invalid '${expectedName}' header`
            }, 401);
          }
        }
      } else if (authMode === "basic") {
        const expectedUser = getInput("username") || "";
        const expectedPass = getInput("password") || "";
        const authHeader = c.req.header("Authorization");
        if (!authHeader || !authHeader.startsWith("Basic ")) {
          c.header("WWW-Authenticate", 'Basic realm="Webhook"');
          return c.json({
            error: "Unauthorized",
            message: "Basic authentication required"
          }, 401);
        }
        const decoded = atob(authHeader.slice(6));
        const [user, pass] = decoded.split(":");
        if (user !== expectedUser || pass !== expectedPass) {
          return c.json({
            error: "Unauthorized",
            message: "Invalid credentials"
          }, 401);
        }
      }
    }
    const settings = workflow.settings ? JSON.parse(workflow.settings) : {};
    const rateLimitEnabled = settings.rate_limit_enabled !== false;
    const rateLimitMax = settings.rate_limit_max || 60;
    const debounceSec = Math.ceil((settings.debounce_ms || 0) / 1e3);
    const cooldownMs = settings.cooldown_ms || 0;
    const concurrencyLimit = settings.concurrency_limit || 0;
    if (cooldownMs > 0) {
      try {
        const existing = await cacheProvider.get(`wf:${id}:cooldown`);
        if (existing) {
          return c.json({
            error: "CoolDown",
            message: `Workflow ${id} is cooling down. Try again later.`
          }, 429);
        }
        const timeoutSec = Math.ceil((settings.execution_timeout_ms || 3e4) / 1e3);
        await cacheProvider.setex(`wf:${id}:cooldown`, timeoutSec, "running");
      } catch {
      }
    }
    if (rateLimitEnabled) {
      try {
        const { allowed, remaining } = await rateLimit(
          `wf:${id}:rate:${Math.floor(Date.now() / 6e4)}`,
          rateLimitMax,
          60
        );
        if (!allowed) {
          return c.json({
            error: "RateLimited",
            message: `Workflow ${id} rate limit exceeded (${rateLimitMax}/min). Retry after 1 minute.`
          }, 429);
        }
        c.header("X-RateLimit-Remaining", String(remaining));
      } catch {
      }
    }
    if (debounceSec > 0 && await shouldDebounce(id, debounceSec)) {
      return c.json({
        executionId: null,
        status: "debounced",
        message: `Execution skipped (debounced within ${settings.debounce_ms || debounceSec * 1e3}ms window)`
      }, 200);
    }
    if (concurrencyLimit > 0) {
      const acquired = await acquireConcurrency(id, concurrencyLimit);
      if (!acquired) {
        return c.json({
          error: "ConcurrencyLimitExceeded",
          message: `Workflow ${id} has reached its concurrency limit (${concurrencyLimit}). Try again later.`
        }, 429);
      }
    }
    const executionId = uuidv42();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await stateProvider.createExecution({
      id: executionId,
      workflowId: id,
      status: "started",
      triggerType: "http_webhook",
      triggerPayload: JSON.stringify(payload),
      nodeExecutions: JSON.stringify([]),
      startedAt: now
    });
    const hasResponseNode = wfNodes.some((n) => n.type === "http_response");
    if (hasResponseNode) {
      try {
        const execResult = await executeWorkflow(executionId, workflow, payload.data, settings);
        if (execResult.httpResponse) {
          const { statusCode, body, headers: respHeaders, contentType } = execResult.httpResponse;
          const responseBody = typeof body === "string" ? body : JSON.stringify(body);
          c.header("Content-Type", contentType || "application/json");
          if (respHeaders) {
            for (const [k, v] of Object.entries(respHeaders)) {
              c.header(k, v);
            }
          }
          c.status(statusCode);
          return c.body(responseBody);
        }
        return c.json({
          executionId,
          status: execResult.status,
          result: execResult.result
        }, 200);
      } catch (err) {
        return c.json({
          executionId,
          status: "error",
          error: err.message
        }, 500);
      } finally {
        if (concurrencyLimit > 0) releaseConcurrency(id);
      }
    }
    if (settings.queue_enabled && isQStashEnabled()) {
      const publicUrl = process.env.PUBLIC_URL || process.env.EDGE_URL || "";
      const destUrl = `${publicUrl}/api/execute/${id}`;
      const msgId = await publishExecution(destUrl, {
        executionId,
        workflowId: id,
        parameters: payload.data,
        triggerType: "http_webhook",
        triggerPayload: JSON.stringify(payload)
      }, {
        retries: settings.retry_count ?? 3,
        backoff: settings.retry_backoff ?? "exponential"
      });
      if (msgId) {
        if (concurrencyLimit > 0) releaseConcurrency(id);
        return c.json({
          executionId,
          status: "started",
          message: "Execution queued via QStash (durable)"
        }, 200);
      }
    }
    executeWorkflow(executionId, workflow, payload.data, settings).catch((err) => console.error(`Webhook execution ${executionId} failed:`, err)).finally(() => {
      if (concurrencyLimit > 0) releaseConcurrency(id);
    });
    return c.json({
      executionId,
      status: "started",
      message: "Webhook received, execution started"
    }, 200);
  } catch (err) {
    console.error("[Webhook Error]", err);
    return c.json({
      success: false,
      error: err.message || "Unknown webhook error",
      stack: process.env.NODE_ENV !== "production" ? err.stack : void 0
    }, 500);
  }
});

// src/routes/executions.ts
import { OpenAPIHono as OpenAPIHono6, createRoute as createRoute5, z as z6 } from "@hono/zod-openapi";
var executionsRoute = new OpenAPIHono6();
var allRoute = createRoute5({
  method: "get",
  path: "/all",
  tags: ["Execution"],
  summary: "List all executions across all workflows",
  description: "Returns recent executions with optional filters (status, date range)",
  request: {
    query: z6.object({
      limit: z6.string().optional().openapi({ description: "Max results (default 100)" }),
      status: z6.string().optional().openapi({ description: "Comma-separated statuses" }),
      workflowId: z6.string().optional().openapi({ description: "Filter by workflow ID" }),
      since: z6.string().optional().openapi({ description: "ISO date lower bound" }),
      until: z6.string().optional().openapi({ description: "ISO date upper bound" })
    })
  },
  responses: {
    200: {
      description: "All executions",
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
executionsRoute.openapi(allRoute, async (c) => {
  const q = c.req.valid("query");
  const filters = {
    limit: Math.min(parseInt(q.limit || "100"), 500),
    status: q.status ? q.status.split(",") : void 0,
    workflowId: q.workflowId || void 0,
    since: q.since || void 0,
    until: q.until || void 0
  };
  const results = await stateProvider.listAllExecutions(filters);
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
var statsRoute = createRoute5({
  method: "get",
  path: "/stats",
  tags: ["Execution"],
  summary: "Get execution counts per workflow",
  description: "Returns run counts for each workflow",
  responses: {
    200: {
      description: "Execution stats",
      content: {
        "application/json": {
          schema: z6.object({
            stats: z6.array(z6.object({
              workflowId: z6.string(),
              totalRuns: z6.number(),
              successfulRuns: z6.number(),
              failedRuns: z6.number()
            }))
          })
        }
      }
    }
  }
});
executionsRoute.openapi(statsRoute, async (c) => {
  const stats = await stateProvider.getExecutionStats();
  return c.json({ stats }, 200);
});
var getRoute = createRoute5({
  method: "get",
  path: "/:id",
  tags: ["Execution"],
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
  const execution = await stateProvider.getExecutionById(id);
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
  tags: ["Execution"],
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
  const results = await stateProvider.listExecutionsByWorkflow(workflowId, maxResults);
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

// src/routes/update.ts
import { OpenAPIHono as OpenAPIHono7, createRoute as createRoute6, z as z7 } from "@hono/zod-openapi";
var updateRoute = new OpenAPIHono7();
var route5 = createRoute6({
  method: "post",
  path: "/",
  tags: ["System"],
  summary: "Self-update the Edge Engine bundle",
  description: "Receives a new compiled bundle, writes to disk, and schedules a graceful restart.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z7.object({
            script_content: z7.string().min(1).openapi({
              description: "The compiled JS bundle content"
            }),
            source_hash: z7.string().min(1).openapi({
              description: "12-char source hash for tracking"
            }),
            version: z7.string().optional().openapi({
              description: "Optional version string"
            })
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: "Bundle written \u2014 restart scheduled",
      content: {
        "application/json": {
          schema: SuccessResponseSchema.extend({
            source_hash: z7.string(),
            restart_in_ms: z7.number()
          })
        }
      }
    },
    400: {
      description: "Invalid payload",
      content: {
        "application/json": {
          schema: ErrorResponseSchema
        }
      }
    },
    500: {
      description: "Write failed",
      content: {
        "application/json": {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});
updateRoute.openapi(route5, async (c) => {
  try {
    const { script_content, source_hash, version } = c.req.valid("json");
    const path2 = await import("path");
    const fs = await import("fs");
    const { fileURLToPath: fileURLToPath2 } = await import("url");
    const distDir = path2.resolve(process.cwd(), "dist");
    const entryFile = path2.join(distDir, "index.js");
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    const tmpFile = `${entryFile}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpFile, script_content, "utf-8");
    fs.renameSync(tmpFile, entryFile);
    const sizeKB = Math.round(script_content.length / 1024);
    console.log(`[Update] New bundle written: ${sizeKB} KB, hash=${source_hash}, version=${version || "N/A"}`);
    const restartDelayMs = 1500;
    setTimeout(() => {
      console.log("[Update] Restarting with new bundle...");
      process.exit(0);
    }, restartDelayMs);
    return c.json({
      success: true,
      message: `Bundle updated (${sizeKB} KB). Restarting in ${restartDelayMs}ms.`,
      source_hash,
      restart_in_ms: restartDelayMs
    }, 200);
  } catch (err) {
    console.error("[Update] Failed:", err);
    return c.json({
      error: "UpdateFailed",
      message: err.message || "Failed to write bundle"
    }, 500);
  }
});

// src/routes/cache.ts
init_redis();
import { OpenAPIHono as OpenAPIHono8, createRoute as createRoute7, z as z8 } from "@hono/zod-openapi";
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
  const url = process.env.FRONTBASE_CACHE_URL;
  const token = process.env.FRONTBASE_CACHE_TOKEN;
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
var CacheStatusSchema = z8.object({
  success: z8.boolean(),
  message: z8.string()
});
var CacheStatsSchema = z8.object({
  success: z8.boolean(),
  configured: z8.boolean(),
  connected: z8.boolean().optional(),
  message: z8.string()
});
var InvalidateRequestSchema = z8.object({
  key: z8.string().optional().openapi({ description: "Single cache key to invalidate" }),
  pattern: z8.string().optional().openapi({ description: "Glob pattern to match multiple keys" })
});
var InvalidateResponseSchema = z8.object({
  success: z8.boolean(),
  message: z8.string()
});
var testRoute = createRoute7({
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
var invalidateRoute = createRoute7({
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
var statsRoute2 = createRoute7({
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
cacheRoute.openapi(statsRoute2, async (c) => {
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
var flushRoute = createRoute7({
  method: "post",
  path: "/flush",
  tags: ["Cache"],
  summary: "Flush all cache entries",
  description: "Clears all cached data. Called after reconfiguration or redeployment.",
  responses: {
    200: {
      description: "Flush result",
      content: {
        "application/json": {
          schema: CacheStatusSchema
        }
      }
    }
  }
});
cacheRoute.openapi(flushRoute, async (c) => {
  if (!ensureRedisInitialized()) {
    return c.json({ success: true, message: "No cache configured, nothing to flush" }, 200);
  }
  try {
    await invalidatePattern("*");
    return c.json({ success: true, message: "All cache entries flushed" }, 200);
  } catch (error) {
    return c.json({
      success: false,
      message: error instanceof Error ? error.message : "Flush failed"
    }, 200);
  }
});

// src/routes/edge-logs.ts
import { Hono } from "hono";
import { desc, sql, and } from "drizzle-orm";
var edgeLogsRoute = new Hono();
async function getDb() {
  await ensureInitialized();
  const provider = getStateProvider();
  return provider.db || provider.getDb?.();
}
edgeLogsRoute.post("/", async (c) => {
  const body = await c.req.json();
  const logs = body?.logs;
  if (!logs || !Array.isArray(logs) || logs.length === 0) {
    return c.json({ success: false, error: "No logs provided" }, 400);
  }
  const db = await getDb();
  if (!db) {
    return c.json({ success: false, error: "State database not available" }, 503);
  }
  const values = logs.map((log) => ({
    id: crypto.randomUUID(),
    timestamp: log.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
    level: log.level || "info",
    message: log.message || "",
    source: log.source || "runtime",
    metadata: log.metadata ? JSON.stringify(log.metadata) : null
  }));
  try {
    const BATCH_SIZE = 100;
    let inserted = 0;
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, i + BATCH_SIZE);
      await db.insert(edgeLogsTable).values(batch);
      inserted += batch.length;
    }
    return c.json({ success: true, inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[EdgeLogs] Bulk insert failed:", message);
    return c.json({ success: false, error: message }, 500);
  }
});
edgeLogsRoute.get("/", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 500);
  const before = c.req.query("before");
  const level = c.req.query("level");
  const db = await getDb();
  if (!db) {
    return c.json({ logs: [], next_cursor: null, error: "State database not available" }, 503);
  }
  try {
    const conditions = [];
    if (before) {
      conditions.push(sql`${edgeLogsTable.timestamp} < ${before}`);
    }
    if (level) {
      conditions.push(sql`${edgeLogsTable.level} = ${level}`);
    }
    let query = db.select().from(edgeLogsTable);
    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
    }
    const rows = await query.orderBy(desc(edgeLogsTable.timestamp)).limit(limit + 1);
    const hasMore = rows.length > limit;
    const results = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? results[results.length - 1]?.timestamp : null;
    return c.json({
      logs: results.map((row) => ({
        id: row.id,
        timestamp: row.timestamp,
        level: row.level,
        message: row.message,
        source: row.source,
        metadata: row.metadata ? JSON.parse(row.metadata) : null
      })),
      next_cursor: nextCursor,
      total: results.length
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[EdgeLogs] Query failed:", message);
    return c.json({ logs: [], next_cursor: null, error: message }, 500);
  }
});

// src/routes/workflows.ts
import { OpenAPIHono as OpenAPIHono9, createRoute as createRoute8, z as z9 } from "@hono/zod-openapi";
var workflowsRoute = new OpenAPIHono9();
var WorkflowSummarySchema = z9.object({
  id: z9.string(),
  name: z9.string(),
  triggerType: z9.string(),
  version: z9.number(),
  isActive: z9.boolean(),
  createdAt: z9.string(),
  updatedAt: z9.string()
});
var listRoute2 = createRoute8({
  method: "get",
  path: "/",
  tags: ["Workflows"],
  summary: "List all deployed workflows",
  description: "Returns a list of all workflows deployed to this engine",
  responses: {
    200: {
      description: "Workflow list",
      content: {
        "application/json": {
          schema: z9.object({
            workflows: z9.array(WorkflowSummarySchema),
            total: z9.number()
          })
        }
      }
    }
  }
});
workflowsRoute.openapi(listRoute2, async (c) => {
  const workflows = await stateProvider.listWorkflows();
  return c.json({
    workflows: workflows.map((w) => ({
      id: w.id,
      name: w.name,
      triggerType: w.triggerType,
      version: w.version,
      isActive: w.isActive,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt
    })),
    total: workflows.length
  }, 200);
});
var getRoute2 = createRoute8({
  method: "get",
  path: "/:id",
  tags: ["Workflows"],
  summary: "Get workflow by ID",
  description: "Returns the full workflow definition including nodes and edges",
  request: {
    params: z9.object({
      id: z9.string().uuid().openapi({ description: "Workflow ID" })
    })
  },
  responses: {
    200: {
      description: "Workflow detail",
      content: {
        "application/json": {
          schema: z9.object({ workflow: z9.record(z9.unknown()) })
        }
      }
    },
    404: {
      description: "Workflow not found",
      content: {
        "application/json": { schema: ErrorResponseSchema }
      }
    }
  }
});
workflowsRoute.openapi(getRoute2, async (c) => {
  const { id } = c.req.valid("param");
  const workflow = await stateProvider.getWorkflowById(id);
  if (!workflow) {
    return c.json({ error: "NotFound", message: `Workflow ${id} not found` }, 404);
  }
  return c.json({ workflow }, 200);
});
var deleteRoute = createRoute8({
  method: "delete",
  path: "/:id",
  tags: ["Workflows"],
  summary: "Delete a workflow",
  description: "Permanently removes a workflow from this engine",
  request: {
    params: z9.object({
      id: z9.string().uuid().openapi({ description: "Workflow ID" })
    })
  },
  responses: {
    200: {
      description: "Workflow deleted",
      content: {
        "application/json": {
          schema: SuccessResponseSchema
        }
      }
    }
  }
});
workflowsRoute.openapi(deleteRoute, async (c) => {
  const { id } = c.req.valid("param");
  await stateProvider.deleteWorkflow(id);
  return c.json({ success: true, message: `Workflow ${id} deleted` }, 200);
});
var toggleRoute = createRoute8({
  method: "patch",
  path: "/:id/toggle",
  tags: ["Workflows"],
  summary: "Toggle workflow active state",
  description: "Enable or disable a workflow without deleting it",
  request: {
    params: z9.object({
      id: z9.string().uuid().openapi({ description: "Workflow ID" })
    }),
    body: {
      content: {
        "application/json": {
          schema: z9.object({
            isActive: z9.boolean().openapi({ description: "Desired active state" })
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: "Workflow toggled",
      content: {
        "application/json": {
          schema: SuccessResponseSchema.extend({
            isActive: z9.boolean()
          })
        }
      }
    }
  }
});
workflowsRoute.openapi(toggleRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { isActive } = c.req.valid("json");
  await stateProvider.toggleWorkflow(id, isActive);
  return c.json({
    success: true,
    message: `Workflow ${id} ${isActive ? "activated" : "deactivated"}`,
    isActive
  }, 200);
});

// src/routes/queue.ts
import { OpenAPIHono as OpenAPIHono10, createRoute as createRoute9, z as z10 } from "@hono/zod-openapi";
var queueRoute = new OpenAPIHono10();
function getQueueConfig2() {
  const url = process.env.FRONTBASE_QUEUE_URL;
  const token = process.env.FRONTBASE_QUEUE_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}
var statsRoute3 = createRoute9({
  method: "get",
  path: "/stats",
  tags: ["Queue"],
  summary: "Get queue stats",
  description: "Returns queue connection status and provider info",
  responses: {
    200: {
      description: "Queue stats",
      content: {
        "application/json": {
          schema: z10.object({
            configured: z10.boolean(),
            provider: z10.string().optional(),
            connected: z10.boolean().optional(),
            message: z10.string()
          })
        }
      }
    }
  }
});
queueRoute.openapi(statsRoute3, async (c) => {
  const config = getQueueConfig2();
  if (!config) {
    return c.json({
      configured: false,
      message: "No queue provider configured. Set FRONTBASE_QUEUE_URL and FRONTBASE_QUEUE_TOKEN."
    }, 200);
  }
  const isQStash = config.url.includes("qstash") || config.url.includes("upstash");
  const provider = isQStash ? "upstash-qstash" : "generic-http";
  try {
    const resp = await fetch(config.url, {
      headers: { "Authorization": `Bearer ${config.token}` }
    });
    return c.json({
      configured: true,
      provider,
      connected: resp.ok,
      message: resp.ok ? "Queue connected" : `Queue returned HTTP ${resp.status}`
    }, 200);
  } catch (err) {
    return c.json({
      configured: true,
      provider,
      connected: false,
      message: `Connection failed: ${err.message}`
    }, 200);
  }
});
var publishRoute = createRoute9({
  method: "post",
  path: "/publish",
  tags: ["Queue"],
  summary: "Publish a message to the queue",
  description: "Sends a message to the connected queue provider (QStash/CF Queue)",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z10.object({
            topic: z10.string().min(1).openapi({ description: "Queue topic/destination URL" }),
            payload: z10.record(z10.unknown()).openapi({ description: "Message body (JSON)" }),
            delay: z10.number().int().min(0).optional().openapi({
              description: "Delay in seconds before delivery (QStash only)"
            })
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: "Message published",
      content: {
        "application/json": {
          schema: SuccessResponseSchema.extend({
            messageId: z10.string().optional()
          })
        }
      }
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": { schema: ErrorResponseSchema }
      }
    },
    501: {
      description: "No queue configured",
      content: {
        "application/json": { schema: ErrorResponseSchema }
      }
    }
  }
});
queueRoute.openapi(publishRoute, async (c) => {
  const config = getQueueConfig2();
  if (!config) {
    return c.json({
      error: "NotConfigured",
      message: "No queue provider configured"
    }, 501);
  }
  const { topic, payload, delay } = c.req.valid("json");
  try {
    const headers = {
      "Authorization": `Bearer ${config.token}`,
      "Content-Type": "application/json"
    };
    if (delay && delay > 0) {
      headers["Upstash-Delay"] = `${delay}s`;
    }
    const resp = await fetch(`${config.url}/v2/publish/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const text = await resp.text();
      return c.json({
        error: "PublishFailed",
        message: `Queue returned HTTP ${resp.status}: ${text.substring(0, 200)}`
      }, 400);
    }
    const result = await resp.json();
    return c.json({
      success: true,
      message: "Message published",
      messageId: result.messageId || result.id || void 0
    }, 200);
  } catch (err) {
    return c.json({
      error: "PublishError",
      message: err.message || "Failed to publish message"
    }, 400);
  }
});

// src/routes/config.ts
import { OpenAPIHono as OpenAPIHono11, createRoute as createRoute10, z as z12 } from "@hono/zod-openapi";
init_env();

// src/engine/agent/auto-register.ts
import { tool } from "ai";
import { z as z11 } from "zod";
var _cachedTools = null;
var _cachedExcluded = [];
function invalidateAutoToolCache() {
  _cachedTools = null;
  _cachedExcluded = [];
}
function jsonSchemaToZod(schema) {
  if (!schema || typeof schema !== "object") return z11.any();
  if (schema.enum && Array.isArray(schema.enum)) {
    if (schema.enum.length === 0) return z11.string();
    if (schema.enum.every((v) => typeof v === "string")) {
      return z11.enum(schema.enum);
    }
    return z11.any();
  }
  if (schema.oneOf || schema.anyOf) {
    const variants = schema.oneOf || schema.anyOf;
    if (Array.isArray(variants) && variants.length > 0) {
      return jsonSchemaToZod(variants[0]).optional();
    }
  }
  const type = schema.type;
  switch (type) {
    case "string": {
      let s = z11.string();
      if (schema.description) s = s.describe(schema.description);
      return s;
    }
    case "number":
    case "integer": {
      let n = z11.number();
      if (schema.description) n = n.describe(schema.description);
      return n;
    }
    case "boolean": {
      let b = z11.boolean();
      if (schema.description) b = b.describe(schema.description);
      return b;
    }
    case "array": {
      const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z11.any();
      let a = z11.array(itemSchema);
      if (schema.description) a = a.describe(schema.description);
      return a;
    }
    case "object": {
      if (schema.properties && typeof schema.properties === "object") {
        const shape = {};
        const required = new Set(schema.required || []);
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          let zodProp = jsonSchemaToZod(propSchema);
          if (!required.has(key)) {
            zodProp = zodProp.optional();
          }
          shape[key] = zodProp;
        }
        return z11.object(shape);
      }
      return z11.record(z11.any());
    }
    default:
      return z11.any();
  }
}
var MAX_RESPONSE_CHARS = 4096;
function truncateResponse(data) {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  if (str.length <= MAX_RESPONSE_CHARS) return data;
  const truncated = str.slice(0, MAX_RESPONSE_CHARS);
  try {
    return { _truncated: true, _originalLength: str.length, data: JSON.parse(truncated + '"}') };
  } catch {
    return { _truncated: true, _originalLength: str.length, preview: truncated + "..." };
  }
}
async function buildAutoTools(profile) {
  const excluded = profile.excludedEndpoints || [];
  const excludedKey = excluded.sort().join(",");
  if (_cachedTools && excludedKey === _cachedExcluded.join(",")) {
    return { ..._cachedTools };
  }
  const tools = {};
  try {
    const req = new Request("http://localhost/api/openapi.json");
    const res = await liteApp.request(req);
    if (!res.ok) {
      console.warn("[AutoTools] Failed to fetch openapi.json");
      return tools;
    }
    const spec = await res.json();
    for (const [path2, methods] of Object.entries(spec.paths || {})) {
      for (const [method, operation] of Object.entries(methods)) {
        const op = operation;
        let operationId = op.operationId;
        if (!operationId) {
          operationId = `${method}_${path2.replace(/[^a-zA-Z0-9_]/g, "_")}`.replace(/_+/g, "_").replace(/^_|_$/g, "");
        }
        if (excluded.includes(operationId)) {
          continue;
        }
        const tag = op.tags && op.tags[0] ? op.tags[0].toLowerCase().replace(/\s+/g, "_") : "api";
        const toolName = `${tag}_${operationId}`;
        const reqBodySchema = op.requestBody?.content?.["application/json"]?.schema;
        const queryParams = (op.parameters || []).filter((p) => p.in === "query");
        const pathParams = (op.parameters || []).filter((p) => p.in === "path");
        const paramShape = {};
        for (const p of pathParams) {
          paramShape[p.name] = p.required ? z11.string().describe(p.description || `Path param: ${p.name}`) : z11.string().optional().describe(p.description || p.name);
        }
        for (const p of queryParams) {
          let paramZod;
          if (p.schema) {
            paramZod = jsonSchemaToZod(p.schema);
          } else {
            paramZod = z11.string();
          }
          if (p.description) paramZod = paramZod.describe(p.description);
          paramShape[p.name] = p.required ? paramZod : paramZod.optional();
        }
        if (reqBodySchema) {
          const bodyZod = jsonSchemaToZod(reqBodySchema);
          paramShape["body"] = bodyZod.describe("JSON request body");
        }
        let desc2 = op.summary || `Execute ${method.toUpperCase()} ${path2}`;
        if (op.description) desc2 += `
${op.description}`;
        try {
          tools[toolName] = tool({
            description: desc2,
            parameters: z11.object(paramShape),
            execute: async (args) => {
              let actualPath = path2;
              for (const p of pathParams) {
                if (args[p.name]) {
                  actualPath = actualPath.replace(`{${p.name}}`, encodeURIComponent(args[p.name]));
                }
              }
              const urlObj = new URL(`http://localhost${actualPath}`);
              for (const p of queryParams) {
                if (args[p.name] != null) {
                  urlObj.searchParams.append(p.name, String(args[p.name]));
                }
              }
              const init = {
                method: method.toUpperCase(),
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": profile.apiKey || ""
                }
              };
              if (reqBodySchema && args.body) {
                init.body = JSON.stringify(args.body);
              }
              const internalReq = new Request(urlObj.toString(), init);
              try {
                const result = await liteApp.request(internalReq);
                const text = await result.text();
                try {
                  return truncateResponse(JSON.parse(text));
                } catch {
                  return truncateResponse({ text });
                }
              } catch (e) {
                return { error: `Internal execution failed: ${e.message}` };
              }
            }
          });
        } catch {
        }
      }
    }
    _cachedTools = { ...tools };
    _cachedExcluded = [...excluded].sort();
  } catch (e) {
    console.error("[AutoTools] Error building tools:", e.message);
  }
  return tools;
}

// src/routes/config.ts
var configRoute = new OpenAPIHono11();
function redact(value) {
  if (!value) return null;
  if (value.length <= 16) return "***";
  return `${value.substring(0, 8)}...${value.substring(value.length - 4)}`;
}
var getConfigRoute = createRoute10({
  method: "get",
  path: "/",
  tags: ["System"],
  summary: "Get current runtime configuration",
  description: "Returns the active database, cache, and queue settings (secrets redacted)",
  responses: {
    200: {
      description: "Current config",
      content: {
        "application/json": {
          schema: z12.object({
            stateDb: z12.object({
              provider: z12.string().nullable(),
              url: z12.string().nullable()
            }),
            cache: z12.object({
              url: z12.string().nullable(),
              configured: z12.boolean()
            }),
            queue: z12.object({
              url: z12.string().nullable(),
              configured: z12.boolean()
            }),
            engineMode: z12.string().nullable()
          })
        }
      }
    }
  }
});
configRoute.openapi(getConfigRoute, async (c) => {
  const stateDb = getStateDbConfig();
  const cache = getCacheConfig();
  const queue = getQueueConfig();
  const apiKeys = getApiKeysConfig();
  return c.json({
    stateDb: {
      provider: stateDb.provider || "local-sqlite",
      url: redact(stateDb.url)
    },
    cache: {
      url: redact(cache.url),
      configured: cache.provider !== "none"
    },
    queue: {
      url: redact(queue.url),
      configured: queue.provider !== "none"
    },
    apiKeys: {
      configured: !!(apiKeys.apiKeyHashes && apiKeys.apiKeyHashes.length > 0),
      count: apiKeys.apiKeyHashes?.length ?? 0
    },
    engineMode: process.env.FRONTBASE_ADAPTER_PLATFORM || null
  }, 200);
});
var updateConfigRoute = createRoute10({
  method: "post",
  path: "/",
  tags: ["System"],
  summary: "Update runtime configuration",
  description: "Hot-swap database, cache, or queue configuration without redeploying. Updates process.env and reinitializes affected singletons.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z12.object({
            cache: z12.object({
              url: z12.string().min(1),
              token: z12.string().min(1)
            }).optional().openapi({ description: "Redis/Upstash cache credentials" }),
            queue: z12.object({
              url: z12.string().min(1),
              token: z12.string().min(1)
            }).optional().openapi({ description: "QStash/queue credentials" }),
            apiKeys: z12.object({
              systemKey: z12.string().optional(),
              apiKeyHashes: z12.array(z12.object({
                prefix: z12.string().optional(),
                hash: z12.string(),
                scope: z12.string().optional(),
                expires_at: z12.string().nullable().optional()
              })).optional()
            }).optional().openapi({ description: "API key hashes for engine access control" })
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: "Config updated",
      content: {
        "application/json": {
          schema: SuccessResponseSchema.extend({
            updated: z12.array(z12.string())
          })
        }
      }
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorResponseSchema }
      }
    }
  }
});
configRoute.openapi(updateConfigRoute, async (c) => {
  const body = c.req.valid("json");
  const updated = [];
  try {
    if (body.cache) {
      overrideCacheConfig({ provider: "upstash", url: body.cache.url, token: body.cache.token });
      try {
        const { initRedis: initRedis2 } = await import("./redis-E24KJZFG.js");
        initRedis2({ url: body.cache.url, token: body.cache.token });
        updated.push("cache");
        console.log("[Config] Cache reinitialized");
      } catch (err) {
        console.error("[Config] Cache reinit failed:", err.message);
      }
    }
    if (body.queue) {
      overrideQueueConfig({ provider: "qstash", url: body.queue.url, token: body.queue.token });
      updated.push("queue");
      console.log("[Config] Queue config updated");
    }
    if (body.apiKeys) {
      overrideApiKeysConfig(body.apiKeys);
      updated.push("apiKeys");
      console.log(`[Config] API keys updated (${body.apiKeys.apiKeyHashes?.length ?? 0} keys)`);
    }
    invalidateAutoToolCache();
    return c.json({
      success: true,
      message: updated.length > 0 ? `Updated: ${updated.join(", ")}` : "No changes applied",
      updated
    }, 200);
  } catch (err) {
    return c.json({
      error: "ConfigError",
      message: err.message || "Failed to apply config"
    }, 400);
  }
});

// src/routes/openai.ts
import { OpenAPIHono as OpenAPIHono12 } from "@hono/zod-openapi";
import {
  generateText,
  streamText,
  embedMany,
  generateImage,
  experimental_transcribe as transcribe,
  experimental_generateSpeech as generateSpeech
} from "ai";
import { createWorkersAI } from "workers-ai-provider";

// src/engine/ai-tasks.ts
var AI_TASK_TTL = 3600;
function getTaskKey(taskId) {
  return `ai:task:${taskId}`;
}
async function saveAITask(task) {
  try {
    await cacheProvider.setex(
      getTaskKey(task.id),
      AI_TASK_TTL,
      JSON.stringify(task)
    );
    return true;
  } catch {
    return false;
  }
}
async function loadAITask(taskId) {
  try {
    const data = await cacheProvider.get(getTaskKey(taskId));
    if (!data) return null;
    if (typeof data === "string") return JSON.parse(data);
    return data;
  } catch {
    return null;
  }
}
async function dispatchAITask(taskId) {
  if (!isQueueEnabled()) return false;
  const publicUrl = process.env.PUBLIC_URL || process.env.EDGE_URL || "";
  if (!publicUrl) return false;
  const destUrl = `${publicUrl}/v1/chat/completions/continue`;
  const msgId = await publishExecution(
    destUrl,
    {
      executionId: taskId,
      workflowId: "ai-task",
      // dummy required by signature 
      parameters: { taskId },
      triggerType: "ai-internal"
    },
    {
      retries: 3,
      backoff: "exponential"
    }
  );
  return msgId !== null;
}

// src/engine/agent/prompts.ts
var buildAgentSystemPrompt = (profile) => {
  let prompt = `You are a helpful AI Agent named ${profile.name} running autonomously on a Frontbase Edge Engine. `;
  if (profile.systemPrompt) {
    prompt += `

=== SYSTEM INSTRUCTIONS ===
${profile.systemPrompt}
===========================
`;
  }
  const perms = Object.keys(profile.permissions || {});
  const permittedDatasources = perms.filter((k) => k.startsWith("datasources.") && (profile.permissions[k].includes("read") || profile.permissions[k].includes("all")));
  const hasStateDb = perms.includes("stateDb") && (profile.permissions["stateDb"].includes("read") || profile.permissions["stateDb"].includes("all"));
  const hasWorkflows = perms.includes("workflows.all") && (profile.permissions["workflows.all"].includes("trigger") || profile.permissions["workflows.all"].includes("all"));
  const pagePerms = profile.permissions?.["pages.all"] || [];
  const hasPageRead = pagePerms.includes("read") || pagePerms.includes("all");
  const hasPageWrite = pagePerms.includes("write") || pagePerms.includes("all");
  const enginePerms = profile.permissions?.["engine.all"] || [];
  const hasEngine = enginePerms.includes("read") || enginePerms.includes("all");
  prompt += `

=== CAPABILITIES & AVAILABLE TOOLS ===
`;
  if (permittedDatasources.length > 0) {
    prompt += `
\u{1F4CA} **Data Access**
`;
    prompt += `- You have READ access to connected datasources: ${permittedDatasources.map((d) => d.replace("datasources.", "")).join(", ")}.
`;
    prompt += `- Use the \`queryDatasource\` tool when you need live data.
`;
  } else {
    prompt += `
\u{1F4CA} **Data Access**: None \u2014 you do not have access to any external datasources.
`;
  }
  if (hasPageRead || hasPageWrite) {
    prompt += `
\u{1F4C4} **Page Management**
`;
    if (hasPageRead) {
      prompt += `- Use \`pages_list\` to see all published pages.
`;
      prompt += `- Use \`pages_get\` to inspect a page's component tree.
`;
    }
    if (hasPageWrite) {
      prompt += `- Use \`pages_updateAndPublish\` for one-shot visible edits (recommended).
`;
      prompt += `- Use \`pages_updateComponent\` to change props without publishing.
`;
    }
    if (hasPageRead) {
      prompt += `- Use \`styles_get\` to inspect component styles.
`;
    }
    if (hasPageWrite) {
      prompt += `- Use \`styles_update\` or \`styles_batchUpdate\` for visual changes.
`;
    }
  }
  if (hasEngine) {
    prompt += `
\u2699\uFE0F **Engine Introspection**
`;
    prompt += `- Use \`engine_status\` to check health and binding status.
`;
    prompt += `- Use \`engine_config\` to see provider configuration.
`;
    prompt += `- Use \`engine_workflows\` to list deployed workflows.
`;
    prompt += `- Use \`engine_logs\` to view recent logs.
`;
  }
  if (hasStateDb) {
    prompt += `
\u{1F5C4}\uFE0F **State DB**
`;
    prompt += `- You have READ access to the Edge Engine's internal State DB (configuration and pages).
`;
  }
  if (hasWorkflows) {
    prompt += `
\u{1F527} **Workflow Automation**
`;
    prompt += `- Use \`triggerWorkflow\` to start Action Workflows by ID (generic, for any workflow).
`;
    prompt += `- Named workflow tools (e.g., \`send_welcome_email\`) are easier to use \u2014 they have typed parameters.
`;
  }
  prompt += `
\u{1F6E0}\uFE0F **Custom Tools**
`;
  prompt += `- You may also have access to user-configured tools: named workflow tools with typed parameters, or tools imported from external MCP servers.
`;
  prompt += `- These tools have descriptive names and parameter schemas \u2014 prefer them over the generic \`triggerWorkflow\` when available.
`;
  prompt += `
\u{1F50C} **API Endpoints**
`;
  prompt += `- You also have access to auto-registered tools prefixed with their API category (e.g., \`execution_*\`, \`cache_*\`, \`system_*\`). These correspond to the engine's internal API endpoints.
`;
  prompt += `
=== END CAPABILITIES ===
`;
  prompt += `
**Guidelines:**
`;
  prompt += `- Prefer curated tools (pages_*, styles_*, engine_*) over raw API tools when both are available.
`;
  prompt += `- When making visual changes, use \`pages_updateAndPublish\` for atomic edits.
`;
  prompt += `- For coordinated style changes across multiple components, use \`styles_batchUpdate\`.
`;
  prompt += `- Always verify your changes took effect by using inspection tools after modifications.
`;
  return prompt;
};

// src/engine/agent/tools.ts
import { tool as tool6 } from "ai";
import { z as z17 } from "zod";

// src/routes/data.ts
import { Hono as Hono2 } from "hono";
init_redis();
var dataRoute = new Hono2();
var cachedDatasource = null;
var _datasourcesCache = null;
function getDatasourceCredentials(datasourceId) {
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
function buildProxyRequest(datasourceId, queryConfig, body) {
  const creds = getDatasourceCredentials(datasourceId);
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
async function executeDataRequest2(dataRequest) {
  let url;
  let headers = {};
  let body = dataRequest.body;
  const isProxy = dataRequest.fetchStrategy === "proxy" && dataRequest.datasourceId;
  if (isProxy) {
    const proxyReq = buildProxyRequest(
      dataRequest.datasourceId,
      dataRequest.queryConfig || {},
      dataRequest.body
    );
    if (!proxyReq) {
      throw new Error(`Cannot resolve credentials for datasource: ${dataRequest.datasourceId}`);
    }
    url = proxyReq.url;
    headers = proxyReq.headers;
    body = proxyReq.body;
  } else {
    url = resolveEnvVars(dataRequest.url);
    for (const [key, value] of Object.entries(dataRequest.headers || {})) {
      headers[key] = resolveEnvVars(value);
    }
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
async function getDefaultDatasource() {
  if (cachedDatasource) return cachedDatasource;
  try {
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
    const datasource = await getDefaultDatasource();
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
    const datasource = await getDefaultDatasource();
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
    const label = isProxy ? `proxy:${dataRequest.datasourceId}` : dataRequest.url?.substring(0, 80);
    console.log(`[Data Execute] Processing: ${label}...`);
    const { data, total } = await executeDataRequest2(dataRequest);
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
  return c.json({ success: true, message: "Cache cleared" });
});

// src/engine/agent/tools/pages.ts
import { tool as tool2 } from "ai";
import { z as z13 } from "zod";
function buildPageTools(profile) {
  const tools = {};
  const perms = profile.permissions?.["pages.all"] || [];
  const hasRead = perms.includes("read") || perms.includes("all");
  const hasWrite = perms.includes("write") || perms.includes("all");
  if (!hasRead && !hasWrite) return tools;
  if (hasRead) {
    tools["pages_list"] = tool2({
      description: "List all published pages on this engine. Returns page name, slug, and version for each page.",
      parameters: z13.object({}),
      execute: async () => {
        try {
          const pages = await stateProvider.listPages();
          return {
            count: pages.length,
            pages: pages.map((p) => ({
              name: p.name,
              slug: p.slug,
              version: p.version
            }))
          };
        } catch (e) {
          return { error: `Failed to list pages: ${e.message}` };
        }
      }
    });
    tools["pages_get"] = tool2({
      description: "Get the full structure of a published page by slug. Returns the page name, slug, version, component tree (types and IDs), and SEO metadata.",
      parameters: z13.object({
        slug: z13.string().describe('The page slug (URL path), e.g. "about" or "pricing"')
      }),
      execute: async ({ slug }) => {
        try {
          const page = await stateProvider.getPageBySlug(slug);
          if (!page) {
            return { error: `Page with slug '${slug}' not found` };
          }
          const summarizeComponents = (components) => {
            return (components || []).map((c) => ({
              id: c.id,
              type: c.type,
              ...c.props?.text ? { text: String(c.props.text).slice(0, 100) } : {},
              ...c.props?.label ? { label: c.props.label } : {},
              ...c.props?.src ? { src: c.props.src } : {},
              ...c.binding?.tableName ? { boundTo: c.binding.tableName } : {},
              ...c.children?.length ? { children: summarizeComponents(c.children) } : {}
            }));
          };
          const layoutData = page.layoutData;
          return {
            name: page.name,
            slug: page.slug,
            version: page.version,
            isHomepage: page.isHomepage || false,
            isPublic: page.isPublic !== false,
            seo: {
              title: page.title || page.seoData?.title || page.name,
              description: page.description || page.seoData?.description || null
            },
            components: summarizeComponents(layoutData?.content || [])
          };
        } catch (e) {
          return { error: `Failed to get page: ${e.message}` };
        }
      }
    });
  }
  if (hasWrite) {
    tools["pages_updateComponent"] = tool2({
      description: "Update a single component's props on a published page. Changes are applied to the page in the state DB but NOT automatically published \u2014 use pages_updateAndPublish for atomic edit+publish.",
      parameters: z13.object({
        slug: z13.string().describe("The page slug"),
        componentId: z13.string().describe("The ID of the component to update"),
        props: z13.record(z13.any()).describe("The prop key-value pairs to merge into the component")
      }),
      execute: async ({ slug, componentId, props }) => {
        try {
          const page = await stateProvider.getPageBySlug(slug);
          if (!page) return { error: `Page '${slug}' not found` };
          const layoutData = { ...page.layoutData };
          let found = false;
          const patchComponent = (components) => {
            return components.map((c) => {
              if (c.id === componentId) {
                found = true;
                return { ...c, props: { ...c.props || {}, ...props } };
              }
              if (c.children?.length) {
                return { ...c, children: patchComponent(c.children) };
              }
              return c;
            });
          };
          layoutData.content = patchComponent(layoutData.content || []);
          if (!found) {
            return { error: `Component '${componentId}' not found in page '${slug}'` };
          }
          await stateProvider.upsertPage({ ...page, layoutData });
          return { success: true, message: `Updated component '${componentId}' on page '${slug}'` };
        } catch (e) {
          return { error: `Failed to update component: ${e.message}` };
        }
      }
    });
    tools["pages_updateAndPublish"] = tool2({
      description: "Update a component's props on a page AND trigger a full publish cycle (CSS rebundle + cache flush). This is the recommended way to make visible changes. It is an atomic one-shot operation.",
      parameters: z13.object({
        slug: z13.string().describe("The page slug"),
        componentId: z13.string().describe("The ID of the component to update"),
        props: z13.record(z13.any()).describe("The prop key-value pairs to merge into the component")
      }),
      execute: async ({ slug, componentId, props }) => {
        try {
          const page = await stateProvider.getPageBySlug(slug);
          if (!page) return { error: `Page '${slug}' not found` };
          const layoutData = { ...page.layoutData };
          let found = false;
          const patchComponent = (components) => {
            return components.map((c) => {
              if (c.id === componentId) {
                found = true;
                return { ...c, props: { ...c.props || {}, ...props } };
              }
              if (c.children?.length) {
                return { ...c, children: patchComponent(c.children) };
              }
              return c;
            });
          };
          layoutData.content = patchComponent(layoutData.content || []);
          if (!found) {
            return { error: `Component '${componentId}' not found in page '${slug}'` };
          }
          await stateProvider.upsertPage({ ...page, layoutData });
          try {
            const cacheReq = new Request("http://localhost/api/cache/invalidate", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": profile.apiKey || ""
              },
              body: JSON.stringify({ pattern: `page:${slug}*` })
            });
            await liteApp.request(cacheReq);
          } catch {
          }
          return {
            success: true,
            message: `Updated component '${componentId}' on page '${slug}' and flushed cache.`
          };
        } catch (e) {
          return { error: `Failed to update and publish: ${e.message}` };
        }
      }
    });
  }
  return tools;
}

// src/engine/agent/tools/styles.ts
import { tool as tool3 } from "ai";
import { z as z14 } from "zod";
function buildStyleTools(profile) {
  const tools = {};
  const perms = profile.permissions?.["pages.all"] || [];
  const hasRead = perms.includes("read") || perms.includes("all");
  const hasWrite = perms.includes("write") || perms.includes("all");
  if (!hasRead && !hasWrite) return tools;
  const findComponent = (components, id) => {
    for (const c of components) {
      if (c.id === id) return c;
      if (c.children?.length) {
        const found = findComponent(c.children, id);
        if (found) return found;
      }
    }
    return null;
  };
  if (hasRead) {
    tools["styles_get"] = tool3({
      description: "Get the current styles for a specific component on a page. Returns the style values (colors, spacing, typography, etc.) and any viewport overrides.",
      parameters: z14.object({
        slug: z14.string().describe("The page slug"),
        componentId: z14.string().describe("The component ID to inspect")
      }),
      execute: async ({ slug, componentId }) => {
        try {
          const page = await stateProvider.getPageBySlug(slug);
          if (!page) return { error: `Page '${slug}' not found` };
          const layoutData = page.layoutData;
          const component = findComponent(layoutData?.content || [], componentId);
          if (!component) return { error: `Component '${componentId}' not found` };
          return {
            componentId,
            type: component.type,
            styles: component.styles || {},
            stylesData: component.stylesData || null
          };
        } catch (e) {
          return { error: `Failed to get styles: ${e.message}` };
        }
      }
    });
  }
  if (hasWrite) {
    tools["styles_update"] = tool3({
      description: "Update styles for a single component on a page. Merges the provided style values into the component's existing styles. Supports CSS properties like backgroundColor, fontSize, padding, margin, borderRadius, color, etc.",
      parameters: z14.object({
        slug: z14.string().describe("The page slug"),
        componentId: z14.string().describe("The component ID to style"),
        styles: z14.record(z14.any()).describe('Style key-value pairs to merge, e.g. { "backgroundColor": "#1a1a2e", "fontSize": "18px" }')
      }),
      execute: async ({ slug, componentId, styles }) => {
        try {
          const page = await stateProvider.getPageBySlug(slug);
          if (!page) return { error: `Page '${slug}' not found` };
          const layoutData = { ...page.layoutData };
          let found = false;
          const patchStyles = (components) => {
            return components.map((c) => {
              if (c.id === componentId) {
                found = true;
                const existingStyles = c.styles || {};
                return { ...c, styles: { ...existingStyles, ...styles } };
              }
              if (c.children?.length) {
                return { ...c, children: patchStyles(c.children) };
              }
              return c;
            });
          };
          layoutData.content = patchStyles(layoutData.content || []);
          if (!found) return { error: `Component '${componentId}' not found` };
          await stateProvider.upsertPage({ ...page, layoutData });
          return { success: true, message: `Updated styles for '${componentId}' on page '${slug}'` };
        } catch (e) {
          return { error: `Failed to update styles: ${e.message}` };
        }
      }
    });
    tools["styles_batchUpdate"] = tool3({
      description: "Update styles for multiple components on a page in a single operation. Useful for applying a theme or making coordinated visual changes across several components at once.",
      parameters: z14.object({
        slug: z14.string().describe("The page slug"),
        updates: z14.array(z14.object({
          componentId: z14.string().describe("The component ID"),
          styles: z14.record(z14.any()).describe("Style key-value pairs to merge")
        })).describe("Array of component style updates")
      }),
      execute: async ({ slug, updates }) => {
        try {
          const page = await stateProvider.getPageBySlug(slug);
          if (!page) return { error: `Page '${slug}' not found` };
          const layoutData = { ...page.layoutData };
          const updateMap = new Map(updates.map((u) => [u.componentId, u.styles]));
          const applied = [];
          const patchAll = (components) => {
            return components.map((c) => {
              const newStyles = updateMap.get(c.id);
              let updated = c;
              if (newStyles) {
                applied.push(c.id);
                updated = { ...c, styles: { ...c.styles || {}, ...newStyles } };
              }
              if (updated.children?.length) {
                updated = { ...updated, children: patchAll(updated.children) };
              }
              return updated;
            });
          };
          layoutData.content = patchAll(layoutData.content || []);
          const notFound = updates.filter((u) => !applied.includes(u.componentId)).map((u) => u.componentId);
          await stateProvider.upsertPage({ ...page, layoutData });
          return {
            success: true,
            applied: applied.length,
            notFound: notFound.length > 0 ? notFound : void 0,
            message: `Updated styles for ${applied.length}/${updates.length} components on page '${slug}'`
          };
        } catch (e) {
          return { error: `Failed to batch update styles: ${e.message}` };
        }
      }
    });
  }
  return tools;
}

// src/engine/agent/tools/engine.ts
import { tool as tool4 } from "ai";
import { z as z15 } from "zod";
function buildEngineTools(profile) {
  const tools = {};
  const perms = profile.permissions?.["engine.all"] || [];
  const hasRead = perms.includes("read") || perms.includes("all");
  if (!hasRead) return tools;
  tools["engine_status"] = tool4({
    description: "Get the engine's current health status including state DB, cache, and queue binding status. Use this to understand what infrastructure is connected.",
    parameters: z15.object({}),
    execute: async () => {
      try {
        const req = new Request("http://localhost/api/health", {
          headers: { "x-api-key": profile.apiKey || "" }
        });
        const res = await liteApp.request(req);
        const data = await res.json();
        return {
          status: data.status,
          version: data.version,
          provider: data.provider,
          uptime_seconds: data.uptime_seconds,
          bindings: data.bindings
        };
      } catch (e) {
        return { error: `Failed to get engine status: ${e.message}` };
      }
    }
  });
  tools["engine_config"] = tool4({
    description: "Get a non-secret summary of the engine's configuration: which providers are configured for state DB, cache, queue, and how many GPU models are available.",
    parameters: z15.object({}),
    execute: async () => {
      try {
        const { getStateDbConfig: getStateDbConfig2, getCacheConfig: getCacheConfig2, getQueueConfig: getQueueConfig3, getGpuModels: getGpuModels2, getAgentProfilesConfig: getAgentProfilesConfig2 } = await import("./env-IFXQKGIA.js");
        const stateDb = getStateDbConfig2();
        const cache = getCacheConfig2();
        const queue = getQueueConfig3();
        const models = getGpuModels2();
        const profiles = getAgentProfilesConfig2();
        return {
          stateDb: { provider: stateDb.provider },
          cache: { provider: cache.provider },
          queue: { provider: queue.provider },
          gpu: {
            modelCount: models.length,
            models: models.map((m) => ({
              slug: m.slug,
              modelId: m.modelId,
              type: m.modelType,
              provider: m.provider
            }))
          },
          agentProfiles: Object.keys(profiles)
        };
      } catch (e) {
        return { error: `Failed to get config: ${e.message}` };
      }
    }
  });
  tools["engine_workflows"] = tool4({
    description: "List all deployed workflows on this engine. Returns name, trigger type, active status, and version for each workflow.",
    parameters: z15.object({}),
    execute: async () => {
      try {
        const workflows = await stateProvider.listWorkflows();
        return {
          count: workflows.length,
          workflows: workflows.map((w) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            triggerType: w.triggerType,
            isActive: w.isActive,
            version: w.version,
            updatedAt: w.updatedAt
          }))
        };
      } catch (e) {
        return { error: `Failed to list workflows: ${e.message}` };
      }
    }
  });
  tools["engine_logs"] = tool4({
    description: "Get recent edge engine logs. Useful for debugging issues or checking recent activity.",
    parameters: z15.object({
      limit: z15.number().optional().describe("Max number of log entries to return (default: 20, max: 100)"),
      level: z15.string().optional().describe('Filter by log level: "info", "warn", "error"')
    }),
    execute: async ({ limit, level }) => {
      try {
        const queryLimit = Math.min(limit || 20, 100);
        const url = new URL("http://localhost/api/edge-logs");
        url.searchParams.set("limit", String(queryLimit));
        if (level) url.searchParams.set("level", level);
        const req = new Request(url.toString(), {
          headers: { "x-api-key": profile.apiKey || "" }
        });
        const res = await liteApp.request(req);
        const data = await res.json();
        return data;
      } catch (e) {
        return { error: `Failed to get logs: ${e.message}` };
      }
    }
  });
  return tools;
}

// src/engine/agent/tools/user-tools.ts
import { tool as tool5 } from "ai";
import { z as z16 } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
function parametersToZod(params) {
  const shape = {};
  for (const param of params) {
    let zodType;
    switch (param.type) {
      case "number":
        zodType = z16.number();
        break;
      case "boolean":
        zodType = z16.boolean();
        break;
      case "array":
        zodType = z16.array(z16.any());
        break;
      case "object":
        zodType = z16.record(z16.string(), z16.any());
        break;
      case "string":
      default:
        if (param.enum && param.enum.length > 0) {
          zodType = z16.enum(param.enum);
        } else {
          zodType = z16.string();
        }
        break;
    }
    if (param.description) {
      zodType = zodType.describe(param.description);
    }
    if (param.default !== void 0) {
      zodType = zodType.default(param.default);
    }
    if (!param.required) {
      zodType = zodType.optional();
    }
    shape[param.name] = zodType;
  }
  return z16.object(shape);
}
function buildWorkflowTool(toolDef, config, profile) {
  const schema = config.parameters?.length > 0 ? parametersToZod(config.parameters) : z16.object({});
  return {
    [toolDef.name]: tool5({
      description: toolDef.description || `Trigger workflow: ${toolDef.name}`,
      parameters: schema,
      execute: async (args) => {
        try {
          const req = new Request(`http://localhost/api/execute/${config.workflowId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": profile.apiKey || ""
            },
            body: JSON.stringify({ parameters: args })
          });
          const res = await liteApp.request(req);
          const data = await res.json();
          const json = JSON.stringify(data);
          if (json.length > 4096) {
            return { result: JSON.parse(json.substring(0, 4096) + "..."), _truncated: true };
          }
          return data;
        } catch (e) {
          return { error: `Workflow execution failed: ${e.message}` };
        }
      }
    })
  };
}
async function buildMcpClientTools(toolDef, config) {
  const tools = {};
  try {
    const sseUrl = new URL(config.url);
    const transport = new SSEClientTransport(sseUrl, {
      requestInit: { headers: config.headers || {} }
    });
    const client = new Client(
      { name: `frontbase-edge-client`, version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(transport);
    const mcpToolsRes = await client.listTools();
    if (mcpToolsRes && Array.isArray(mcpToolsRes.tools)) {
      for (const mTool of mcpToolsRes.tools) {
        if (config.toolFilter && config.toolFilter.length > 0) {
          if (!config.toolFilter.includes(mTool.name)) {
            continue;
          }
        }
        tools[`mcp_${toolDef.name}_${mTool.name}`] = tool5({
          description: `[From ${toolDef.name} MCP]: ${mTool.description || `Tool ${mTool.name}`}`,
          parameters: z16.any(),
          execute: async (args) => {
            try {
              const result = await client.callTool({
                name: mTool.name,
                arguments: args
              });
              const resAny = result;
              if (resAny.content && resAny.content.length > 0) {
                const textBlock = resAny.content.find((c) => c.type === "text");
                if (textBlock) {
                  try {
                    return JSON.parse(textBlock.text);
                  } catch {
                    return textBlock.text;
                  }
                }
              }
              return result;
            } catch (err) {
              return { error: `MCP Tool Execution Failed: ${err.message}` };
            }
          }
        });
      }
    }
  } catch (err) {
    console.error(`[UserTools] Failed to initialize MCP Client '${toolDef.name}':`, err.message);
    tools[`mcp_${toolDef.name}_status`] = tool5({
      description: `MCP Server '${toolDef.name}' is currently unreachable.`,
      parameters: z16.object({}),
      execute: async () => ({
        error: `MCP Connection failed`,
        message: err.message
      })
    });
  }
  return tools;
}
async function buildUserTools(profile, stateProvider2) {
  const tools = {};
  try {
    const profileSlug = profile.name?.toLowerCase().replace(/\s+/g, "-") || "default";
    const userTools = await stateProvider2.listAgentTools(profileSlug);
    if (!userTools.length) return tools;
    for (const toolDef of userTools) {
      try {
        const config = JSON.parse(toolDef.config);
        switch (toolDef.type) {
          case "workflow": {
            const wfPerms = profile.permissions?.["workflows.all"] || [];
            if (!wfPerms.includes("trigger") && !wfPerms.includes("all")) {
              console.log(`[UserTools] Skipping '${toolDef.name}' \u2014 no workflow trigger permission`);
              continue;
            }
            Object.assign(tools, buildWorkflowTool(toolDef, config, profile));
            break;
          }
          case "mcp_server": {
            const enginePerms = profile.permissions?.["engine.all"] || [];
            if (!enginePerms.includes("read") && !enginePerms.includes("all")) {
              console.log(`[UserTools] Skipping MCP '${toolDef.name}' \u2014 no engine read permission`);
              continue;
            }
            Object.assign(tools, await buildMcpClientTools(toolDef, config));
            break;
          }
          default:
            console.warn(`[UserTools] Unknown tool type '${toolDef.type}' for '${toolDef.name}'`);
        }
      } catch (parseErr) {
        console.error(`[UserTools] Failed to parse config for '${toolDef.name}': ${parseErr.message}`);
      }
    }
    if (Object.keys(tools).length > 0) {
      console.log(`[UserTools] Loaded ${Object.keys(tools).length} user-configured tools for profile '${profile.name}'`);
    }
  } catch (err) {
    console.warn(`[UserTools] Could not load user tools: ${err.message}`);
  }
  return tools;
}

// src/engine/agent/tools.ts
var buildAgentTools = async (profile, stateProvider2) => {
  const tools = {};
  Object.assign(tools, await buildAutoTools(profile));
  Object.assign(tools, buildPageTools(profile));
  Object.assign(tools, buildStyleTools(profile));
  Object.assign(tools, buildEngineTools(profile));
  tools.queryDatasource = tool6({
    description: "Execute a read-only SQL SELECT query against a connected external Datasource. Use this to query live app data.",
    parameters: z17.object({
      datasourceId: z17.string().describe("The UUID of the connected datasource to query."),
      sql: z17.string().describe("The raw SQL SELECT query to execute. Do not execute destructive commands like DROP or DELETE.")
    }),
    // @ts-ignore
    execute: async ({ datasourceId, sql: sql2 }) => {
      const dsPerms = profile.permissions?.[`datasources.${datasourceId}`] || profile.permissions?.["datasources.all"] || [];
      if (!dsPerms.includes("read") && !dsPerms.includes("all")) {
        return {
          error: `Security Violation: Your Agent Profile '${profile.name}' does not have 'read' permissions configured for datasource '${datasourceId}'. Have the administrator grant access through the Edge Inspector UI.`
        };
      }
      try {
        const dataReq = {
          fetchStrategy: "proxy",
          datasourceId,
          method: "POST",
          url: "",
          body: { query: sql2, params: [] },
          queryConfig: { sql: sql2 }
        };
        const result = await executeDataRequest2(dataReq);
        return result.data;
      } catch (e) {
        return { error: `Query failed: ${e.message || "Unknown query error"}` };
      }
    }
  });
  const workflowPerms = profile.permissions?.["workflows.all"] || [];
  if (workflowPerms.includes("trigger") || workflowPerms.includes("all")) {
    tools.triggerWorkflow = tool6({
      description: "Trigger an Action Workflow deployed on this Edge Engine.",
      parameters: z17.object({
        workflowId: z17.string().describe("The ID of the workflow to trigger."),
        payload: z17.record(z17.any()).optional().describe("Optional JSON payload to send to the workflow.")
      }),
      execute: async ({ workflowId, payload }) => {
        try {
          const req = new Request(`http://localhost/api/execute/${workflowId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": profile.apiKey || ""
            },
            body: JSON.stringify({ parameters: payload || {} })
          });
          const res = await liteApp.request(req);
          const data = await res.json();
          return data;
        } catch (e) {
          return { error: `Failed to trigger workflow: ${e.message}` };
        }
      }
    });
  }
  if (stateProvider2) {
    Object.assign(tools, await buildUserTools(profile, stateProvider2));
  }
  return tools;
};

// src/routes/openai.ts
var openaiRoute = new OpenAPIHono12();
function resolveModel(modelSlug, c) {
  if (!modelSlug) {
    return { error: c.json({ error: { message: "Missing required field: model", type: "invalid_request_error", code: "missing_field" } }, 400) };
  }
  const models = getGPUModels();
  const model = models.find((m) => m.slug === modelSlug);
  if (!model) {
    return { error: c.json({ error: { message: `Model '${modelSlug}' not found. Available: ${models.map((m) => m.slug).join(", ")}`, type: "invalid_request_error", code: "model_not_found" } }, 404) };
  }
  const ai = getAIBinding();
  if (!ai) {
    return { error: c.json({ error: { message: "AI binding not available.", type: "server_error", code: "ai_binding_missing" } }, 503) };
  }
  return { model, ai };
}
function mergeDefaults(payload, model) {
  if (model.provider_config) {
    const defaults = typeof model.provider_config === "string" ? JSON.parse(model.provider_config) : model.provider_config;
    for (const [k, v] of Object.entries(defaults)) {
      if (!(k in payload)) payload[k] = v;
    }
  }
}
function getWorkersAI(ai) {
  return createWorkersAI({ binding: ai });
}
function convertOpenAIMessages(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    if (!Array.isArray(msg.content)) return msg;
    const convertedContent = msg.content.map((part) => {
      if (!part || typeof part !== "object") return part;
      if (part.type === "image_url" && part.image_url) {
        const url = typeof part.image_url === "string" ? part.image_url : part.image_url.url;
        if (!url) return part;
        return { type: "image", image: url };
      }
      if (part.type === "input_image" && part.image_url) {
        const url = typeof part.image_url === "string" ? part.image_url : part.image_url.url;
        return { type: "image", image: url };
      }
      return part;
    });
    return { ...msg, content: convertedContent };
  });
}
openaiRoute.get("/models", (c) => {
  const models = getGPUModels();
  return c.json({
    object: "list",
    data: models.map((m) => ({
      id: m.slug,
      object: "model",
      created: Math.floor(Date.now() / 1e3),
      owned_by: m.provider,
      permission: [],
      root: m.model_id,
      parent: null
    }))
  });
});
openaiRoute.post("/chat/completions", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Invalid JSON body", type: "invalid_request_error", code: "invalid_json" } }, 400);
  }
  const resolved = resolveModel(body.model, c);
  if ("error" in resolved) return resolved.error;
  const { model, ai } = resolved;
  const workersai = getWorkersAI(ai);
  const sdkModel = workersai(model.model_id);
  const mergedBody = { ...body };
  mergeDefaults(mergedBody, model);
  const sdkOptions = {
    model: sdkModel,
    messages: convertOpenAIMessages(body.messages)
  };
  const profile = c.get ? c.get("agentProfile") : c.var?.agentProfile;
  if (profile) {
    sdkOptions.system = buildAgentSystemPrompt(profile);
    sdkOptions.tools = await buildAgentTools(profile, getStateProvider());
    sdkOptions.messages = sdkOptions.messages.filter((m) => m.role !== "system");
    if (mergedBody.max_steps == null && mergedBody.maxSteps == null) {
      mergedBody.max_steps = 5;
    }
  }
  if (mergedBody.max_tokens != null) sdkOptions.maxOutputTokens = mergedBody.max_tokens;
  if (mergedBody.temperature != null) sdkOptions.temperature = mergedBody.temperature;
  if (mergedBody.top_p != null) sdkOptions.topP = mergedBody.top_p;
  if (mergedBody.top_k != null) sdkOptions.topK = mergedBody.top_k;
  if (mergedBody.stop != null) sdkOptions.stopSequences = Array.isArray(mergedBody.stop) ? mergedBody.stop : [mergedBody.stop];
  if (mergedBody.seed != null) sdkOptions.seed = mergedBody.seed;
  if (mergedBody.frequency_penalty != null) sdkOptions.frequencyPenalty = mergedBody.frequency_penalty;
  if (mergedBody.presence_penalty != null) sdkOptions.presencePenalty = mergedBody.presence_penalty;
  const workerSpecific = {};
  if (mergedBody.repetition_penalty != null) workerSpecific.repetitionPenalty = mergedBody.repetition_penalty;
  if (mergedBody.raw != null) workerSpecific.raw = mergedBody.raw;
  if (mergedBody.lora != null) workerSpecific.lora = mergedBody.lora;
  if (mergedBody.response_format != null) workerSpecific.response_format = mergedBody.response_format;
  if (Object.keys(workerSpecific).length > 0) {
    sdkOptions.providerOptions = { "workers-ai": workerSpecific };
  }
  const maxSteps = mergedBody.max_steps || mergedBody.maxSteps || 1;
  if (maxSteps > 1 && !body.stream) {
    const taskId = `chatcmpl-${crypto.randomUUID().slice(0, 12)}`;
    const saved = await saveAITask({
      id: taskId,
      model: model.slug,
      messages: sdkOptions.messages,
      tools: sdkOptions.tools,
      maxSteps,
      currentStep: 0,
      status: "pending",
      options: sdkOptions,
      result: null
    });
    const dispatched = saved ? await dispatchAITask(taskId) : false;
    if (saved && dispatched) {
      return c.json({
        id: taskId,
        object: "chat.completion.async",
        status: "pending",
        message: "Task successfully queued for asynchronous processing. Poll /v1/chat/completions/{id} for result."
      }, 202);
    } else {
      sdkOptions.maxSteps = maxSteps;
    }
  }
  try {
    if (body.stream) {
      const result2 = streamText(sdkOptions);
      return result2.toTextStreamResponse({
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "content-encoding": "identity",
          "transfer-encoding": "chunked"
        }
      });
    }
    const result = await generateText(sdkOptions);
    const toolCalls = result.toolCalls && result.toolCalls.length > 0 ? result.toolCalls.map((tc, i) => ({
      id: tc.toolCallId || `call_${crypto.randomUUID().slice(0, 12)}`,
      type: "function",
      function: {
        name: tc.toolName,
        arguments: JSON.stringify(tc.args)
      }
    })) : void 0;
    const finishReason = result.finishReason === "tool-calls" ? "tool_calls" : result.finishReason === "length" ? "length" : result.finishReason === "content-filter" ? "content_filter" : "stop";
    return c.json({
      id: `chatcmpl-${crypto.randomUUID().slice(0, 12)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1e3),
      model: model.slug,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: result.text || null,
          ...toolCalls ? { tool_calls: toolCalls } : {}
        },
        finish_reason: finishReason
      }],
      usage: {
        prompt_tokens: result.usage?.inputTokens ?? 0,
        completion_tokens: result.usage?.outputTokens ?? 0,
        total_tokens: result.usage?.totalTokens ?? 0
      }
    });
  } catch (err) {
    console.error(`[OpenAI] Inference error for ${body.model}:`, err);
    return c.json({ error: { message: err.message || "Inference failed", type: "server_error", code: "inference_error" } }, 500);
  }
});
openaiRoute.get("/chat/completions/:id", async (c) => {
  const id = c.req.param("id");
  const task = await loadAITask(id);
  if (!task) {
    return c.json({ error: { message: "Task not found or expired", type: "invalid_request_error", code: "not_found" } }, 404);
  }
  if (task.status === "pending") {
    return c.json({
      id: task.id,
      object: "chat.completion.async",
      status: "pending",
      current_step: task.currentStep,
      max_steps: task.maxSteps
    }, 202);
  }
  if (task.status === "failed") {
    return c.json({
      id: task.id,
      object: "chat.completion.async",
      status: "failed",
      error: task.error || "Unknown execution error"
    }, 500);
  }
  return c.json(task.result);
});
openaiRoute.post("/chat/completions/continue", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Invalid JSON body" } }, 400);
  }
  const taskId = body.taskId || body.parameters?.taskId;
  if (!taskId) {
    return c.json({ error: { message: "Missing taskId" } }, 400);
  }
  const task = await loadAITask(taskId);
  if (!task || task.status !== "pending") {
    return c.json({ status: "ignored", message: "Task not pending or not found" });
  }
  try {
    const resolved = resolveModel(task.model, c);
    if ("error" in resolved) return resolved.error;
    const { model, ai } = resolved;
    const workersai = getWorkersAI(ai);
    const sdkModel = workersai(model.model_id);
    const sdkOptions = { ...task.options, model: sdkModel, messages: task.messages, maxSteps: task.maxSteps };
    const profile = c.get ? c.get("agentProfile") : c.var?.agentProfile;
    if (profile) {
      sdkOptions.tools = await buildAgentTools(profile, getStateProvider());
    }
    const result = await generateText(sdkOptions);
    const toolCalls = result.toolCalls && result.toolCalls.length > 0 ? result.toolCalls.map((tc, i) => ({
      id: tc.toolCallId || `call_${crypto.randomUUID().slice(0, 12)}`,
      type: "function",
      function: { name: tc.toolName, arguments: JSON.stringify(tc.args) }
    })) : void 0;
    const finishReason = result.finishReason === "tool-calls" ? "tool_calls" : result.finishReason === "length" ? "length" : result.finishReason === "content-filter" ? "content_filter" : "stop";
    const finalOutput = {
      id: task.id,
      // Reuse task ID so polling matches
      object: "chat.completion",
      created: Math.floor(Date.now() / 1e3),
      model: model.slug,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: result.text || null,
          ...toolCalls ? { tool_calls: toolCalls } : {}
        },
        finish_reason: finishReason
      }],
      usage: {
        prompt_tokens: result.usage?.inputTokens ?? 0,
        completion_tokens: result.usage?.outputTokens ?? 0,
        total_tokens: result.usage?.totalTokens ?? 0
      }
    };
    task.result = finalOutput;
    task.status = "completed";
    await saveAITask(task);
    return c.json({ status: "completed" });
  } catch (err) {
    console.error(`[Queue] Task ${taskId} failed:`, err);
    task.status = "failed";
    task.error = err.message;
    await saveAITask(task);
    return c.json({ status: "failed", error: err.message }, 500);
  }
});
openaiRoute.post("/embeddings", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Invalid JSON body", type: "invalid_request_error", code: "invalid_json" } }, 400);
  }
  const resolved = resolveModel(body.model, c);
  if ("error" in resolved) return resolved.error;
  const { model, ai } = resolved;
  const workersai = getWorkersAI(ai);
  const embeddingModel = workersai.textEmbedding(model.model_id);
  try {
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const result = await embedMany({
      model: embeddingModel,
      values: inputs
    });
    const data = result.embeddings.map((emb, i) => ({
      object: "embedding",
      embedding: emb,
      index: i
    }));
    return c.json({
      object: "list",
      data,
      model: model.slug,
      usage: {
        prompt_tokens: result.usage?.tokens ?? 0,
        total_tokens: result.usage?.tokens ?? 0
      }
    });
  } catch (err) {
    console.error(`[OpenAI] Embedding error for ${body.model}:`, err);
    return c.json({ error: { message: err.message || "Embedding failed", type: "server_error", code: "inference_error" } }, 500);
  }
});
openaiRoute.post("/images/generations", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Invalid JSON body", type: "invalid_request_error", code: "invalid_json" } }, 400);
  }
  const resolved = resolveModel(body.model, c);
  if ("error" in resolved) return resolved.error;
  const { model, ai } = resolved;
  if (!body.prompt) {
    return c.json({ error: { message: "Missing required field: prompt", type: "invalid_request_error", code: "missing_field" } }, 400);
  }
  const workersai = getWorkersAI(ai);
  try {
    const imageOptions = {
      model: workersai.image(model.model_id),
      prompt: body.prompt,
      n: body.n || 1
    };
    if (body.size) imageOptions.size = body.size;
    const result = await generateImage(imageOptions);
    const responseFormat = body.response_format || "b64_json";
    const imageData = result.images.map((img) => ({
      ...responseFormat === "b64_json" ? { b64_json: img.base64 } : { url: `data:image/png;base64,${img.base64}` },
      revised_prompt: body.prompt
    }));
    return c.json({
      created: Math.floor(Date.now() / 1e3),
      data: imageData
    });
  } catch (err) {
    console.error(`[OpenAI] Image generation error for ${body.model}:`, err);
    return c.json({ error: { message: err.message || "Image generation failed", type: "server_error", code: "inference_error" } }, 500);
  }
});
openaiRoute.post("/audio/transcriptions", async (c) => {
  let modelSlug;
  let audioData = null;
  let mimeType = "audio/wav";
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    const file = formData.get("file");
    modelSlug = formData.get("model");
    if (!file) {
      return c.json({ error: { message: "Missing required field: file", type: "invalid_request_error", code: "missing_field" } }, 400);
    }
    audioData = new Uint8Array(await file.arrayBuffer());
    mimeType = file.type || "audio/wav";
  } else {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { message: "Invalid request body", type: "invalid_request_error", code: "invalid_body" } }, 400);
    }
    modelSlug = body.model;
    if (body.file) {
      const raw = body.file.replace(/^data:audio\/[^;]+;base64,/, "");
      audioData = Uint8Array.from(atob(raw), (ch) => ch.charCodeAt(0));
      const mimeMatch = body.file.match(/^data:(audio\/[^;]+);base64,/);
      if (mimeMatch) mimeType = mimeMatch[1];
    }
  }
  const resolved = resolveModel(modelSlug, c);
  if ("error" in resolved) return resolved.error;
  const { model, ai } = resolved;
  if (!audioData) {
    return c.json({ error: { message: "No audio data provided", type: "invalid_request_error", code: "missing_field" } }, 400);
  }
  if (!transcribe) {
    try {
      const result = await ai.run(model.model_id, { audio: [...audioData] });
      return c.json({
        text: result?.text ?? result?.result ?? JSON.stringify(result)
      });
    } catch (err) {
      console.error(`[OpenAI] Transcription error for ${modelSlug}:`, err);
      return c.json({ error: { message: err.message || "Transcription failed", type: "server_error", code: "inference_error" } }, 500);
    }
  }
  const workersai = getWorkersAI(ai);
  try {
    const transcript = await transcribe({
      model: workersai.transcription(model.model_id),
      audio: audioData
    });
    return c.json({
      text: transcript.text,
      ...transcript.segments ? { segments: transcript.segments } : {},
      ...transcript.language ? { language: transcript.language } : {},
      ...transcript.durationInSeconds ? { duration: transcript.durationInSeconds } : {}
    });
  } catch (err) {
    console.error(`[OpenAI] Transcription error for ${modelSlug}:`, err);
    return c.json({ error: { message: err.message || "Transcription failed", type: "server_error", code: "inference_error" } }, 500);
  }
});
openaiRoute.post("/audio/speech", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Invalid JSON body", type: "invalid_request_error", code: "invalid_json" } }, 400);
  }
  const resolved = resolveModel(body.model, c);
  if ("error" in resolved) return resolved.error;
  const { model, ai } = resolved;
  if (!body.input) {
    return c.json({ error: { message: "Missing required field: input", type: "invalid_request_error", code: "missing_field" } }, 400);
  }
  const mimeMap = {
    mp3: "audio/mpeg",
    opus: "audio/opus",
    aac: "audio/aac",
    flac: "audio/flac",
    wav: "audio/wav",
    pcm: "audio/pcm"
  };
  const format = body.response_format || "mp3";
  if (!generateSpeech) {
    const payload = { text: body.input };
    if (body.voice) payload.voice = body.voice;
    if (body.speed) payload.speed = body.speed;
    mergeDefaults(payload, model);
    try {
      const result = await ai.run(model.model_id, payload);
      if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
        const audioBuffer = result instanceof Uint8Array ? result.buffer : result;
        return new Response(audioBuffer, {
          headers: { "Content-Type": mimeMap[format] || "audio/mpeg" }
        });
      }
      return c.json(result);
    } catch (err) {
      console.error(`[OpenAI] TTS error for ${body.model}:`, err);
      return c.json({ error: { message: err.message || "Text-to-speech failed", type: "server_error", code: "inference_error" } }, 500);
    }
  }
  const workersai = getWorkersAI(ai);
  try {
    const result = await generateSpeech({
      model: workersai.speech(model.model_id),
      text: body.input,
      ...body.voice ? { voice: body.voice } : {}
    });
    const audioBytes = result.audio.uint8Array;
    return new Response(audioBytes.buffer.slice(audioBytes.byteOffset, audioBytes.byteOffset + audioBytes.byteLength), {
      headers: { "Content-Type": mimeMap[format] || "audio/mpeg" }
    });
  } catch (err) {
    console.error(`[OpenAI] TTS error for ${body.model}:`, err);
    return c.json({ error: { message: err.message || "Text-to-speech failed", type: "server_error", code: "inference_error" } }, 500);
  }
});
openaiRoute.post("/responses", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Invalid JSON body", type: "invalid_request_error", code: "invalid_json" } }, 400);
  }
  const resolved = resolveModel(body.model, c);
  if ("error" in resolved) return resolved.error;
  const { model, ai } = resolved;
  if (!body.input) {
    return c.json({ error: { message: "Missing required field: input", type: "invalid_request_error", code: "missing_field" } }, 400);
  }
  const messages = [];
  if (body.instructions) {
    messages.push({ role: "system", content: body.instructions });
  }
  if (typeof body.input === "string") {
    messages.push({ role: "user", content: body.input });
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (typeof item === "string") {
        messages.push({ role: "user", content: item });
      } else if (item && typeof item === "object") {
        if (item.type === "message") {
          const role = item.role || "user";
          if (typeof item.content === "string") {
            messages.push({ role, content: item.content });
          } else if (Array.isArray(item.content)) {
            const sdkParts = item.content.map((part) => {
              if (part.type === "input_text" || part.type === "text") {
                return { type: "text", text: part.text || part.content || "" };
              }
              if (part.type === "input_image" || part.type === "image_url") {
                const url = part.image_url ? typeof part.image_url === "string" ? part.image_url : part.image_url.url : part.url;
                return { type: "image", image: url };
              }
              return { type: "text", text: part.text || part.content || JSON.stringify(part) };
            });
            messages.push({ role, content: sdkParts });
          } else {
            messages.push({ role, content: JSON.stringify(item.content) });
          }
        } else if (item.role && item.content) {
          if (typeof item.content === "string") {
            messages.push({ role: item.role, content: item.content });
          } else if (Array.isArray(item.content)) {
            const sdkParts = item.content.map((part) => {
              if (part.type === "image_url") {
                const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
                return { type: "image", image: url };
              }
              return part;
            });
            messages.push({ role: item.role, content: sdkParts });
          } else {
            messages.push({ role: item.role, content: JSON.stringify(item.content) });
          }
        }
      }
    }
  }
  if (messages.length === 0) {
    return c.json({ error: { message: "Could not extract messages from input", type: "invalid_request_error", code: "invalid_input" } }, 400);
  }
  const workersai = getWorkersAI(ai);
  const sdkModel = workersai(model.model_id);
  const sdkOptions = {
    model: sdkModel,
    messages
  };
  if (body.max_tokens != null) sdkOptions.maxOutputTokens = body.max_tokens;
  if (body.temperature != null) sdkOptions.temperature = body.temperature;
  const workerSpecific = {};
  if (body.reasoning) {
    workerSpecific.reasoning = {};
    if (body.reasoning.effort) workerSpecific.reasoning.effort = body.reasoning.effort;
    if (body.reasoning.summary) workerSpecific.reasoning.summary = body.reasoning.summary;
  }
  if (Object.keys(workerSpecific).length > 0) {
    sdkOptions.providerOptions = { "workers-ai": workerSpecific };
  }
  try {
    const result = await generateText(sdkOptions);
    const responseText = result.text || "";
    const usage = result.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    return c.json({
      id: `resp-${crypto.randomUUID().slice(0, 12)}`,
      object: "response",
      created_at: Math.floor(Date.now() / 1e3),
      model: model.slug,
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: responseText }]
      }],
      usage: {
        input_tokens: usage.inputTokens ?? 0,
        output_tokens: usage.outputTokens ?? 0,
        total_tokens: usage.totalTokens ?? 0
      }
    });
  } catch (err) {
    console.error(`[OpenAI] Responses API error for ${body.model}:`, err);
    return c.json({ error: { message: err.message || "Response generation failed", type: "server_error", code: "inference_error" } }, 500);
  }
});

// src/routes/agent-tools.ts
import { OpenAPIHono as OpenAPIHono13 } from "@hono/zod-openapi";
var agentToolsRoute = new OpenAPIHono13();
agentToolsRoute.get("/:profileSlug", async (c) => {
  const profileSlug = c.req.param("profileSlug");
  const includeInactive = c.req.query("includeInactive") === "true";
  try {
    const provider = getStateProvider();
    const tools = await provider.listAgentTools(profileSlug, includeInactive);
    return c.json({ tools });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});
agentToolsRoute.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.id || !body.profileSlug || !body.type || !body.name || !body.config) {
    return c.json({
      error: "Missing required fields: id, profileSlug, type, name, config"
    }, 400);
  }
  if (!["workflow", "mcp_server"].includes(body.type)) {
    return c.json({ error: 'Invalid type. Must be "workflow" or "mcp_server".' }, 400);
  }
  try {
    if (typeof body.config === "string") {
      JSON.parse(body.config);
    } else {
      body.config = JSON.stringify(body.config);
    }
  } catch {
    return c.json({ error: "config must be valid JSON" }, 400);
  }
  try {
    const provider = getStateProvider();
    await provider.upsertAgentTool({
      id: body.id,
      profileSlug: body.profileSlug,
      type: body.type,
      name: body.name,
      description: body.description || null,
      config: typeof body.config === "string" ? body.config : JSON.stringify(body.config),
      isActive: body.isActive !== false,
      createdAt: body.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return c.json({ success: true, id: body.id });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});
agentToolsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const provider = getStateProvider();
    await provider.deleteAgentTool(id);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// src/routes/mcp.ts
init_env();
import { OpenAPIHono as OpenAPIHono14 } from "@hono/zod-openapi";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
var mcpServerRoute = new OpenAPIHono14();
var serverCache = /* @__PURE__ */ new Map();
mcpServerRoute.all("/:profileSlug/*", async (c) => {
  const profileSlug = c.req.param("profileSlug");
  const profilesConfig = getAgentProfilesConfig();
  const profile = profilesConfig[profileSlug];
  if (!profile) {
    return c.json({ error: { message: `Agent Profile '${profileSlug}' not found.` } }, 404);
  }
  const apiKeyHeader = c.req.header("x-api-key") || c.req.header("authorization")?.replace("Bearer ", "");
  if (profile.apiKey && apiKeyHeader !== profile.apiKey) {
    return c.text("Unauthorized API Key", 401);
  }
  let instance = serverCache.get(profileSlug);
  if (!instance) {
    const mcpServer = new McpServer({
      name: `frontbase-${profileSlug}`,
      version: "1.0.0"
    });
    const aiTools = await buildAgentTools(profile, getStateProvider());
    for (const [name, toolObj] of Object.entries(aiTools)) {
      let shape = {};
      if (toolObj.parameters && toolObj.parameters._def && typeof toolObj.parameters.shape === "object") {
        shape = toolObj.parameters.shape;
      }
      mcpServer.tool(
        name,
        toolObj.description || `Execute ${name}`,
        shape,
        async (args) => {
          try {
            const result = await toolObj.execute(args);
            return {
              content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }]
            };
          } catch (e) {
            return {
              isError: true,
              content: [{ type: "text", text: `Tool execution failed: ${e.message}` }]
            };
          }
        }
      );
    }
    const transport = new StreamableHTTPTransport();
    instance = { mcpServer, transport };
    serverCache.set(profileSlug, instance);
  }
  if (!instance.mcpServer.isConnected()) {
    await instance.mcpServer.connect(instance.transport);
  }
  return instance.transport.handleRequest(c);
});

// src/engine/lite.ts
init_env();

// src/middleware/auth.ts
init_env();
import { jwt } from "hono/jwt";
import { csrf } from "hono/csrf";
function parseKeyHashes() {
  const config = getApiKeysConfig();
  return config.apiKeyHashes || null;
}
function extractBearerToken(c) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
}
async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function validateApiKey(token, allowedScopes) {
  const keyEntries = parseKeyHashes();
  if (!keyEntries || keyEntries.length === 0) return null;
  const tokenHash = await sha256(token);
  const matched = keyEntries.find((k) => k.hash === tokenHash);
  if (!matched) return null;
  const keyScope = matched.scope || "user";
  if (!allowedScopes.includes(keyScope) && keyScope !== "all") {
    return null;
  }
  if (matched.expires_at) {
    if (new Date(matched.expires_at) < /* @__PURE__ */ new Date()) return null;
  }
  return matched;
}
var systemKeyAuth = async (c, next) => {
  const systemKey = getApiKeysConfig().systemKey;
  if (!systemKey) {
    return next();
  }
  const sysHeader = c.req.header("x-system-key");
  if (sysHeader && sysHeader === systemKey) {
    return next();
  }
  const bearerToken = extractBearerToken(c);
  if (bearerToken) {
    const matched = await validateApiKey(bearerToken, ["management", "all"]);
    if (matched) return next();
  }
  return c.json({
    error: {
      message: "Unauthorized. Provide x-system-key header or a management-scoped API key.",
      type: "invalid_request_error",
      code: "unauthorized"
    }
  }, 401);
};
var userApiKeyAuth = async (c, next) => {
  const config = getApiKeysConfig();
  const isDev = (process.env.NODE_ENV || "development") === "development";
  if (!config.apiKeyHashes) {
    if (isDev) return next();
    return c.json({
      error: {
        message: "No API keys configured for this engine.",
        type: "invalid_request_error",
        code: "no_api_keys_configured"
      }
    }, 403);
  }
  const keyEntries = parseKeyHashes();
  if (!keyEntries) {
    return c.json({
      error: {
        message: "API key configuration error. Contact administrator.",
        type: "server_error",
        code: "config_error"
      }
    }, 500);
  }
  if (keyEntries.length === 0) {
    if (isDev) return next();
    return c.json({
      error: {
        message: "No API keys configured for this engine.",
        type: "invalid_request_error",
        code: "no_api_keys_configured"
      }
    }, 403);
  }
  const token = extractBearerToken(c);
  if (!token) {
    return c.json({
      error: {
        message: "Missing or invalid Authorization header. Use: Authorization: Bearer <api_key>",
        type: "invalid_request_error",
        code: "missing_api_key"
      }
    }, 401);
  }
  const matched = await validateApiKey(token, ["user", "all"]);
  if (!matched) {
    return c.json({
      error: {
        message: "Invalid API key or insufficient scope.",
        type: "invalid_request_error",
        code: "invalid_api_key"
      }
    }, 401);
  }
  return next();
};
var aiApiKeyAuth = userApiKeyAuth;
var csrfProtection = csrf({
  origin: (origin, c) => {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(",");
    return allowedOrigins.includes(origin);
  }
});

// src/engine/lite.ts
var liquidEngine = new Liquid({
  strictVariables: false,
  strictFilters: false
});
var ENGINE_PROFILES = {
  lite: {
    description: "Self-sufficient edge runtime for workflow automation, webhooks, and AI inference.",
    techStack: "Hono \xB7 Drizzle ORM \xB7 LiquidJS \xB7 Zod",
    badge: "Lite Engine",
    tags: [
      { name: "System", description: "Health checks, manifest, and self-update" },
      { name: "Workflows", description: "Deploy, list, and manage published workflows" },
      { name: "Execution", description: "Execute workflows and inspect runs" },
      { name: "Webhooks", description: "Trigger workflows via incoming webhooks" },
      { name: "Cache", description: "Redis/Upstash cache management \u2014 test connection, invalidate keys, flush, and stats" },
      { name: "Queue", description: "Message queue management \u2014 stats and publishing (QStash/CF Queue)" },
      { name: "AI", description: "OpenAI-compatible inference (GPU models required)" }
    ]
  },
  full: {
    description: "Self-sufficient edge runtime for SSR pages, workflow automation, data proxy, webhooks, and AI inference.",
    techStack: "Hono \xB7 React \xB7 Drizzle ORM \xB7 LiquidJS \xB7 Zod",
    badge: "Full Engine",
    tags: [
      { name: "System", description: "Health checks, manifest, and self-update" },
      { name: "Pages", description: "Published page SSR and homepage rendering" },
      { name: "Data", description: "Datasource proxy \u2014 fetches data from connected backends (Supabase, Neon, etc.)" },
      { name: "Workflows", description: "Deploy, list, and manage published workflows" },
      { name: "Execution", description: "Execute workflows and inspect runs" },
      { name: "Webhooks", description: "Trigger workflows via incoming webhooks" },
      { name: "Cache", description: "Redis/Upstash cache management \u2014 test connection, invalidate keys, flush, and stats" },
      { name: "Queue", description: "Message queue management \u2014 stats and publishing (QStash/CF Queue)" },
      { name: "AI", description: "OpenAI-compatible inference (GPU models required)" }
    ]
  }
};
function createLiteApp(mode = "lite") {
  const profile = ENGINE_PROFILES[mode];
  const app2 = new OpenAPIHono15({
    defaultHook: (result, c) => {
      if (!result.success) {
        console.error("[Zod Validation Error]", JSON.stringify(result.error.issues, null, 2));
        return c.json({
          success: false,
          error: "Validation failed",
          details: result.error.issues
        }, 400);
      }
    }
  });
  app2.onError((err, c) => {
    console.error("[Global Error]", err);
    if (err.name === "ZodError" || err.issues) {
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
  app2.use("*", async (c, next) => {
    const disabled = process.env.FRONTBASE_DISABLED;
    if (disabled === "true" || disabled === "1") {
      const path2 = new URL(c.req.url).pathname;
      if (path2.startsWith("/api/health")) return next();
      return c.html(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Engine Paused</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1117;color:#e4e4e7;font-family:Inter,system-ui,sans-serif;text-align:center}.c{max-width:420px;padding:2rem}h1{font-size:1.5rem;margin:0 0 .5rem;color:#6366f1}p{color:#a1a1aa;margin:0;font-size:.9rem}</style></head><body><div class="c"><h1>\u23F8 Engine Paused</h1><p>This Frontbase Edge Engine has been paused by the administrator. It will resume when re-enabled from the dashboard.</p></div></body></html>`,
        503
      );
    }
    return next();
  });
  app2.use("*", requestId());
  app2.use("*", logger());
  app2.use("*", secureHeaders());
  app2.use("*", timing());
  app2.use("*", bodyLimit({ maxSize: 50 * 1024 * 1024 }));
  app2.use("/api/*", etag());
  app2.use("*", async (c, next) => {
    try {
      const mw = timeout(29e3);
      return await mw(c, next);
    } catch {
      return await next();
    }
  });
  app2.use("/api/*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) {
      c.res.headers.set("Cache-Control", "no-cache");
    }
  });
  app2.use("/api/*", cors({ origin: "*" }));
  app2.use("*", cors({ origin: "*" }));
  app2.use("/api/deploy/*", systemKeyAuth);
  app2.use("/api/execute/*", systemKeyAuth);
  app2.use("/api/update/*", systemKeyAuth);
  app2.use("/api/cache/*", systemKeyAuth);
  app2.use("/api/edge-logs/*", systemKeyAuth);
  app2.use("/api/manifest/*", systemKeyAuth);
  app2.use("/api/executions/*", systemKeyAuth);
  app2.use("/api/workflows/*", systemKeyAuth);
  app2.use("/api/queue/*", systemKeyAuth);
  app2.use("/api/config/*", systemKeyAuth);
  app2.use("/api/webhook/*", userApiKeyAuth);
  app2.route("/api/health", healthRoute);
  app2.route("/api/manifest", manifestRoute);
  app2.route("/api/deploy", deployRoute);
  app2.route("/api/execute", executeRoute);
  app2.route("/api/webhook", webhookRoute);
  app2.route("/api/executions", executionsRoute);
  app2.route("/api/update", updateRoute);
  app2.route("/api/cache", cacheRoute);
  app2.route("/api/edge-logs", edgeLogsRoute);
  app2.route("/api/workflows", workflowsRoute);
  app2.route("/api/queue", queueRoute);
  app2.route("/api/config", configRoute);
  app2.route("/api/agent-tools", agentToolsRoute);
  app2.use("/api/agents/v1/*", aiApiKeyAuth);
  app2.route("/api/agents/v1", openaiRoute);
  app2.route("/api/mcp", mcpServerRoute);
  app2.use("/api/agents/:profileSlug/v1/*", aiApiKeyAuth);
  app2.use("/api/agents/:profileSlug/v1/*", async (c, next) => {
    const profileSlug = c.req.param("profileSlug");
    const profilesConfig = getAgentProfilesConfig();
    const profile2 = profilesConfig[profileSlug];
    if (!profile2) {
      return c.json({ error: { message: `Agent Profile '${profileSlug}' not deployed on this engine. Check your Edge Inspector.` } }, 404);
    }
    c.set("agentProfile", profile2);
    await next();
  });
  app2.route("/api/agents/:profileSlug/v1", openaiRoute);
  const EDGE_VERSION = "0.1.0";
  app2.doc("/api/openapi.json", (c) => ({
    openapi: "3.1.0",
    info: {
      title: "Frontbase Edge Engine",
      version: EDGE_VERSION,
      description: [
        profile.description,
        "",
        `**Tech Stack:** ${profile.techStack}`,
        "",
        "**Authentication:** Protected routes require an API key via the `x-api-key` header."
      ].join("\n")
    },
    servers: [
      {
        url: new URL(c.req.url).origin,
        description: "Current server"
      }
    ],
    tags: profile.tags,
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "API key created in the Frontbase dashboard \u2192 Edge \u2192 API Keys"
        }
      }
    }
  }));
  app2.get("/api/docs", (c) => {
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Frontbase Edge API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
    <style>
        /* \u2500\u2500 Frontbase Dark Theme \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
        :root {
            --fb-bg: #0f1117;
            --fb-surface: #1a1d27;
            --fb-border: #2a2d3a;
            --fb-text: #e4e4e7;
            --fb-text-muted: #a1a1aa;
            --fb-primary: #6366f1;
            --fb-primary-hover: #818cf8;
            --fb-success: #22c55e;
            --fb-warning: #eab308;
            --fb-danger: #ef4444;
            --fb-info: #3b82f6;
        }
        body {
            margin: 0;
            background: var(--fb-bg);
            color: var(--fb-text);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        /* Header bar */
        .fb-header {
            background: var(--fb-surface);
            border-bottom: 1px solid var(--fb-border);
            padding: 16px 24px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .fb-header h1 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: var(--fb-text);
        }
        .fb-header .badge {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 9999px;
            font-weight: 600;
            letter-spacing: 0.03em;
        }
        .fb-header .badge-version {
            background: rgba(99, 102, 241, 0.15);
            color: var(--fb-primary-hover);
        }
        .fb-header .badge-engine {
            background: rgba(34, 197, 94, 0.15);
            color: var(--fb-success);
        }

        /* Swagger UI dark overrides */
        .swagger-ui { background: var(--fb-bg) !important; }
        .swagger-ui .topbar { display: none !important; }
        .swagger-ui .info { margin: 24px 0 !important; }
        .swagger-ui .info .title { color: var(--fb-text) !important; font-family: 'Inter', sans-serif !important; }
        .swagger-ui .info .description p { color: var(--fb-text-muted) !important; }
        .swagger-ui .info .description code { background: var(--fb-surface) !important; color: var(--fb-primary-hover) !important; }
        .swagger-ui .scheme-container { background: var(--fb-surface) !important; border: 1px solid var(--fb-border) !important; border-radius: 8px; box-shadow: none !important; }
        .swagger-ui .opblock-tag { color: var(--fb-text) !important; border-bottom: 1px solid var(--fb-border) !important; font-family: 'Inter', sans-serif !important; }
        .swagger-ui .opblock-tag small { color: var(--fb-text-muted) !important; }
        .swagger-ui .opblock { border-radius: 8px !important; border: 1px solid var(--fb-border) !important; background: var(--fb-surface) !important; margin-bottom: 8px !important; }
        .swagger-ui .opblock .opblock-summary { border: none !important; }
        .swagger-ui .opblock .opblock-summary-description { color: var(--fb-text-muted) !important; }
        .swagger-ui .opblock .opblock-summary-path { color: var(--fb-text) !important; }
        .swagger-ui .opblock.opblock-get { border-color: rgba(34, 197, 94, 0.3) !important; }
        .swagger-ui .opblock.opblock-post { border-color: rgba(59, 130, 246, 0.3) !important; }
        .swagger-ui .opblock.opblock-put { border-color: rgba(234, 179, 8, 0.3) !important; }
        .swagger-ui .opblock.opblock-delete { border-color: rgba(239, 68, 68, 0.3) !important; }
        .swagger-ui .opblock.opblock-patch { border-color: rgba(168, 85, 247, 0.3) !important; }
        .swagger-ui .opblock-body { background: var(--fb-bg) !important; }
        .swagger-ui .opblock-section-header { background: var(--fb-surface) !important; border-bottom: 1px solid var(--fb-border) !important; }
        .swagger-ui .opblock-section-header h4 { color: var(--fb-text) !important; }
        .swagger-ui table thead tr th { color: var(--fb-text-muted) !important; border-bottom: 1px solid var(--fb-border) !important; }
        .swagger-ui table tbody tr td { color: var(--fb-text) !important; border-bottom: 1px solid var(--fb-border) !important; }
        .swagger-ui .parameter__name { color: var(--fb-text) !important; }
        .swagger-ui .parameter__type { color: var(--fb-text-muted) !important; }
        .swagger-ui .response-col_status { color: var(--fb-text) !important; }
        .swagger-ui .response-col_description { color: var(--fb-text-muted) !important; }
        .swagger-ui .model-box { background: var(--fb-surface) !important; }
        .swagger-ui .model { color: var(--fb-text) !important; }
        .swagger-ui .model-title { color: var(--fb-text) !important; }
        .swagger-ui section.models { border: 1px solid var(--fb-border) !important; border-radius: 8px !important; }
        .swagger-ui section.models h4 { color: var(--fb-text) !important; }
        .swagger-ui .btn { border-radius: 6px !important; }
        .swagger-ui .btn.authorize { background: var(--fb-primary) !important; color: white !important; border-color: var(--fb-primary) !important; }
        .swagger-ui .btn.authorize svg { fill: white !important; }
        .swagger-ui .btn.execute { background: var(--fb-primary) !important; border-color: var(--fb-primary) !important; }
        .swagger-ui select { background: var(--fb-surface) !important; color: var(--fb-text) !important; border: 1px solid var(--fb-border) !important; border-radius: 6px !important; }
        .swagger-ui input[type=text] { background: var(--fb-surface) !important; color: var(--fb-text) !important; border: 1px solid var(--fb-border) !important; border-radius: 6px !important; }
        .swagger-ui textarea { background: var(--fb-surface) !important; color: var(--fb-text) !important; border: 1px solid var(--fb-border) !important; border-radius: 6px !important; }
        .swagger-ui .highlight-code { background: var(--fb-surface) !important; }
        .swagger-ui .highlight-code pre { color: var(--fb-text) !important; }
        .swagger-ui .responses-inner { background: transparent !important; }
        .swagger-ui .auth-wrapper { color: var(--fb-text) !important; }
        .swagger-ui .dialog-ux .modal-ux { background: var(--fb-surface) !important; border: 1px solid var(--fb-border) !important; }
        .swagger-ui .dialog-ux .modal-ux-header h3 { color: var(--fb-text) !important; }
        .swagger-ui .dialog-ux .modal-ux-content p { color: var(--fb-text-muted) !important; }
        .swagger-ui .wrapper { max-width: 1200px !important; padding: 0 24px !important; }
        .swagger-ui .servers > label { color: var(--fb-text) !important; }
        .swagger-ui .servers > label select { min-width: 320px; }
        .swagger-ui a { color: var(--fb-primary-hover) !important; }
    </style>
</head>
<body>
    <div class="fb-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="6" fill="#6366f1"/>
            <g transform="scale(0.7) translate(5.1 5.1)" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
                <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/>
                <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/>
                <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>
            </g>
        </svg>
        <h1>Frontbase Edge API</h1>
        <span class="badge badge-version">v${EDGE_VERSION}</span>
        <span class="badge badge-engine">${profile.badge}</span>
    </div>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        SwaggerUIBundle({
            url: '/api/openapi.json',
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIBundle.SwaggerUIStandalonePreset,
            ],
            layout: 'BaseLayout',
            defaultModelsExpandDepth: -1,
            docExpansion: 'list',
            filter: true,
            persistAuthorization: true,
        });
    </script>
</body>
</html>`);
  });
  return app2;
}
var liteApp = createLiteApp();
liteApp.get("/", (c) => c.json({
  service: "Frontbase Edge Engine",
  mode: "lite",
  status: "running",
  docs: "/api/docs",
  health: "/api/health"
}));

// src/ssr/staticAssets.ts
var HYDRATE_JS = "%%HYDRATE_JS%%";
var HYDRATE_CSS = "%%HYDRATE_CSS%%";
var FAVICON_PNG_B64 = "%%FAVICON_PNG_B64%%";

// src/routes/pages.ts
import { OpenAPIHono as OpenAPIHono16, createRoute as createRoute11, z as z18 } from "@hono/zod-openapi";

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
  const actionBindings = props.actionBindings;
  const propsAttr = actionBindings && actionBindings.length > 0 ? ` data-fb-props="${escapeHtml(JSON.stringify({ actionBindings }))}"` : "";
  return `id="${id}" class="${className}" style="${finalStyle}"${propsAttr}`;
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
    case "Embed":
      return renderEmbed(id, props);
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
function renderEmbed(id, props) {
  const embedType = props.embedType || "iframe";
  const width = props.width || "100%";
  const height = props.height || "400px";
  const title = escapeHtml(String(props.title || "Embedded content"));
  const loading = props.loading || "lazy";
  const containerStyle = `width:${width};height:${height};min-height:100px`;
  if (embedType === "iframe") {
    const src = props.src || "";
    const sandbox = escapeHtml(String(props.sandbox || "allow-scripts allow-same-origin allow-forms"));
    if (!src) {
      const attrs3 = getCommonAttributes(id, "fb-embed fb-embed-placeholder", props, `${containerStyle};display:flex;align-items:center;justify-content:center;background:#f5f5f5;border:2px dashed #ccc;border-radius:8px`);
      return `<div ${attrs3}><span style="color:#999">Iframe URL not set</span></div>`;
    }
    const attrs2 = getCommonAttributes(id, "fb-embed fb-embed-iframe", props, containerStyle);
    return `<div ${attrs2}>
            <iframe 
                src="${escapeHtml(src)}" 
                title="${title}" 
                width="100%" 
                height="100%" 
                style="border:none;border-radius:8px" 
                loading="${loading}" 
                sandbox="${sandbox}"
            ></iframe>
        </div>`;
  }
  const html = props.html || "";
  if (!html) {
    const attrs2 = getCommonAttributes(id, "fb-embed fb-embed-placeholder", props, `${containerStyle};display:flex;align-items:center;justify-content:center;background:#fffbeb;border:2px dashed #f59e0b;border-radius:8px`);
    return `<div ${attrs2}><span style="color:#92400e">Script embed code not set</span></div>`;
  }
  const attrs = getCommonAttributes(id, "fb-embed fb-embed-script", props, containerStyle);
  return `<div ${attrs}>${html}</div>`;
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
    case "AuthForm":
      return renderAuthForm(id, props, propsJson);
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
  const actionBindings = props.actionBindings || [];
  const onClickAction = actionBindings.find((b) => b.trigger === "onClick");
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
  let actionAttrs = "";
  if (onClickAction) {
    switch (onClickAction.actionType) {
      case "scrollToSection":
        if (onClickAction.config?.sectionId) {
          actionAttrs = `data-scroll-to="${escapeHtml2(onClickAction.config.sectionId)}"`;
        }
        break;
      case "openPage":
        if (onClickAction.config?.pageUrl) {
          const url = escapeHtml2(onClickAction.config.pageUrl);
          const newTab = onClickAction.config.openInNewTab;
          actionAttrs = `data-navigate-to="${url}"${newTab ? ' data-navigate-new-tab="true"' : ""}`;
        }
        break;
    }
  }
  const attrs = getCommonAttributes2(id, `fb-button fb-button-${variant}`, props, style, "button", propsJson);
  return `<button ${attrs} ${actionAttrs} ${disabled ? "disabled" : ""}>
        ${loading ? '<span class="fb-spinner" style="margin-right:0.5rem">\u23F3</span>' : ""}
        ${label}
    </button>`;
}
function renderLink(id, props, propsJson) {
  const text = escapeHtml2(String(props.text || props.label || props.children || "Link"));
  const href = escapeHtml2(String(props.href || props.to || "#"));
  const target = props.target || "_self";
  const color = props.color || "#3b82f6";
  const underline = props.underline !== false;
  const style = `color:${color};${underline ? "text-decoration:underline" : "text-decoration:none"};cursor:pointer`;
  const attrs = getCommonAttributes2(id, "fb-link", props, style, "link", propsJson);
  return `<a ${attrs} href="${href}" target="${target}">${text}</a>`;
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
function renderAuthForm(id, props, propsJson) {
  const formType = props.type || "both";
  const title = escapeHtml2(String(props.title || (formType === "signup" ? "Create an Account" : "Sign In")));
  const description = escapeHtml2(String(props.description || ""));
  const primaryColor = props.primaryColor || "#18181b";
  const providers = props.providers || [];
  const showToggle = formType === "both";
  const defaultIsLogin = formType !== "signup";
  const socialButtons = providers.map((p) => {
    const name = p.charAt(0).toUpperCase() + p.slice(1);
    return `<button type="button" class="fb-social-btn" data-provider="${p}" style="width:100%;padding:0.5rem;background:#fff;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.8125rem;cursor:pointer">Continue with ${name}</button>`;
  }).join("");
  const attrs = getCommonAttributes2(id, "fb-auth-form", props, "", "authform", propsJson);
  return `<div ${attrs}>
        <div style="max-width:400px;margin:0 auto;padding:2rem">
            <h2 style="margin:0 0 0.25rem;font-size:1.5rem;font-weight:700;color:#18181b;text-align:center">${title}</h2>
            ${description ? `<p style="margin:0 0 1.5rem;color:#71717a;font-size:0.875rem;text-align:center">${description}</p>` : '<div style="margin-bottom:1.5rem"></div>'}
            ${providers.length > 0 ? `
                <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem">${socialButtons}</div>
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">
                    <div style="flex:1;height:1px;background:#e4e4e7"></div>
                    <span style="color:#a1a1aa;font-size:0.75rem;text-transform:uppercase">or</span>
                    <div style="flex:1;height:1px;background:#e4e4e7"></div>
                </div>
            ` : ""}
            <div id="${id}-error" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:0.625rem;border-radius:0.375rem;font-size:0.8125rem;margin-bottom:0.75rem"></div>
            <form id="${id}-form" style="display:flex;flex-direction:column;gap:0.75rem">
                <div>
                    <label style="display:block;font-size:0.8125rem;font-weight:500;color:#374151;margin-bottom:0.25rem">Email</label>
                    <input type="email" required autocomplete="email" placeholder="you@example.com"
                        style="width:100%;padding:0.5rem 0.75rem;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.875rem;outline:none;box-sizing:border-box" />
                </div>
                <div>
                    <label style="display:block;font-size:0.8125rem;font-weight:500;color:#374151;margin-bottom:0.25rem">Password</label>
                    <input type="password" required autocomplete="${defaultIsLogin ? "current-password" : "new-password"}" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" minlength="6"
                        style="width:100%;padding:0.5rem 0.75rem;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.875rem;outline:none;box-sizing:border-box" />
                </div>
                <button type="submit"
                    style="width:100%;padding:0.625rem;background:${primaryColor};color:#fff;border:none;border-radius:0.375rem;font-size:0.875rem;font-weight:600;cursor:pointer">
                    ${defaultIsLogin ? "Sign In" : "Sign Up"}
                </button>
            </form>
            ${showToggle ? `
                <p style="text-align:center;margin-top:1rem;font-size:0.8125rem;color:#71717a">
                    ${defaultIsLogin ? "Don't have an account?" : "Already have an account?"}
                    <a href="#" style="color:${primaryColor};font-weight:500;text-decoration:none;margin-left:0.25rem" data-fb-toggle-auth>${defaultIsLogin ? "Sign Up" : "Sign In"}</a>
                </p>
            ` : ""}
        </div>
    </div>`;
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
  const hydrationProps = {
    ...props,
    mode: "edge",
    // IMPORTANT: Force edge mode to prevent components (like InfoList) from calling builder APIs
    _isEditorPreview: false
  };
  const propsJson = JSON.stringify(hydrationProps).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
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
  let columns = binding.columnOrder || props._columnOrder || props.columns || [];
  if (columns.length === 0) {
    const queryConfig = binding.dataRequest?.queryConfig;
    if (queryConfig?.columns && typeof queryConfig.columns === "string") {
      columns = queryConfig.columns.split(",").map((c) => c.trim()).map((c) => {
        const aliasMatch = c.match(/AS\s+"(.+)"/i);
        if (aliasMatch) return aliasMatch[1];
        const quotedMatch = c.match(/"[^"]*"\."([^"]+)"/);
        if (quotedMatch) return quotedMatch[1];
        return c.replace(/"/g, "").replace(/^\w+\./, "");
      }).filter((c) => c && c !== "*");
    }
  }
  const columnOverrides = binding.columnOverrides || {};
  const title = escapeHtml3(String(props.title || ""));
  const showPagination = binding.pagination?.enabled !== false;
  const pageSize = binding.pagination?.pageSize || props.pageSize || 10;
  const sortingEnabled = binding.sorting?.enabled !== false;
  const reactProps = {
    binding,
    tableName
  };
  const reactPropsJson = JSON.stringify(reactProps).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const headerCells = columns.length > 0 ? columns.slice(0, 8).map((col) => {
    const override = columnOverrides[col];
    const label = override?.label || override?.displayName || col;
    const sortIcon = sortingEnabled ? `<button class="h-auto p-1 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3 opacity-50"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg></button>` : "";
    return `<th class="h-12 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap group [&:has([role=checkbox])]:pr-0"><div class="flex items-center space-x-1"><span>${escapeHtml3(label)}</span>${sortIcon}</div></th>`;
  }).join("") : '<th class="h-12 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Column 1</th><th class="h-12 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Column 2</th><th class="h-12 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Column 3</th>';
  const numCols = columns.length > 0 ? Math.min(columns.length, 8) : 3;
  const skeletonRows = Array(Math.min(pageSize, 5)).fill(0).map(() => {
    return `<tr class="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted h-12">${Array(numCols).fill(0).map(
      () => '<td class="p-4 align-middle [&:has([role=checkbox])]:pr-0 max-w-[200px] truncate whitespace-nowrap py-2"><div class="fb-skeleton" style="height:1rem;width:80%;border-radius:0.25rem">&nbsp;</div></td>'
    ).join("")}</tr>`;
  }).join("");
  const searchEnabled = binding.filtering?.searchEnabled !== false;
  const searchHtml = searchEnabled ? `
        <div class="relative max-w-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search..." disabled class="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>` : "";
  const titleHtml = title ? `<h3 class="text-lg font-semibold">${title}</h3>` : "";
  return `<div id="${id}" class="space-y-4" data-react-component="DataTable" data-react-props="${escapeHtml3(reactPropsJson)}" data-component-id="${id}">
        ${titleHtml}
        ${searchHtml}
        <div class="rounded-md border overflow-auto relative">
            <table class="w-full text-sm">
                <thead class="[&_tr]:border-b">
                    <tr class="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">${headerCells}</tr>
                </thead>
                <tbody class="[&_tr:last-child]:border-0 [&_tr:nth-child(even)]:bg-muted/50">
                    ${skeletonRows}
                </tbody>
            </table>
        </div>
        ${showPagination ? `<div class="flex items-center justify-between px-2">
            <span class="text-sm text-muted-foreground fb-skeleton" style="width:100px;height:1rem">&nbsp;</span>
            <div class="flex items-center space-x-2">
                <button disabled class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 disabled:opacity-50">\u2190 Previous</button>
                <button disabled class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 disabled:opacity-50">Next \u2192</button>
            </div>
        </div>` : ""}
    </div>`;
}
function renderForm(id, props, childrenHtml, propsJson) {
  const binding = props.binding || {};
  const title = escapeHtml3(String(props.title || "Form"));
  const tableName = props._tableName || binding.tableName || props.tableName || props.table || "";
  const dataSourceId = props._dataSourceId || binding.dataSourceId || props.dataSourceId || "";
  const fieldOverrides = props._fieldOverrides || binding.fieldOverrides || props.fieldOverrides || {};
  const fieldOrder = props._fieldOrder || binding.fieldOrder || props.fieldOrder || [];
  const columns = props._columns || binding.columns || [];
  const foreignKeys = props._foreignKeys || binding.foreignKeys || [];
  const reactProps = {
    mode: "edge",
    binding: {
      ...binding,
      columns,
      foreignKeys,
      tableName,
      dataSourceId,
      fieldOverrides,
      fieldOrder
    },
    tableName,
    dataSourceId,
    fieldOverrides,
    fieldOrder,
    title: props.title || "",
    showCard: props.showCard !== false
  };
  const reactPropsJson = JSON.stringify(reactProps).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  let fieldsHtml;
  const orderedColumns = fieldOrder.length > 0 ? fieldOrder.map((name) => columns.find((c) => (typeof c === "string" ? c : c.name) === name) || name) : columns;
  if (orderedColumns.length > 0) {
    fieldsHtml = orderedColumns.map((col) => {
      const colName = typeof col === "string" ? col : col.name;
      const colType = typeof col === "object" ? col.type : "text";
      const override = fieldOverrides[colName] || {};
      if (override.hidden) return "";
      const label = override.label || colName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const isTextarea = colType === "text" && !override.type;
      const inputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50";
      const textareaClass = "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50";
      return `
                <div class="space-y-2">
                    <label class="text-sm font-medium leading-none">${escapeHtml3(label)}</label>
                    ${isTextarea ? `<textarea class="${textareaClass}" placeholder="${escapeHtml3(label)}" disabled></textarea>` : `<input class="${inputClass}" type="${override.type || "text"}" placeholder="${escapeHtml3(label)}" disabled />`}
                </div>`;
    }).join("");
  } else {
    fieldsHtml = Array(3).fill(0).map(() => `
            <div class="space-y-2">
                <div class="h-4 w-20 rounded bg-muted animate-pulse"></div>
                <div class="h-10 w-full rounded-md bg-muted animate-pulse"></div>
            </div>
        `).join("");
  }
  const styleAttr = ``;
  const wrapperClass = props.showCard !== false ? "rounded-lg border bg-card text-card-foreground shadow-sm" : "";
  const headerHtml = props.showCard !== false ? `<div class="flex flex-col space-y-1.5 p-6 pb-4">
               ${title ? `<h3 class="text-lg font-semibold leading-none tracking-tight">${title}</h3>` : ""}
           </div>` : title ? `<h3 class="text-lg font-semibold leading-none tracking-tight mb-4">${title}</h3>` : "";
  const contentPadding = props.showCard !== false ? "p-6 pt-0" : "";
  return `<div id="${id}" class="${wrapperClass}" data-react-component="Form" data-react-props="${escapeHtml3(reactPropsJson)}" data-component-id="${id}">
        ${headerHtml}
        <div class="${contentPadding}">
            <form class="space-y-4">
                <div class="space-y-4">
                    ${fieldsHtml}
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" class="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50" disabled>Cancel</button>
                    <button type="submit" class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50" disabled>Submit</button>
                </div>
            </form>
        </div>
    </div>`;
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
  const renderCtaButton = (text, link, actionBindings, isPrimary) => {
    if (!text) return "";
    const baseClasses = isPrimary ? "inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors" : "inline-flex items-center justify-center px-6 py-3 rounded-lg border border-input bg-background hover:bg-accent hover:text-accent-foreground font-medium transition-colors";
    const onClickAction = actionBindings?.find((b) => b.trigger === "onClick");
    if (onClickAction?.actionType === "scrollToSection" && onClickAction.config?.sectionId) {
      return `<button data-scroll-to="${escapeHtml4(onClickAction.config.sectionId)}" 
                     class="${baseClasses}">
                     ${escapeHtml4(text)}
                   </button>`;
    }
    if (onClickAction?.actionType === "openPage" && onClickAction.config?.pageUrl) {
      const target = onClickAction.config.openInNewTab ? "_blank" : "_self";
      const rel = onClickAction.config.openInNewTab ? "noopener noreferrer" : "";
      return `<a href="${escapeHtml4(onClickAction.config.pageUrl)}" 
                     target="${target}" ${rel ? `rel="${rel}"` : ""}
                     class="${baseClasses}">
                     ${escapeHtml4(text)}
                   </a>`;
    }
    return `<a href="${escapeHtml4(link || "#")}" 
                 class="${baseClasses}">
                 ${escapeHtml4(text)}
               </a>`;
  };
  const primaryCtaHtml = renderCtaButton(props.ctaText, props.ctaLink, props.ctaActionBindings || props.actionBindings, true);
  const secondaryCtaHtml = renderCtaButton(props.secondaryCtaText, props.secondaryCtaLink, props.secondaryCtaActionBindings, false);
  const ctaContainerHtml = props.ctaText || props.secondaryCtaText ? `<div class="${ctaContainerClasses}">${primaryCtaHtml}${secondaryCtaHtml}</div>` : "";
  return `
        <section id="${props.anchor || id}" class="${sectionClasses}" style="${combinedStyles}">
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
        <section id="${props.anchor || id}" class="${sectionClasses}" style="background-color: ${sectionBackground}; ${inlineStyles}">
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
        <section id="${props.anchor || id}" class="${sectionClasses}" style="${inlineStyles}">
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
        <section id="${props.anchor || id}" class="${sectionClasses}" style="${combinedStyles}">
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
function renderCtaLink(id, text, target, navType, variant) {
  const scrollAttr = navType === "scroll" ? `data-scroll-to="${escapeHtml4(target)}"` : "";
  const variantClasses = variant === "primary" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border hover:bg-accent";
  return `<a id="${id}" href="${escapeHtml4(target)}" ${scrollAttr}
       class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${variantClasses}">
        ${escapeHtml4(text)}
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
  const scale = props.scale || 1;
  const logoLink = logo.link || "/";
  let logoHtml;
  console.log("[Navbar SSR] Logo props:", {
    type: logo.type,
    showIcon: logo.showIcon,
    useProjectLogo: logo.useProjectLogo,
    imageUrl: logo.imageUrl ? logo.imageUrl.substring(0, 50) + "..." : "NOT SET",
    text: logo.text,
    scale
  });
  const logoHeight = `${2 * scale}rem`;
  const iconSize = `${1.5 * scale}rem`;
  const logoFontSize = `${1.25 * scale}rem`;
  if (logo.type === "image" && logo.imageUrl) {
    logoHtml = renderImage(`${id}-logo-img`, {
      src: logo.imageUrl,
      alt: "Logo",
      height: logoHeight,
      width: "auto",
      objectFit: "contain"
    });
  } else if (logo.showIcon && logo.imageUrl) {
    const iconImg = renderImage(`${id}-logo-icon`, {
      src: logo.imageUrl,
      alt: "Logo",
      height: iconSize,
      width: iconSize,
      objectFit: "contain"
    });
    const brandText = `<span id="${id}-logo-text" style="font-size: ${logoFontSize}; font-weight: 700;">${escapeHtml4(logo.text || "YourBrand")}</span>`;
    logoHtml = `${iconImg}${brandText}`;
  } else {
    logoHtml = `<span id="${id}-logo-text" style="font-size: ${logoFontSize}; font-weight: 700;">${escapeHtml4(logo.text || "YourBrand")}</span>`;
  }
  const menuFontSize = `${0.875 * scale}rem`;
  const menuItemsHtml = menuItems.map((item) => {
    const href = item.navType === "scroll" ? item.target : item.target;
    const scrollAttr = item.navType === "scroll" ? `data-scroll-to="${escapeHtml4(item.target)}"` : "";
    return `
            <a href="${escapeHtml4(href)}" ${scrollAttr} 
               class="font-medium text-muted-foreground hover:text-foreground transition-colors"
               style="font-size: ${menuFontSize};">
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
  const navPadding = `${1 * scale}rem`;
  const navGap = `${2 * scale}rem`;
  const menuGap = `${1.5 * scale}rem`;
  const buttonGap = `${0.75 * scale}rem`;
  return `
        <header id="${id}" class="${headerClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex items-center justify-between" style="padding: ${navPadding} 0;">
                    <!-- Logo -->
                    <a href="${escapeHtml4(logoLink)}" class="flex items-center gap-2">
                        ${logoHtml}
                    </a>
                    
                    <!-- Desktop Navigation + CTA Buttons grouped together -->
                    <div class="hidden md:flex items-center" style="gap: ${navGap};">
                        <nav class="flex items-center" style="gap: ${menuGap};">
                            ${menuItemsHtml}
                        </nav>
                        <div class="flex items-center" style="gap: ${buttonGap};">
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
  const logoHtml = renderText(`${id} -logo`, {
    text: props.logoText || "Logo",
    size: "xl",
    weight: "bold"
  });
  const desktopLinksHtml = (props.links || []).map((link) => `
        < a href = "${escapeHtml4(link.href)}" class="text-muted-foreground hover:text-foreground transition-colors" >
            ${escapeHtml4(link.text)}
    </a>
        `).join("");
  const mobileLinksHtml = (props.links || []).map((link) => `
        < a href = "${escapeHtml4(link.href)}" class="block py-2 text-muted-foreground hover:text-foreground transition-colors" >
            ${escapeHtml4(link.text)}
    </a>
        `).join("");
  const ctaHtml = props.ctaText ? renderCtaLink(`${id} -cta`, props.ctaText, props.ctaLink || "#", "link", "primary") : "";
  return `
        < header id = "${id}" class="${headerClasses}" style = "${inlineStyles}" >
            <div class="container mx-auto px-4 sm:px-6 lg:px-8" >
                <div class="flex items-center justify-between py-4" >
                    <!--Logo -->
                        <a href="/" class="flex items-center" >
                            ${logoHtml}
    </a>

        < !--Desktop Navigation-- >
            <nav class="hidden md:flex items-center gap-8" >
                ${desktopLinksHtml}
    </nav>

        < !--CTA + Mobile Menu-- >
            <div class="flex items-center gap-4" >
                ${ctaHtml}

    <!--Mobile Menu Button-- >
        <button type="button" class="md:hidden p-2 rounded-lg hover:bg-accent" data - fb - mobile - menu - toggle >
            <svg class="w-6 h-6" fill = "none" stroke = "currentColor" viewBox = "0 0 24 24" >
                <path stroke - linecap="round" stroke - linejoin="round" stroke - width="2" d = "M4 6h16M4 12h16M4 18h16" > </path>
                    </svg>
                    </button>
                    </div>
                    </div>

                    < !--Mobile Menu(hidden by default )-- >
                        <div class="md:hidden hidden pb-4" data - fb - mobile - menu >
                            <nav class="flex flex-col gap-1" >
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
        <section id="${props.anchor || id}" class="${sectionClasses}" style="${inlineStyles}">
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
            <section id="${props.anchor || id}" class="${sectionClasses}" style="${inlineStyles}">
                ${headerHtml}
                <div class="flex flex-wrap justify-center items-center gap-8 md:gap-12 text-center">
                    ${logosHtml}
                </div>
            </section>
        `.trim();
  }
  const originalLogosHtml = logos.map((logo, idx) => `
        <div class="logo-marquee-item px-6 md:px-8">
            ${renderItem(logo, idx)}
        </div>
    `).join("");
  const duplicateLogosHtml = logos.map((logo, idx) => `
        <div class="logo-marquee-item logo-duplicate px-6 md:px-8">
            ${renderItem(logo, idx)}
        </div>
    `).join("");
  const duplicatedLogosHtml = originalLogosHtml + duplicateLogosHtml;
  const pauseClass = pauseOnHover ? "logo-marquee-pause-on-hover" : "";
  const mobileOnlyClass = displayMode === "marqueeOnMobile" ? "logo-marquee-mobile-only" : "";
  return `
        <section id="${props.anchor || id}" class="${sectionClasses} overflow-hidden ${mobileOnlyClass}" style="${inlineStyles}">
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
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  discord: '<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>',
  tiktok: '<path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>',
  reddit: '<circle cx="12" cy="12" r="10"/><path d="M14.5 17c-1.38 0-2.49-.89-3-2h6c-.51 1.11-1.62 2-3 2z"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><path d="M12 2a10 10 0 0 1 10 10"/><circle cx="18" cy="5" r="2"/>',
  threads: '<path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z"/><path d="M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0z"/>',
  twitch: '<path d="M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7"/>',
  pinterest: '<circle cx="12" cy="12" r="10"/><path d="M8.56 14.64a4 4 0 0 0 6.88 0"/><line x1="12" y1="2" x2="12" y2="9"/>',
  snapchat: '<path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17l3-2 3 2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"/>'
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
  const mobileColsClass = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3"
  };
  const gridColsClass = mobileColsClass[props.mobileColumns || 1] || "grid-cols-1";
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
                    <div class="grid ${gridColsClass} gap-6 sm:grid-cols-2 md:grid-cols-3 lg:flex lg:gap-12">
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
import { Liquid as Liquid2 } from "liquidjs";
var liquid = new Liquid2({
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

// src/ssr/styleHelpers.ts
var UNITLESS_PROPS = /* @__PURE__ */ new Set([
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
]);
function toKebab(key) {
  return key.replace(/([A-Z])/g, "-$1").toLowerCase();
}
function maybeAddPx(cssKey, value) {
  const v = String(value);
  if (/^-?\d+(\.\d+)?$/.test(v) && !UNITLESS_PROPS.has(cssKey)) {
    return v + "px";
  }
  return v;
}
var BASIC_PROP_MAP = {
  padding: "padding",
  margin: "margin",
  width: "width",
  height: "height",
  maxWidth: "max-width",
  minWidth: "min-width",
  backgroundColor: "background-color",
  color: "color"
};
var EXTENDED_PROP_MAP = {
  ...BASIC_PROP_MAP,
  maxHeight: "max-height",
  minHeight: "min-height",
  background: "background",
  border: "border",
  borderRadius: "border-radius",
  boxShadow: "box-shadow",
  opacity: "opacity",
  overflow: "overflow"
};
function processStyleEntry(key, value, emit, formatValue = (k, v) => maybeAddPx(k, v)) {
  if (value === void 0 || value === null || value === "") return;
  if (key === "size" && typeof value === "object") {
    const sizeObj = value;
    if (sizeObj.width !== void 0 && sizeObj.width !== "auto") {
      const widthUnit = sizeObj.widthUnit || "px";
      emit("width", formatValue("width", sizeObj.width + widthUnit));
    }
    if (sizeObj.height !== void 0 && sizeObj.height !== "auto") {
      const heightUnit = sizeObj.heightUnit || "px";
      emit("height", formatValue("height", sizeObj.height + heightUnit));
    }
    return;
  }
  if ((key === "padding" || key === "margin") && typeof value === "object") {
    const boxObj = value;
    if (boxObj.top !== void 0) emit(`${key}-top`, formatValue(`${key}-top`, boxObj.top + "px"));
    if (boxObj.right !== void 0) emit(`${key}-right`, formatValue(`${key}-right`, boxObj.right + "px"));
    if (boxObj.bottom !== void 0) emit(`${key}-bottom`, formatValue(`${key}-bottom`, boxObj.bottom + "px"));
    if (boxObj.left !== void 0) emit(`${key}-left`, formatValue(`${key}-left`, boxObj.left + "px"));
    return;
  }
  if (key === "horizontalAlign" && typeof value === "string") {
    if (value === "center") {
      emit("margin-left", formatValue("margin-left", "auto"));
      emit("margin-right", formatValue("margin-right", "auto"));
    } else if (value === "right") {
      emit("margin-left", formatValue("margin-left", "auto"));
      emit("margin-right", formatValue("margin-right", "0"));
    } else {
      emit("margin-left", formatValue("margin-left", "0"));
      emit("margin-right", formatValue("margin-right", "auto"));
    }
    return;
  }
  if (typeof value === "object") return;
  const cssKey = toKebab(key);
  emit(cssKey, formatValue(cssKey, String(value)));
}
function buildInlineStyles(props, styles) {
  const cssProps = {};
  for (const [prop, css] of Object.entries(BASIC_PROP_MAP)) {
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
    processStyleEntry(key, value, (cssKey, cssValue) => {
      cssProps[cssKey] = cssValue;
    });
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
      processStyleEntry(key, value, (cssKey, cssValue) => {
        props.push(`${cssKey}:${cssValue} !important`);
      }, (_k, v) => String(v));
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
  for (const [prop, css] of Object.entries(EXTENDED_PROP_MAP)) {
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
  "MarkdownContent",
  "Embed"
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
      const { getFaviconUrl } = await import("./project-settings-TNEKQFVJ.js");
      const faviconUrl = await getFaviconUrl();
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
  const className = buildClassName("fb-layout", `fb-${type.toLowerCase()}`, props.className);
  const elementId = props.anchor || id;
  const responsiveCSS = buildResponsiveCSS(id, styles);
  const visibilityCSS = buildVisibilityCSS(id, visibility);
  const combinedCSS = responsiveCSS + visibilityCSS;
  const actionBindings = props.actionBindings;
  const propsAttr = actionBindings && actionBindings.length > 0 ? ` data-fb-props="${escapeHtml4(JSON.stringify({ actionBindings }))}"` : "";
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
        return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} ${responsiveGridClass}" style="margin:0 auto;width:100%;${gridGapStyle}${inlineStyle.replace(/display:\s*grid[^;]*;?/gi, "").replace(/grid-template-columns[^;]*;?/gi, "")}">${childrenHtml}</div>`;
      }
      return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className}" style="margin:0 auto;width:100%;${inlineStyle}">${childrenHtml}</div>`;
    case "Section":
      return `${combinedCSS}<section id="${elementId}"${propsAttr} class="${className}" style="${inlineStyle}">${childrenHtml}</section>`;
    case "Row":
      return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} fb-row flex flex-col md:flex-row" style="width:100%;min-height:50px;${inlineStyle}">${childrenHtml}</div>`;
    case "Column":
      return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} fb-column" style="display:flex;flex-direction:column;min-height:50px;min-width:50px;${inlineStyle}">${childrenHtml}</div>`;
    case "Flex":
      const flexDirection = styles.flexDirection || props.direction || "row";
      const justify = styles.justifyContent || props.justify || "flex-start";
      const align = styles.alignItems || props.align || "stretch";
      const gap = styles.gap || props.gap || "0";
      return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className}" style="display:flex;flex-direction:${flexDirection};justify-content:${justify};align-items:${align};gap:${gap};${inlineStyle}">${childrenHtml}</div>`;
    case "Grid":
      const columns = props.columns || 2;
      const gridGap = styles.gap || props.gap || "1rem";
      const gridResponsiveClass = columns <= 2 ? "grid grid-cols-1 md:grid-cols-2" : columns === 3 ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(columns, 4)}`;
      return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} ${gridResponsiveClass}" style="gap:${gridGap};${inlineStyle}">${childrenHtml}</div>`;
    case "Stack":
      const stackGap = styles.gap || props.gap || "1rem";
      return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className}" style="display:flex;flex-direction:column;gap:${stackGap};${inlineStyle}">${childrenHtml}</div>`;
    case "Box":
    case "Paper":
    case "Panel":
    case "Group":
    default:
      return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className}" style="${inlineStyle}">${childrenHtml}</div>`;
  }
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
        let cssValue = String(value);
        const unitlessProps = [
          "opacity",
          "z-index",
          "flex",
          "flex-grow",
          "flex-shrink",
          "order",
          "line-height",
          "font-weight"
        ];
        if (/^-?\d+(\.\d+)?$/.test(cssValue) && !unitlessProps.includes(cssKey)) {
          cssValue += "px";
        }
        styleParts.push(`${cssKey}:${cssValue}`);
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
  let badgeHtml = "";
  const edition = process.env.FRONTBASE_EDITION || "community";
  if (edition === "community" && !process.env.FRONTBASE_LICENSE_KEY) {
    const signOutHtml = context.user ? `
            <div style="position:fixed;bottom:48px;right:16px;z-index:9999;font-family:system-ui,-apple-system,sans-serif;">
                <button onclick="frontbase.signOut()" style="display:flex;align-items:center;gap:5px;background:white;padding:5px 10px;border-radius:6px;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);border:1px solid #e5e7eb;color:#374151;font-size:12px;font-weight:500;cursor:pointer;transition:all 0.2s;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    <span>Sign Out</span>
                </button>
            </div>
        ` : "";
    badgeHtml = `${signOutHtml}
            <div style="position:fixed;bottom:16px;right:16px;z-index:9999;font-family:system-ui,-apple-system,sans-serif;">
                <a href="https://frontbase.dev?ref=badge" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:6px;background:white;padding:6px 10px;border-radius:6px;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);text-decoration:none;color:#374151;font-size:12px;font-weight:500;border:1px solid #e5e7eb;transition:all 0.2s;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Powered by Frontbase</span>
                </a>
            </div>
        `;
  }
  return `<div class="fb-page ${rootClass}" style="${rootStyle}">${contentHtml}${badgeHtml}</div>`;
}

// src/ssr/lib/auth.ts
init_env();
var _provider = void 0;
async function getAuthProvider() {
  if (_provider !== void 0) return _provider;
  const authCfg = getAuthConfig();
  if (authCfg.provider === "supabase" && authCfg.url && authCfg.anonKey) {
    const { SupabaseAuthProvider: SupabaseAuthProvider2 } = await import("./SupabaseAuthProvider-72ZS2KN2.js");
    _provider = new SupabaseAuthProvider2();
    console.log(`[Auth Factory] Resolved SupabaseAuthProvider from FRONTBASE_AUTH: ${authCfg.url.substring(0, 30)}...`);
    return _provider;
  }
  _provider = null;
  return null;
}
async function getUserFromSession(request) {
  const provider = await getAuthProvider();
  if (!provider) return null;
  return provider.getUserFromRequest(request);
}
async function refreshSession(request) {
  const provider = await getAuthProvider();
  if (!provider) return { user: null, setCookieHeaders: [] };
  return provider.refreshSession(request);
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
  const cookies = parseCookies(request.headers.get("Cookie") || "");
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
function parseCookies(cookieHeader) {
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
  const cookies = parseCookies(headers.get("Cookie") || "");
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

// src/ssr/baseStyles.ts
var FALLBACK_CSS = `
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
.dark {
    --background: 224 71% 4%;
    --foreground: 213 31% 91%;
    --muted: 223 47% 11%;
    --muted-foreground: 215 20% 65%;
    --popover: 224 71% 4%;
    --popover-foreground: 213 31% 91%;
    --card: 224 71% 4%;
    --card-foreground: 213 31% 91%;
    --border: 216 34% 17%;
    --input: 216 34% 17%;
    --primary: 210 40% 98%;
    --primary-foreground: 222 47% 11%;
    --secondary: 222 47% 11%;
    --secondary-foreground: 210 40% 98%;
    --accent: 216 34% 17%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 63% 31%;
    --destructive-foreground: 210 40% 98%;
    --ring: 216 34% 17%;
}
*, *::before, *::after { box-sizing: border-box; }
html { background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
.fb-page { min-height: 100vh; width: 100%; overflow-x: hidden; display: flex; flex-direction: column; }
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
/* Hide duplicate logos on desktop (duplicates are for seamless marquee on mobile) */
.logo-marquee-mobile-only .logo-marquee-item.logo-duplicate { display: none; }
@media (max-width: 640px) {
    .logo-marquee-mobile-only .logo-marquee-track { animation: marquee-scroll var(--marquee-speed, 20s) linear infinite; flex-wrap: nowrap; justify-content: flex-start; gap: 0; width: max-content; }
    .logo-marquee-mobile-only .logo-marquee-container { mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); }
    /* Show all logos (including duplicates) on mobile for seamless marquee */
    .logo-marquee-mobile-only .logo-marquee-item.logo-duplicate { display: flex; }
}
/* Dark mode: invert raster images in Navbar and LogoCloud */
.dark .fb-navbar img:not(.no-invert),
.dark .fb-logo-cloud img:not(.no-invert) { filter: invert(1) brightness(1.1); }
/* DataTable fallback */
.fb-datatable { border-radius: var(--radius, 0.5rem); border: 1px solid hsl(var(--border)); background-color: hsl(var(--background)); overflow: hidden; }
.fb-datatable-header { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.5rem; }
.fb-datatable-title { font-size: 1.25rem; font-weight: 600; line-height: 1; margin: 0; }
.fb-datatable-search { position: relative; max-width: 24rem; }
.fb-datatable-search input { width: 100%; height: 2.5rem; padding: 0 0.75rem 0 2.25rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius, 0.5rem); font-size: 0.875rem; background: transparent; color: hsl(var(--foreground)); }
.fb-datatable-search svg { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); width: 1rem; height: 1rem; color: hsl(var(--muted-foreground)); }
.fb-datatable-content { padding: 0 1.5rem 1.5rem; }
.fb-datatable-scroll { overflow-x: auto; border: 1px solid hsl(var(--border)); border-radius: var(--radius, 0.5rem); }
.fb-table { width: 100%; font-size: 0.875rem; border-collapse: collapse; }
.fb-table-header { border-bottom: 1px solid hsl(var(--border)); }
.fb-table-header th { height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: hsl(var(--muted-foreground)); white-space: nowrap; }
.fb-table-body tr { border-bottom: 1px solid hsl(var(--border)); transition: background-color 0.15s; }
.fb-table-body tr:last-child { border-bottom: 0; }
.fb-table-body tr:hover { background-color: hsl(var(--muted) / 0.5); }
.fb-table-body td { padding: 1rem; vertical-align: middle; }
.fb-datatable-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 1rem 1.5rem; font-size: 0.875rem; color: hsl(var(--muted-foreground)); }
.fb-datatable-pagination .fb-pagination-btns { display: flex; align-items: center; gap: 0.5rem; }
.fb-datatable-pagination button { display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.75rem; height: 2.25rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius, 0.5rem); background: transparent; font-size: 0.875rem; cursor: pointer; color: hsl(var(--foreground)); }
.fb-datatable-pagination button:disabled { opacity: 0.5; pointer-events: none; }
/* Form fallback */
.fb-form { border-radius: var(--radius, 0.5rem); border: 1px solid hsl(var(--border)); background-color: hsl(var(--background)); }
.fb-form-header { padding: 1.5rem; }
.fb-form-title { font-size: 1.125rem; font-weight: 600; line-height: 1; margin: 0; }
.fb-form-content { padding: 0 1.5rem 1.5rem; }
.fb-form-field { margin-bottom: 1.25rem; }
.fb-form-label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.375rem; color: hsl(var(--foreground)); }
.fb-input { display: flex; width: 100%; height: 2.5rem; padding: 0 0.75rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius, 0.5rem); font-size: 0.875rem; background: transparent; color: hsl(var(--foreground)); }
.fb-textarea { display: flex; width: 100%; min-height: 5rem; padding: 0.5rem 0.75rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius, 0.5rem); font-size: 0.875rem; background: transparent; color: hsl(var(--foreground)); resize: vertical; }
.fb-form-actions { display: flex; gap: 0.75rem; padding: 0 1.5rem 1.5rem; }
`;

// src/ssr/htmlDocument.ts
var HYDRATE_VERSION = "20260404a";
var DEFAULT_FAVICON = "/static/icon.png";
function generateHtmlDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl = DEFAULT_FAVICON, authConfig) {
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
    
    <!-- Prefetch hydration bundle -->
    <link rel="modulepreload" href="/static/react/hydrate.js?v=${HYDRATE_VERSION}">

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
    
    <!-- Base styles (from CSS Bundle or fallback) -->
    <style>
        ${page.cssBundle || FALLBACK_CSS}
    </style>
</head>
<body>
    <div id="root">${bodyHtml}</div>
    <!-- Initial state for hydration -->
    <script>
        window.__INITIAL_STATE__ = ${safeJsonStringify(initialState)};
        window.__PAGE_DATA__ = ${safeJsonStringify({
    id: page.id,
    slug: page.slug,
    layoutData: page.layoutData,
    datasources: page.datasources
  })};
    </script>
    
    <!-- Frontbase Client SDK -->
    <script>
        // Initialize window.frontbase SDK
        (function() {
            var STORAGE_KEY = 'frontbase_user';

            // Sync SSR user state to localStorage
            try {
                var state = window.__INITIAL_STATE__;
                if (state && state.user) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.user));
                } else {
                    localStorage.removeItem(STORAGE_KEY);
                }
            } catch (e) {
                console.warn('[Frontbase] Failed to sync user to localStorage:', e);
            }

            // Public SDK
            window.frontbase = {
                _channel: null,
                _supabase: null,

                get user() {
                    try {
                        var raw = localStorage.getItem(STORAGE_KEY);
                        return raw ? JSON.parse(raw) : null;
                    } catch (e) { return null; }
                },

                signOut: function(redirectTo) {
                    // 1. Unsubscribe Realtime
                    if (this._channel && this._supabase) {
                        this._supabase.removeChannel(this._channel);
                        this._channel = null;
                    }
                    // 2. Clear localStorage
                    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
                    // 3. POST to logout endpoint
                    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
                        .finally(function() {
                            window.location.href = redirectTo || '/';
                        });
                }
            };
        })();
    </script>
${authConfig ? `
    <!-- Supabase Realtime (async, only for logged-in users) -->
    <script>
    (function() {
        var user = window.__INITIAL_STATE__ && window.__INITIAL_STATE__.user;
        if (!user) return;

        var cfg = ${safeJsonStringify(authConfig)};
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        script.async = true;
        script.onload = function() {
            try {
                var sb = supabase.createClient(cfg.url, cfg.anonKey);
                window.frontbase._supabase = sb;

                // Set authenticated session so Realtime has RLS permissions
                if (cfg.accessToken) {
                    sb.realtime.setAuth(cfg.accessToken);
                }

                var channel = sb.channel('user-contact-' + user.id)
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: cfg.contactsTable,
                        filter: cfg.authUserIdColumn + '=eq.' + user.id
                    }, function(payload) {
                        console.log('[Frontbase] Realtime UPDATE:', payload.new);
                        var current = window.frontbase.user || {};
                        var merged = Object.assign({}, current, payload.new);
                        try {
                            localStorage.setItem('frontbase_user', JSON.stringify(merged));
                        } catch (e) {}

                        // Soft refresh: re-fetch page and swap #root content
                        fetch(window.location.href, { credentials: 'same-origin' })
                            .then(function(r) { return r.text(); })
                            .then(function(html) {
                                var parser = new DOMParser();
                                var doc = parser.parseFromString(html, 'text/html');
                                var newRoot = doc.getElementById('root');
                                var oldRoot = document.getElementById('root');
                                if (newRoot && oldRoot) {
                                    oldRoot.innerHTML = newRoot.innerHTML;
                                    console.log('[Frontbase] Page content refreshed with new user data');
                                }
                            })
                            .catch(function(err) {
                                console.warn('[Frontbase] Soft refresh failed:', err);
                            });

                        window.dispatchEvent(new CustomEvent('frontbase:user-updated', { detail: merged }));
                    })
                    .subscribe(function(status) {
                        console.log('[Frontbase] Realtime status:', status);
                    });

                window.frontbase._channel = channel;
            } catch (err) {
                console.warn('[Frontbase] Realtime setup failed:', err);
            }
        };
        document.head.appendChild(script);
    })();
    </script>
` : ""}
    <!-- Hydration bundle (all interactive components) -->
    <script type="module" src="/static/react/hydrate.js?v=${HYDRATE_VERSION}"></script>
</body>
</html>`;
}
function safeJsonStringify(obj) {
  return JSON.stringify(obj).replace(/<\/script>/gi, "<\\/script>").replace(/<!--/g, "<\\!--");
}
function escapeHtml5(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// src/ssr/gatedPage.ts
function generateGatedPageDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl, authFormConfig) {
  const normalHtml = generateHtmlDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl ?? void 0);
  const formConfig = authFormConfig || {
    type: "both",
    title: "Welcome",
    showLinks: true
  };
  const currentPath = page.isHomepage ? "/" : `/${page.slug}`;
  const authOverlayHtml = buildAuthOverlay(formConfig, currentPath);
  const modifiedHtml = normalHtml.replace(
    /<div id="root">/,
    '<div id="root" style="filter:blur(8px);pointer-events:none;user-select:none;-webkit-filter:blur(8px)">'
  ).replace(
    "</body>",
    `${authOverlayHtml}
</body>`
  );
  return modifiedHtml;
}
function buildAuthOverlay(config, currentPath = "/") {
  const primaryColor = config.primaryColor || "#18181b";
  const title = config.title || (config.type === "signup" ? "Create an Account" : "Sign In");
  const description = config.description || "";
  const showToggle = config.type === "both";
  const defaultIsLogin = config.type !== "signup";
  const socialButtons = (config.providers || []).map((provider) => {
    const name = provider.charAt(0).toUpperCase() + provider.slice(1);
    return `<button type="button" class="fb-social-btn" data-provider="${provider}">
            Continue with ${name}
        </button>`;
  }).join("\n");
  const hasSocial = (config.providers || []).length > 0;
  return `
<!-- Frontbase Auth Overlay (Private Page Gating) -->
<div id="fb-auth-overlay" style="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1rem">

<!-- Toast notification -->
<div id="fb-auth-toast" style="position:fixed;top:1.5rem;left:50%;transform:translateX(-50%);background:#18181b;color:#fff;padding:0.75rem 1.5rem;border-radius:0.5rem;font-size:0.875rem;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:100000;animation:fb-toast-in 0.5s ease-out">
    Please log in or sign up to access this page
</div>

<!-- Auth Card -->
<div style="background:#fff;border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-width:400px;width:100%;padding:2rem;font-family:system-ui,-apple-system,sans-serif;animation:fb-card-in 0.4s ease-out">

    ${config.logoUrl ? `<div style="text-align:center;margin-bottom:1.5rem"><img src="${escapeHtml6(config.logoUrl)}" alt="Logo" style="max-height:48px;max-width:200px"></div>` : ""}

    <h2 id="fb-auth-title" style="margin:0 0 0.25rem;font-size:1.5rem;font-weight:700;color:#18181b;text-align:center">${escapeHtml6(title)}</h2>
    ${description ? `<p style="margin:0 0 1.5rem;color:#71717a;font-size:0.875rem;text-align:center">${escapeHtml6(description)}</p>` : '<div style="margin-bottom:1.5rem"></div>'}

    ${hasSocial ? `
    <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem">
        ${socialButtons}
    </div>
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">
        <div style="flex:1;height:1px;background:#e4e4e7"></div>
        <span style="color:#a1a1aa;font-size:0.75rem;text-transform:uppercase">or</span>
        <div style="flex:1;height:1px;background:#e4e4e7"></div>
    </div>
    ` : ""}

    <div id="fb-auth-error" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:0.625rem;border-radius:0.375rem;font-size:0.8125rem;margin-bottom:0.75rem"></div>

    <form id="fb-auth-form" action="/api/auth/login" method="POST" style="display:flex;flex-direction:column;gap:0.75rem">
        <input type="hidden" name="redirectTo" value="${escapeHtml6(currentPath)}">
        <div>
            <label for="fb-email" style="display:block;font-size:0.8125rem;font-weight:500;color:#374151;margin-bottom:0.25rem">Email</label>
            <input id="fb-email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"
                style="width:100%;padding:0.5rem 0.75rem;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.875rem;outline:none;transition:border-color 0.2s;box-sizing:border-box"
                onfocus="this.style.borderColor='${primaryColor}'" onblur="this.style.borderColor='#d4d4d8'">
        </div>
        <div>
            <label for="fb-password" style="display:block;font-size:0.8125rem;font-weight:500;color:#374151;margin-bottom:0.25rem">Password</label>
            <input id="fb-password" name="password" type="password" required autocomplete="current-password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" minlength="6"
                style="width:100%;padding:0.5rem 0.75rem;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.875rem;outline:none;transition:border-color 0.2s;box-sizing:border-box"
                onfocus="this.style.borderColor='${primaryColor}'" onblur="this.style.borderColor='#d4d4d8'">
        </div>
        <button id="fb-auth-submit" type="submit"
            style="width:100%;padding:0.625rem;background:${primaryColor};color:#fff;border:none;border-radius:0.375rem;font-size:0.875rem;font-weight:600;cursor:pointer;transition:opacity 0.2s"
            onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
            ${defaultIsLogin ? "Sign In" : "Sign Up"}
        </button>
    </form>

    ${showToggle ? `
    <p id="fb-auth-toggle" style="text-align:center;margin-top:1rem;font-size:0.8125rem;color:#71717a">
        <span id="fb-toggle-text">${defaultIsLogin ? "Don't have an account?" : "Already have an account?"}</span>
        <a href="#" id="fb-toggle-link" style="color:${primaryColor};font-weight:500;text-decoration:none;margin-left:0.25rem"
            onclick="fbToggleMode();return false">${defaultIsLogin ? "Sign Up" : "Sign In"}</a>
    </p>
    ` : ""}

</div>
</div>

<style>
@keyframes fb-toast-in{from{opacity:0;transform:translateX(-50%) translateY(-1rem)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@keyframes fb-card-in{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
.fb-social-btn{width:100%;padding:0.5rem;background:#fff;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.8125rem;cursor:pointer;transition:background 0.2s;font-family:inherit}
.fb-social-btn:hover{background:#f4f4f5}
</style>

<script>
(function(){
    var isLoginMode = ${defaultIsLogin ? "true" : "false"};
    var form = document.getElementById('fb-auth-form');
    var errorDiv = document.getElementById('fb-auth-error');
    var submitBtn = document.getElementById('fb-auth-submit');

    // Show error from URL params (server-side redirect on auth failure)
    var urlParams = new URLSearchParams(window.location.search);
    var authError = urlParams.get('auth_error');
    var authMessage = urlParams.get('auth_message');
    if (authError) {
        errorDiv.textContent = authError;
        errorDiv.style.display = 'block';
    }
    if (authMessage) {
        errorDiv.style.background = '#f0fdf4';
        errorDiv.style.borderColor = '#bbf7d0';
        errorDiv.style.color = '#16a34a';
        errorDiv.textContent = authMessage;
        errorDiv.style.display = 'block';
    }

    // Loading state on submit
    form.addEventListener('submit', function() {
        submitBtn.disabled = true;
        submitBtn.textContent = isLoginMode ? 'Signing in...' : 'Signing up...';
    });

    // Toggle login/signup mode
    window.fbToggleMode = function() {
        isLoginMode = !isLoginMode;
        form.action = isLoginMode ? '/api/auth/login' : '/api/auth/signup';
        document.getElementById('fb-auth-title').textContent = isLoginMode ? '${escapeHtml6(config.type === "both" ? "Welcome Back" : title)}' : 'Create an Account';
        submitBtn.textContent = isLoginMode ? 'Sign In' : 'Sign Up';
        document.getElementById('fb-toggle-text').textContent = isLoginMode ? "Don't have an account?" : 'Already have an account?';
        document.getElementById('fb-toggle-link').textContent = isLoginMode ? 'Sign Up' : 'Sign In';
        document.getElementById('fb-password').autocomplete = isLoginMode ? 'current-password' : 'new-password';
    };

    // Auto-dismiss toast after 5s
    setTimeout(function() {
        var toast = document.getElementById('fb-auth-toast');
        if (toast) toast.style.opacity = '0';
        setTimeout(function() { if (toast) toast.remove(); }, 500);
    }, 5000);
})();
</script>`;
}
function escapeHtml6(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// src/routes/pages.ts
init_env();
var DEFAULT_FAVICON2 = "/static/icon.png";
var SETTINGS_TTL_MS = 3e4;
var SETTINGS_TIMEOUT_MS = 3e3;
var _settingsCache = null;
async function getCachedSettings(sessionAccessToken) {
  if (_settingsCache && Date.now() - _settingsCache.ts < SETTINGS_TTL_MS) {
    if (sessionAccessToken && _settingsCache.authConfig) {
      return { ..._settingsCache, authConfig: { ..._settingsCache.authConfig, accessToken: sessionAccessToken } };
    }
    return _settingsCache;
  }
  try {
    const settings = await Promise.race([
      stateProvider.getProjectSettings(),
      new Promise(
        (_, reject) => setTimeout(() => reject(new Error("settings_timeout")), SETTINGS_TIMEOUT_MS)
      )
    ]);
    let authConfig = null;
    const authEnv = getAuthConfig();
    if (authEnv.contacts?.table && authEnv.url && authEnv.anonKey) {
      authConfig = {
        url: authEnv.url,
        anonKey: authEnv.anonKey,
        contactsTable: authEnv.contacts.table,
        authUserIdColumn: authEnv.contacts.columnMapping?.authUserIdColumn || "auth_user_id",
        accessToken: sessionAccessToken
      };
    }
    _settingsCache = {
      faviconUrl: settings?.faviconUrl || DEFAULT_FAVICON2,
      authConfig,
      ts: Date.now()
    };
    return _settingsCache;
  } catch (e) {
    console.warn("[Pages] Settings fetch failed/timeout:", e.message);
    return {
      faviconUrl: _settingsCache?.faviconUrl || DEFAULT_FAVICON2,
      authConfig: null,
      ts: Date.now()
    };
  }
}
var ErrorResponseSchema2 = z18.object({
  error: z18.string(),
  message: z18.string().optional()
});
var pagesRoute = new OpenAPIHono16();
pagesRoute.use("*", async (c, next) => {
  await next();
  const ct = c.res.headers.get("Content-Type");
  if (ct) {
    c.res.headers.set("X-Content-Type", ct);
  }
});
var renderPageRoute = createRoute11({
  method: "get",
  path: "/:slug",
  tags: ["Pages"],
  summary: "Render a published page",
  description: "Server-side renders a published page by slug. Returns full HTML document.",
  request: {
    params: z18.object({
      slug: z18.string().min(1).describe("Page slug")
    })
  },
  responses: {
    200: {
      description: "Rendered HTML page",
      content: {
        "text/html": {
          schema: z18.string()
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
async function fetchPage(slug) {
  const cacheKey = `page:${slug}`;
  try {
    const { getRedis: getRedis2 } = await import("./redis-E24KJZFG.js");
    const redis = getRedis2();
    const cached2 = await redis.get(cacheKey);
    if (cached2) {
      console.log(`[SSR] Cache HIT: ${slug}`);
      return cached2;
    }
  } catch {
  }
  let page = null;
  try {
    const publishedPage = await stateProvider.getPageBySlug(slug);
    if (publishedPage) {
      console.log(`[SSR] Found published page: ${slug} (v${publishedPage.version})`);
      page = {
        id: publishedPage.id,
        name: publishedPage.name,
        slug: publishedPage.slug,
        title: publishedPage.title,
        description: publishedPage.description,
        isPublic: publishedPage.isPublic,
        isHomepage: publishedPage.isHomepage,
        layoutData: publishedPage.layoutData,
        cssBundle: publishedPage.cssBundle,
        createdAt: publishedPage.publishedAt,
        updatedAt: publishedPage.publishedAt
      };
    }
  } catch (error) {
    console.warn("[SSR] Error reading local storage:", error);
  }
  if (!page) {
    const apiBase = process.env.BACKEND_URL || "http://127.0.0.1:8000";
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
      page = result.success ? result.data : null;
    } catch (error) {
      console.error("Error fetching page from FastAPI:", error);
      return null;
    }
  }
  if (page) {
    try {
      const { getRedis: getRedis2 } = await import("./redis-E24KJZFG.js");
      const redis = getRedis2();
      await redis.setex(cacheKey, 60, JSON.stringify(page));
      console.log(`[SSR] Cache SET: ${slug} (60s TTL)`);
    } catch {
    }
  }
  return page;
}
async function fetchTrackingConfig() {
  const apiBase = process.env.BACKEND_URL || "http://127.0.0.1:8000";
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
pagesRoute.openapi(renderPageRoute, async (c) => {
  const { slug } = c.req.param();
  const page = await fetchPage(slug);
  if (!page) {
    return c.json(
      { error: "Page not found", message: `No page found with slug: ${slug}` },
      404
    );
  }
  if (page.isHomepage) {
    return c.redirect("/", 301);
  }
  let sessionAccessToken;
  if (!page.isPublic) {
    const refreshResult = await refreshSession(c.req.raw);
    const { user, setCookieHeaders } = refreshResult;
    sessionAccessToken = refreshResult.accessToken;
    for (const header of setCookieHeaders) {
      c.header("Set-Cookie", header, { append: true });
    }
    if (!user) {
      const contextPageData2 = {
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
      const context2 = await buildTemplateContext(c.req.raw, contextPageData2);
      const bodyHtml2 = await renderPage(page.layoutData, context2);
      const initialState2 = { pageVariables: context2.local, sessionVariables: context2.session, cookies: context2.cookies, user: context2.user };
      const trackingConfig2 = await fetchTrackingConfig();
      const { faviconUrl: faviconUrl2 } = await getCachedSettings();
      const authFormConfig = page._primaryAuthForm || void 0;
      const gatedHtml = generateGatedPageDocument(
        page,
        bodyHtml2,
        initialState2,
        trackingConfig2,
        faviconUrl2,
        authFormConfig
      );
      c.header("Cache-Control", "no-cache, no-store, must-revalidate");
      c.header("Content-Type", "text/html; charset=utf-8");
      return c.html(gatedHtml);
    }
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
    cookies: context.cookies,
    user: context.user
  };
  const trackingConfig = await fetchTrackingConfig();
  const { faviconUrl, authConfig } = await getCachedSettings(sessionAccessToken);
  const htmlDoc = generateHtmlDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl, authConfig);
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.html(htmlDoc);
});
pagesRoute.get("/", async (c) => {
  try {
    const cacheKey = "page:__homepage__";
    let homepage = null;
    try {
      const { getRedis: getRedis2 } = await import("./redis-E24KJZFG.js");
      const redis = getRedis2();
      const cached2 = await redis.get(cacheKey);
      if (cached2) {
        console.log("[SSR] Cache HIT: homepage");
        homepage = cached2;
      }
    } catch {
    }
    if (!homepage) {
      homepage = await stateProvider.getHomepage();
      if (homepage) {
        console.log(`[SSR] Rendering homepage: ${homepage.slug} (v${homepage.version})`);
      } else {
        console.log("[SSR] No local homepage found, pulling from FastAPI...");
        const fastapiUrl = process.env.BACKEND_URL || "http://backend:8000";
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
            await stateProvider.upsertPage(publishData);
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
        try {
          const { getRedis: getRedis2 } = await import("./redis-E24KJZFG.js");
          const redis = getRedis2();
          await redis.setex(cacheKey, 60, JSON.stringify(homepage));
          console.log("[SSR] Cache SET: homepage (60s TTL)");
        } catch {
        }
      }
    }
    if (homepage) {
      if (!homepage.isPublic) {
        const { user, setCookieHeaders } = await refreshSession(c.req.raw);
        for (const header of setCookieHeaders) {
          c.header("Set-Cookie", header, { append: true });
        }
        if (!user) {
          const page2 = {
            id: homepage.id,
            slug: homepage.slug,
            title: homepage.title,
            description: homepage.description,
            name: homepage.name,
            isPublic: homepage.isPublic,
            isHomepage: homepage.isHomepage,
            layoutData: homepage.layoutData,
            datasources: homepage.datasources,
            cssBundle: homepage.cssBundle || void 0
          };
          const cpd = {
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
          const ctx = await buildTemplateContext(c.req.raw, cpd);
          const bodyHtml2 = await renderPage(page2.layoutData, ctx);
          const is = { pageVariables: ctx.local, sessionVariables: ctx.session, cookies: ctx.cookies };
          const tc = await fetchTrackingConfig();
          const { faviconUrl: fav } = await getCachedSettings();
          const afc = homepage._primaryAuthForm || void 0;
          return c.html(generateGatedPageDocument(page2, bodyHtml2, is, tc, fav, afc));
        }
      }
      const page = {
        id: homepage.id,
        slug: homepage.slug,
        title: homepage.title,
        description: homepage.description,
        name: homepage.name,
        isPublic: homepage.isPublic,
        isHomepage: homepage.isHomepage,
        layoutData: homepage.layoutData,
        datasources: homepage.datasources,
        cssBundle: homepage.cssBundle || void 0
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
      const { faviconUrl } = await getCachedSettings();
      const fullHtml = generateHtmlDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl);
      return c.html(fullHtml);
    }
  } catch (error) {
    console.error("Error fetching homepage:", error);
  }
  return c.json({
    service: "Frontbase Edge Engine",
    mode: "full",
    status: "running",
    homepage: false,
    message: "No homepage published. Publish a page marked as homepage from the dashboard.",
    docs: "/api/docs",
    health: "/api/health"
  });
});

// src/routes/import.ts
import { Hono as Hono3 } from "hono";

// src/schemas/publish.ts
import { z as z19 } from "zod";
var ComponentTypeSchema = z19.enum([
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
var DatasourceTypeSchema = z19.enum([
  "supabase",
  "neon",
  "planetscale",
  "turso",
  "postgres",
  "mysql",
  "sqlite"
]);
var DatasourceConfigSchema = z19.object({
  id: z19.string(),
  type: DatasourceTypeSchema,
  name: z19.string(),
  // URL is safe to publish (no password)
  url: z19.string().optional(),
  // For Supabase: anon key is safe to publish
  anonKey: z19.string().optional(),
  // Secret environment variable name (actual secret NOT published)
  secretEnvVar: z19.string().optional()
});
var ColumnOverrideSchema = z19.object({
  visible: z19.boolean().nullish(),
  label: z19.string().nullish(),
  width: z19.string().nullish(),
  sortable: z19.boolean().nullish(),
  filterable: z19.boolean().nullish(),
  type: z19.string().nullish(),
  primaryKey: z19.string().nullish()
  // Added for FK reference
});
var DataRequestSchema = z19.object({
  url: z19.string().default(""),
  // Full URL (may be empty for proxy — resolved server-side)
  method: z19.string().default("GET"),
  // HTTP method
  headers: z19.record(z19.string(), z19.string()).default({}),
  // Headers
  body: z19.record(z19.string(), z19.unknown()).optional(),
  // For POST requests
  resultPath: z19.string().default(""),
  // JSON path to extract data
  flattenRelations: z19.boolean().default(true),
  // Flatten nested objects
  queryConfig: z19.record(z19.string(), z19.unknown()).optional(),
  // RPC config for DataTable
  fetchStrategy: z19.enum(["direct", "proxy"]).default("proxy"),
  // Publish-time routing decision
  datasourceId: z19.string().nullish()
  // Datasource ID for proxy strategy (server-side credential resolution)
});
var ComponentBindingSchema = z19.object({
  componentId: z19.string().nullish(),
  datasourceId: z19.string().nullish(),
  tableName: z19.string().nullish(),
  // columns can be string[] (column names) or object[] (enriched schema from publish)
  columns: z19.union([
    z19.array(z19.string()),
    z19.array(z19.object({
      name: z19.string(),
      type: z19.string(),
      nullable: z19.boolean().optional(),
      primary_key: z19.boolean().optional(),
      default: z19.any().optional(),
      foreign_key_table: z19.string().nullish(),
      foreign_key_column: z19.string().nullish()
    }).passthrough())
  ]).nullish(),
  columnOrder: z19.array(z19.string()).nullish(),
  columnOverrides: z19.record(z19.string(), ColumnOverrideSchema).nullish(),
  filters: z19.record(z19.string(), z19.unknown()).nullish(),
  primaryKey: z19.string().nullish(),
  foreignKeys: z19.array(z19.object({
    column: z19.string(),
    referencedTable: z19.string(),
    referencedColumn: z19.string()
  }).passthrough()).nullish(),
  dataRequest: DataRequestSchema.nullish(),
  // Form-specific fields
  fieldOverrides: z19.record(z19.string(), z19.unknown()).nullish(),
  fieldOrder: z19.array(z19.string()).nullish(),
  dataSourceId: z19.string().nullish(),
  // camelCase alias
  // Dynamic feature configuration (for DataTable server-side features)
  frontendFilters: z19.array(z19.record(z19.string(), z19.unknown())).nullish(),
  sorting: z19.record(z19.string(), z19.unknown()).nullish(),
  pagination: z19.record(z19.string(), z19.unknown()).nullish(),
  filtering: z19.record(z19.string(), z19.unknown()).nullish()
}).passthrough();
var VisibilitySettingsSchema = z19.object({
  mobile: z19.boolean().default(true),
  tablet: z19.boolean().default(true),
  desktop: z19.boolean().default(true)
});
var ViewportOverridesSchema = z19.object({
  mobile: z19.record(z19.string(), z19.any()).nullable().optional(),
  tablet: z19.record(z19.string(), z19.any()).nullable().optional()
}).passthrough();
var StylesDataSchema = z19.object({
  values: z19.record(z19.string(), z19.any()).nullable().optional(),
  activeProperties: z19.array(z19.string()).nullable().optional(),
  stylingMode: z19.string().default("visual"),
  viewportOverrides: ViewportOverridesSchema.nullable().optional()
}).passthrough();
var ComponentStylesSchema = z19.record(z19.string(), z19.any()).nullable().optional();
var PageComponentSchema = z19.lazy(
  () => z19.object({
    id: z19.string(),
    type: z19.string(),
    // ComponentTypeSchema is too strict for flexibility
    props: z19.record(z19.string(), z19.unknown()).nullable().optional(),
    styles: ComponentStylesSchema,
    // Legacy: direct styles
    stylesData: StylesDataSchema.nullable().optional(),
    // New: structured styles with overrides
    visibility: VisibilitySettingsSchema.nullable().optional(),
    // Per-viewport visibility
    children: z19.array(PageComponentSchema).nullable().optional(),
    binding: ComponentBindingSchema.nullable().optional()
  })
);
var PageLayoutSchema = z19.object({
  content: z19.array(PageComponentSchema),
  root: z19.record(z19.string(), z19.unknown()).optional()
});
var SeoDataSchema = z19.object({
  title: z19.string().optional(),
  description: z19.string().optional(),
  keywords: z19.array(z19.string()).optional(),
  ogImage: z19.string().optional(),
  canonical: z19.string().optional()
});
var PublishPageSchema = z19.object({
  // Page identity (can be UUID or custom string ID like "default-homepage")
  id: z19.string().min(1),
  slug: z19.string().min(1),
  name: z19.string(),
  title: z19.string().optional(),
  description: z19.string().optional(),
  // Layout & structure
  layoutData: PageLayoutSchema,
  // SEO
  seoData: SeoDataSchema.nullable().optional(),
  // Datasources (non-sensitive config only)
  datasources: z19.array(DatasourceConfigSchema).nullable().optional(),
  // CSS Bundle (tree-shaken, component-specific CSS from FastAPI)
  cssBundle: z19.string().nullable().optional(),
  // Versioning
  version: z19.number().int().min(1),
  publishedAt: z19.string().datetime(),
  // Flags
  isPublic: z19.boolean().default(true),
  isHomepage: z19.boolean().default(false),
  // Content hash for drift detection (SHA-256 of publishable attributes)
  contentHash: z19.string().nullable().optional(),
  // Auth form config baked at publish time (for private page gating overlay)
  _primaryAuthForm: z19.record(z19.string(), z19.unknown()).nullable().optional()
});
var ImportPageRequestSchema = z19.object({
  page: PublishPageSchema,
  // Optional: force overwrite even if version is same
  force: z19.boolean().default(false)
});
var ImportPageResponseSchema = z19.object({
  success: z19.boolean(),
  slug: z19.string(),
  version: z19.number(),
  previewUrl: z19.string(),
  message: z19.string().optional()
});
var ErrorResponseSchema3 = z19.object({
  success: z19.literal(false),
  error: z19.string(),
  details: z19.record(z19.string(), z19.unknown()).optional()
});

// src/routes/import.ts
var importRoute = new Hono3();
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
    console.log(`[Import] cssBundle present: ${!!page.cssBundle}, length: ${page.cssBundle?.length || 0}`);
    if (!force) {
      const existing = await stateProvider.getPageBySlug(page.slug);
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
    const result = await stateProvider.upsertPage(page);
    try {
      const { getRedis: getRedis2 } = await import("./redis-E24KJZFG.js");
      const redis = getRedis2();
      await redis.del(`page:${page.slug}`);
      console.log(`[Import] Cache invalidated: page:${page.slug}`);
      if (page.isHomepage) {
        await redis.del("page:__homepage__");
        console.log(`[Import] Cache invalidated: page:__homepage__`);
      }
      await redis.del("seo:sitemap", "seo:llms");
    } catch {
    }
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
    const existing = await stateProvider.getPageBySlug(slug);
    if (!existing) {
      console.log(`[Import] Page not found in SSR: ${slug}`);
      return c.json({
        success: true,
        message: `Page "${slug}" was not published`
      }, 200);
    }
    await stateProvider.deletePage(slug);
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
    const updates = {};
    if (body.faviconUrl !== void 0) updates.faviconUrl = body.faviconUrl || null;
    if (body.logoUrl !== void 0) updates.logoUrl = body.logoUrl || null;
    if (body.siteName !== void 0) updates.siteName = body.siteName || null;
    else if (body.name !== void 0) updates.siteName = body.name || null;
    if (body.siteDescription !== void 0) updates.siteDescription = body.siteDescription || null;
    else if (body.description !== void 0) updates.siteDescription = body.description || null;
    if (body.appUrl !== void 0) updates.appUrl = body.appUrl || null;
    if (body.authForms !== void 0) updates.authForms = body.authForms || null;
    await stateProvider.updateProjectSettings(updates);
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
    const settings = await stateProvider.getProjectSettings();
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

// src/routes/manage.ts
import { OpenAPIHono as OpenAPIHono17, createRoute as createRoute12, z as z20 } from "@hono/zod-openapi";
var manageRoute = new OpenAPIHono17();
var listPagesRoute = createRoute12({
  method: "get",
  path: "/pages",
  tags: ["Pages"],
  summary: "List all published pages",
  description: "Returns slug, name, and version for each published page on this engine",
  responses: {
    200: {
      description: "Page list",
      content: {
        "application/json": {
          schema: z20.object({
            pages: z20.array(z20.object({
              slug: z20.string(),
              name: z20.string(),
              version: z20.number()
            })),
            total: z20.number()
          })
        }
      }
    }
  }
});
manageRoute.openapi(listPagesRoute, async (c) => {
  const pages = await stateProvider.listPages();
  return c.json({ pages, total: pages.length }, 200);
});
var getPageRoute = createRoute12({
  method: "get",
  path: "/pages/:slug",
  tags: ["Pages"],
  summary: "Get page by slug",
  description: "Returns the full page bundle including layout, SEO, datasources, and CSS",
  request: {
    params: z20.object({
      slug: z20.string().openapi({ description: "Page slug" })
    })
  },
  responses: {
    200: {
      description: "Page bundle",
      content: {
        "application/json": {
          schema: z20.object({ page: z20.record(z20.unknown()) })
        }
      }
    },
    404: {
      description: "Page not found",
      content: {
        "application/json": { schema: ErrorResponseSchema }
      }
    }
  }
});
manageRoute.openapi(getPageRoute, async (c) => {
  const { slug } = c.req.valid("param");
  const page = await stateProvider.getPageBySlug(slug);
  if (!page) {
    return c.json({ error: "NotFound", message: `Page "${slug}" not found` }, 404);
  }
  return c.json({ page }, 200);
});
var deletePageRoute = createRoute12({
  method: "delete",
  path: "/pages/:slug",
  tags: ["Pages"],
  summary: "Delete a page",
  description: "Removes a published page from this engine and invalidates Redis cache",
  request: {
    params: z20.object({
      slug: z20.string().openapi({ description: "Page slug" })
    })
  },
  responses: {
    200: {
      description: "Page deleted",
      content: {
        "application/json": { schema: SuccessResponseSchema }
      }
    }
  }
});
manageRoute.openapi(deletePageRoute, async (c) => {
  const { slug } = c.req.valid("param");
  await stateProvider.deletePage(slug);
  try {
    const { getRedis: getRedis2 } = await import("./redis-E24KJZFG.js");
    const redis = getRedis2();
    await redis.del(`page:${slug}`);
  } catch {
  }
  return c.json({ success: true, message: `Page "${slug}" deleted` }, 200);
});

// src/routes/seo.ts
import { Hono as Hono4 } from "hono";
var seoRoute = new Hono4();
seoRoute.use("*", async (c, next) => {
  await next();
  const ct = c.res.headers.get("Content-Type");
  if (ct) {
    c.res.headers.set("X-Content-Type", ct);
  }
});
function getBaseUrl(request) {
  const publicUrl = process.env.PUBLIC_URL;
  if (publicUrl) return publicUrl.replace(/\/$/, "");
  try {
    const url = new URL(request.url);
    return url.origin;
  } catch {
    return "http://localhost:3002";
  }
}
seoRoute.get("/sitemap.xml", async (c) => {
  try {
    const { getRedis: getRedis2 } = await import("./redis-E24KJZFG.js");
    const redis = getRedis2();
    const cached2 = await redis.get("seo:sitemap");
    if (cached2) {
      c.header("Content-Type", "application/xml");
      c.header("Cache-Control", "public, max-age=3600");
      c.header("X-Cache", "HIT");
      return c.body(cached2);
    }
  } catch {
  }
  const baseUrl = getBaseUrl(c.req.raw);
  const pages = await stateProvider.listPublicPageSlugs();
  const urls = pages.map((page) => {
    const loc = page.isHomepage ? baseUrl + "/" : `${baseUrl}/${page.slug}`;
    const priority = page.isHomepage ? "1.0" : "0.8";
    const lastmod = page.updatedAt ? page.updatedAt.split("T")[0] : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  try {
    const { getRedis: getRedis2 } = await import("./redis-E24KJZFG.js");
    const redis = getRedis2();
    await redis.setex("seo:sitemap", 3600, xml);
  } catch {
  }
  c.header("Content-Type", "application/xml");
  c.header("Cache-Control", "public, max-age=3600");
  c.header("X-Cache", "MISS");
  return c.body(xml);
});
seoRoute.get("/robots.txt", async (c) => {
  const baseUrl = getBaseUrl(c.req.raw);
  const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
  c.header("Content-Type", "text/plain");
  c.header("Cache-Control", "public, max-age=600");
  return c.body(robotsTxt);
});
seoRoute.get("/llms.txt", async (c) => {
  try {
    const { getRedis: getRedis2 } = await import("./redis-E24KJZFG.js");
    const redis = getRedis2();
    const cached2 = await redis.get("seo:llms");
    if (cached2) {
      c.header("Content-Type", "text/plain");
      c.header("Cache-Control", "public, max-age=3600");
      c.header("X-Cache", "HIT");
      return c.body(cached2);
    }
  } catch {
  }
  const baseUrl = getBaseUrl(c.req.raw);
  const pages = await stateProvider.listPublicPageSlugs();
  const settings = await stateProvider.getProjectSettings();
  const siteName = settings.siteName || "Frontbase Site";
  const siteDescription = settings.siteDescription || "";
  const lines = [
    `# ${siteName}`
  ];
  if (siteDescription) {
    lines.push(`> ${siteDescription}`);
  }
  lines.push("", "## Pages", "");
  for (const page of pages) {
    const url = page.isHomepage ? baseUrl + "/" : `${baseUrl}/${page.slug}`;
    const label = page.slug.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
    lines.push(`- [${label}](${url})`);
  }
  const llmsTxt = lines.join("\n") + "\n";
  try {
    const { getRedis: getRedis2 } = await import("./redis-E24KJZFG.js");
    const redis = getRedis2();
    await redis.setex("seo:llms", 3600, llmsTxt);
  } catch {
  }
  c.header("Content-Type", "text/plain");
  c.header("Cache-Control", "public, max-age=3600");
  c.header("X-Cache", "MISS");
  return c.body(llmsTxt);
});
function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// src/routes/embed.ts
import { OpenAPIHono as OpenAPIHono18 } from "@hono/zod-openapi";
var embedRoute = new OpenAPIHono18();
embedRoute.get("/embed.js", (c) => {
  c.header("Content-Type", "application/javascript");
  c.header("Cache-Control", "public, max-age=3600");
  c.header("Access-Control-Allow-Origin", "*");
  return c.body(`(function(){
  function initEmbed(){
    var scripts=document.querySelectorAll('script[src*="/embed.js"][data-form-id]');
    scripts.forEach(function(script){
      if(script.dataset.processed)return;
      script.dataset.processed='true';
      var formId=script.dataset.formId;
      var width=script.dataset.width||'100%';
      var baseUrl=script.src.split('/api/embed/embed.js')[0];
      var iframe=document.createElement('iframe');
      iframe.src=baseUrl+'/api/embed/auth/'+formId;
      iframe.style.width=width;
      iframe.style.border='none';
      iframe.style.overflow='hidden';
      iframe.scrolling='no';
      iframe.style.minHeight='400px';
      iframe.style.borderRadius='12px';
      script.parentNode.insertBefore(iframe,script.nextSibling);
      window.addEventListener('message',function(event){
        if(event.origin!==baseUrl)return;
        try{
          var data=typeof event.data==='string'?JSON.parse(event.data):event.data;
          if(data.type==='frontbase-resize'&&data.formId===formId){
            iframe.style.height=data.height+'px';
          }
          if(data.type==='frontbase-auth-success'){
            if(data.user){
               localStorage.setItem('frontbase_user', JSON.stringify(data.user));
            }
            window.location.href=data.redirectUrl;
          }
        }catch(e){}
      });
    });
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initEmbed);
  }else{
    initEmbed();
  }
})();`);
});
embedRoute.get("/auth/:formId", async (c) => {
  const formId = c.req.param("formId");
  let formConfig = null;
  try {
    const settings = await stateProvider.getProjectSettings();
    if (settings.authForms) {
      const formsMap = JSON.parse(settings.authForms);
      formConfig = formsMap[formId] || null;
    }
  } catch (err) {
    console.warn("[Embed] Could not read auth forms from settings:", err);
  }
  const type = formConfig?.type || "both";
  const title = formConfig?.name || formConfig?.title || "Welcome";
  const description = formConfig?.description || "";
  const logoUrl = formConfig?.logoUrl || formConfig?.config?.logoUrl || "";
  const primaryColor = formConfig?.config?.primaryColor || formConfig?.primaryColor || "#18181b";
  const providers = formConfig?.config?.providers || formConfig?.providers || [];
  const magicLink = formConfig?.config?.magicLink || formConfig?.magicLink || false;
  const showLinks = formConfig?.config?.showLinks !== false;
  const redirectUrl = formConfig?.redirectUrl || formConfig?.config?.redirectUrl || "";
  const defaultIsLogin = type !== "signup";
  const showToggle = type === "both";
  const hasSocial = providers.length > 0;
  const socialButtons = providers.map((p) => {
    const name = p.charAt(0).toUpperCase() + p.slice(1);
    return `<button type="button" class="fb-social-btn" data-provider="${esc(p)}">Continue with ${esc(name)}</button>`;
  }).join("\n");
  c.header("Content-Type", "text/html; charset=utf-8");
  c.header("Cache-Control", "no-cache");
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#18181b}
        .fb-auth-container{max-width:400px;margin:0 auto;padding:2rem}
        .fb-logo{text-align:center;margin-bottom:1.5rem}
        .fb-logo img{max-height:48px;max-width:200px}
        h1{font-size:1.5rem;font-weight:700;text-align:center;margin-bottom:0.25rem}
        .fb-desc{color:#71717a;font-size:0.875rem;text-align:center;margin-bottom:1.5rem}
        .fb-spacer{margin-bottom:1.5rem}
        .fb-divider{display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem}
        .fb-divider-line{flex:1;height:1px;background:#e4e4e7}
        .fb-divider-text{color:#a1a1aa;font-size:0.75rem;text-transform:uppercase}
        .fb-social-btn{width:100%;padding:0.625rem;background:#fff;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.8125rem;cursor:pointer;transition:background 0.2s;font-family:inherit;margin-bottom:0.5rem}
        .fb-social-btn:hover{background:#f4f4f5}
        .fb-error{display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:0.625rem;border-radius:0.375rem;font-size:0.8125rem;margin-bottom:0.75rem}
        .fb-form{display:flex;flex-direction:column;gap:0.75rem}
        .fb-label{display:block;font-size:0.8125rem;font-weight:500;color:#374151;margin-bottom:0.25rem}
        .fb-input{width:100%;padding:0.5rem 0.75rem;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.875rem;outline:none;transition:border-color 0.2s;box-sizing:border-box}
        .fb-input:focus{border-color:${esc(primaryColor)}}
        .fb-submit{width:100%;padding:0.625rem;background:${esc(primaryColor)};color:#fff;border:none;border-radius:0.375rem;font-size:0.875rem;font-weight:600;cursor:pointer;transition:opacity 0.2s}
        .fb-submit:hover{opacity:0.9}
        .fb-submit:disabled{opacity:0.6;cursor:not-allowed}
        .fb-toggle{text-align:center;margin-top:1rem;font-size:0.8125rem;color:#71717a}
        .fb-toggle a{color:${esc(primaryColor)};font-weight:500;text-decoration:none;margin-left:0.25rem}
        .fb-success{display:none;text-align:center;padding:2rem 1rem;color:#16a34a;font-size:0.875rem}
    </style>
</head>
<body>
<div class="fb-auth-container">
    ${logoUrl ? `<div class="fb-logo"><img src="${esc(logoUrl)}" alt="Logo"></div>` : ""}
    <h1 id="fb-auth-title">${esc(title)}</h1>
    ${description ? `<p class="fb-desc">${esc(description)}</p>` : '<div class="fb-spacer"></div>'}

    ${hasSocial ? `
    <div>${socialButtons}</div>
    <div class="fb-divider">
        <div class="fb-divider-line"></div>
        <span class="fb-divider-text">or</span>
        <div class="fb-divider-line"></div>
    </div>` : ""}

    <div id="fb-auth-error" class="fb-error"></div>
    <div id="fb-auth-success" class="fb-success">
        <p>\u2713 Check your email for a confirmation link.</p>
    </div>

    <form id="fb-auth-form" class="fb-form" action="/api/auth/login" method="POST">
        <input type="hidden" name="redirectTo" value="${esc(redirectUrl)}">
        <input type="hidden" name="isEmbed" value="true">
        <input type="hidden" name="formId" value="${esc(formId)}">
        <div>
            <label for="fb-email" class="fb-label">Email</label>
            <input id="fb-email" name="email" class="fb-input" type="email" required autocomplete="email" placeholder="you@example.com">
        </div>
        <div>
            <label for="fb-password" class="fb-label">Password</label>
            <input id="fb-password" name="password" class="fb-input" type="password" required autocomplete="current-password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" minlength="6">
        </div>
        <button id="fb-auth-submit" class="fb-submit" type="submit">
            ${defaultIsLogin ? "Sign In" : "Sign Up"}
        </button>
    </form>

    ${showToggle ? `
    <p class="fb-toggle">
        <span id="fb-toggle-text">${defaultIsLogin ? "Don't have an account?" : "Already have an account?"}</span>
        <a href="#" id="fb-toggle-link" onclick="fbToggleMode();return false">${defaultIsLogin ? "Sign Up" : "Sign In"}</a>
    </p>` : ""}
</div>

<script>
(function(){
    var REDIRECT_URL='${esc(redirectUrl)}';
    var FORM_ID='${esc(formId)}';
    var isLoginMode=${defaultIsLogin};
    var form=document.getElementById('fb-auth-form');
    var errorDiv=document.getElementById('fb-auth-error');
    var successDiv=document.getElementById('fb-auth-success');
    var submitBtn=document.getElementById('fb-auth-submit');

    // Resize notification for parent iframe
    function notifyResize(){
        var h=document.documentElement.scrollHeight;
        window.parent.postMessage({type:'frontbase-resize',formId:FORM_ID,height:h+20},'*');
    }
    new ResizeObserver(notifyResize).observe(document.body);
    setTimeout(notifyResize,100);

    // Show error from URL params (server-side redirect on auth failure)
    var urlParams=new URLSearchParams(window.location.search);
    var authError=urlParams.get('auth_error');
    var authMessage=urlParams.get('auth_message');
    if(authError){
        errorDiv.textContent=authError;
        errorDiv.style.display='block';
        notifyResize();
    }
    if(authMessage){
        form.style.display='none';
        successDiv.textContent=authMessage;
        successDiv.style.display='block';
        notifyResize();
    }

    form.addEventListener('submit',function(){
        submitBtn.disabled=true;
        submitBtn.textContent=isLoginMode?'Signing in...':'Signing up...';
    });

    // Toggle login/signup mode
    window.fbToggleMode=function(){
        isLoginMode=!isLoginMode;
        form.action=isLoginMode?'/api/auth/login':'/api/auth/signup';
        document.getElementById('fb-auth-title').textContent=isLoginMode?'${esc(type === "both" ? "Welcome Back" : title)}':'Create an Account';
        submitBtn.textContent=isLoginMode?'Sign In':'Sign Up';
        document.getElementById('fb-toggle-text').textContent=isLoginMode?"Don't have an account?":'Already have an account?';
        document.getElementById('fb-toggle-link').textContent=isLoginMode?'Sign Up':'Sign In';
        document.getElementById('fb-password').autocomplete=isLoginMode?'current-password':'new-password';
        errorDiv.style.display='none';
        successDiv.style.display='none';
        form.style.display='block';
        notifyResize();
    };
})();
</script>
</body>
</html>`);
});
function esc(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// src/routes/auth.ts
import { OpenAPIHono as OpenAPIHono19 } from "@hono/zod-openapi";
init_env();
async function resolveDynamicRedirect(client, userId, formId, isEmbed, fallbackRedirect) {
  if (!client) return fallbackRedirect;
  try {
    const settings = await stateProvider.getProjectSettings();
    if (isEmbed && formId && settings.authForms) {
      const authFormsConfig = JSON.parse(settings.authForms);
      const formConfig = authFormsConfig[formId];
      if (formConfig?.redirectUrl) {
        return formConfig.redirectUrl;
      }
    }
    const authCfg = getAuthConfig();
    const contacts = authCfg.contacts;
    if (contacts?.table && contacts?.columnMapping && contacts?.contactTypeHomePages) {
      const typeCol = contacts.columnMapping.contactTypeColumn;
      const authUserCol = contacts.columnMapping.authUserIdColumn || "id";
      if (typeCol) {
        const { data, error } = await client.supabase.from(contacts.table).select(typeCol).eq(authUserCol, userId).maybeSingle();
        if (data && !error) {
          const contactType = data[typeCol];
          const homePageId = contacts.contactTypeHomePages[contactType];
          if (homePageId && homePageId !== "_default_") {
            const pages = await stateProvider.listPages();
            const targetPage = pages.find((p) => p.id === homePageId);
            if (targetPage) {
              return `/${targetPage.slug}`;
            }
          }
        } else if (error) {
          console.warn("[Auth] Error querying contact type:", error);
        }
      }
    }
  } catch (e) {
    console.error("[Auth] Error resolving dynamic redirect:", e);
  }
  return fallbackRedirect;
}
var authRoute = new OpenAPIHono19();
authRoute.post("/login", async (c) => {
  const provider = new SupabaseAuthProvider();
  const client = await provider.createClient(c.req.raw);
  if (!client) {
    return c.json({ error: "Supabase not configured" }, 503);
  }
  let email;
  let password;
  let redirectTo;
  let isEmbed = false;
  let formId;
  const contentType = c.req.header("Content-Type") || "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    email = form["email"] || "";
    password = form["password"] || "";
    redirectTo = form["redirectTo"] || "/";
    isEmbed = form["isEmbed"] === "true";
    formId = form["formId"];
  } else {
    const body = await c.req.json();
    email = body.email || "";
    password = body.password || "";
    redirectTo = body.redirectTo || "/";
    isEmbed = !!body.isEmbed;
    formId = body.formId;
  }
  if (!email || !password) {
    return c.json({ error: "Email and password required" }, 400);
  }
  const { data, error } = await client.supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (contentType.includes("form")) {
      const errorUrl = new URL(redirectTo, new URL(c.req.url).origin);
      errorUrl.searchParams.set("auth_error", error.message);
      return c.redirect(errorUrl.toString(), 303);
    }
    return c.json({ error: error.message }, 401);
  }
  const cookieHeaders = client.getCookieHeaders();
  for (const header of cookieHeaders) {
    c.header("Set-Cookie", header, { append: true });
  }
  let finalRedirect = redirectTo;
  let enrichedUser = null;
  if (data.user) {
    finalRedirect = await resolveDynamicRedirect(client, data.user.id, formId, isEmbed, redirectTo);
    enrichedUser = await provider.enrichUserContext(data.user, data.session?.access_token);
  }
  if (contentType.includes("form")) {
    if (isEmbed) {
      const userJson = enrichedUser ? JSON.stringify(enrichedUser) : "null";
      return c.html(`
                <!DOCTYPE html>
                <html>
                <body>
                    <script>
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'frontbase-auth-success', redirectUrl: '${finalRedirect}', user: ${userJson} }, '*');
                        } else {
                            window.location.href = '${finalRedirect}';
                        }
                    </script>
                </body>
                </html>
            `, 200);
    }
    return c.redirect(finalRedirect, 303);
  }
  return c.json({ success: true, user: enrichedUser, redirectUrl: finalRedirect });
});
authRoute.get("/me", async (c) => {
  const provider = new SupabaseAuthProvider();
  const user = await provider.getUserFromRequest(c.req.raw);
  if (user) {
    return c.json({ success: true, user });
  }
  return c.json({ success: false, user: null }, 401);
});
authRoute.post("/signup", async (c) => {
  const provider = new SupabaseAuthProvider();
  const client = await provider.createClient(c.req.raw);
  if (!client) {
    return c.json({ error: "Supabase not configured" }, 503);
  }
  let email;
  let password;
  let redirectTo;
  let isEmbed = false;
  let formId;
  const contentType = c.req.header("Content-Type") || "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    email = form["email"] || "";
    password = form["password"] || "";
    redirectTo = form["redirectTo"] || "/";
    isEmbed = form["isEmbed"] === "true";
    formId = form["formId"];
  } else {
    const body = await c.req.json();
    email = body.email || "";
    password = body.password || "";
    redirectTo = body.redirectTo || "/";
    isEmbed = !!body.isEmbed;
    formId = body.formId;
  }
  if (!email || !password) {
    return c.json({ error: "Email and password required" }, 400);
  }
  const { data, error } = await client.supabase.auth.signUp({ email, password });
  if (error) {
    if (contentType.includes("form")) {
      const errorUrl = new URL(redirectTo, new URL(c.req.url).origin);
      errorUrl.searchParams.set("auth_error", error.message);
      return c.redirect(errorUrl.toString(), 303);
    }
    return c.json({ error: error.message }, 400);
  }
  if (data.user && !data.session) {
    if (contentType.includes("form")) {
      const successUrl = new URL(redirectTo, new URL(c.req.url).origin);
      successUrl.searchParams.set("auth_message", "Check your email to confirm your account");
      if (isEmbed) {
        return c.html(`
                    <!DOCTYPE html>
                    <html>
                    <body>
                        <script>
                            if (window.parent && window.parent !== window) {
                                window.parent.postMessage({ type: 'frontbase-auth-success', redirectUrl: '${successUrl.toString()}' }, '*');
                            } else {
                                window.location.href = '${successUrl.toString()}';
                            }
                        </script>
                    </body>
                    </html>
                `, 200);
      }
      return c.redirect(successUrl.toString(), 303);
    }
    return c.json({ success: true, message: "Check your email to confirm your account" });
  }
  const cookieHeaders = client.getCookieHeaders();
  for (const header of cookieHeaders) {
    c.header("Set-Cookie", header, { append: true });
  }
  let finalRedirect = redirectTo;
  let enrichedUser = null;
  if (data.user) {
    finalRedirect = await resolveDynamicRedirect(client, data.user.id, formId, isEmbed, redirectTo);
    enrichedUser = await provider.enrichUserContext(data.user, data.session?.access_token);
  }
  if (contentType.includes("form")) {
    if (isEmbed) {
      const userJson = enrichedUser ? JSON.stringify(enrichedUser) : "null";
      return c.html(`
                <!DOCTYPE html>
                <html>
                <body>
                    <script>
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'frontbase-auth-success', redirectUrl: '${finalRedirect}', user: ${userJson} }, '*');
                        } else {
                            window.location.href = '${finalRedirect}';
                        }
                    </script>
                </body>
                </html>
            `, 200);
    }
    return c.redirect(finalRedirect, 303);
  }
  return c.json({ success: true, user: enrichedUser, redirectUrl: finalRedirect });
});
authRoute.post("/logout", async (c) => {
  const provider = new SupabaseAuthProvider();
  const client = await provider.createClient(c.req.raw);
  if (!client) {
    return c.json({ error: "Supabase not configured" }, 503);
  }
  await client.supabase.auth.signOut();
  const cookieHeaders = client.getCookieHeaders();
  for (const header of cookieHeaders) {
    c.header("Set-Cookie", header, { append: true });
  }
  const contentType = c.req.header("Content-Type") || "";
  const redirectTo = c.req.query("redirectTo") || "/";
  if (contentType.includes("form")) {
    return c.redirect(redirectTo, 303);
  }
  return c.json({ success: true });
});

// src/engine/full.ts
var app = createLiteApp("full");
if (HYDRATE_JS && !HYDRATE_JS.includes("%%HYDRATE_JS%%")) {
  app.get("/static/react/hydrate.js", (c) => {
    c.header("Content-Type", "application/javascript; charset=utf-8");
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    return c.body(HYDRATE_JS);
  });
}
if (HYDRATE_CSS && !HYDRATE_CSS.includes("%%HYDRATE_CSS%%")) {
  app.get("/static/react/:cssFile{entry-.+\\.css}", (c) => {
    c.header("Content-Type", "text/css; charset=utf-8");
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    return c.body(HYDRATE_CSS);
  });
}
if (FAVICON_PNG_B64 && !FAVICON_PNG_B64.includes("%%FAVICON_PNG_B64%%")) {
  const faviconBuf = Uint8Array.from(atob(FAVICON_PNG_B64), (c) => c.charCodeAt(0));
  app.get("/static/icon.png", (c) => {
    c.header("Content-Type", "image/png");
    c.header("Cache-Control", "public, max-age=86400");
    return c.body(faviconBuf);
  });
}
app.use("/api/import/*", systemKeyAuth);
app.use("/api/data/execute", async (_c, next) => await next());
app.use("/api/data/*", systemKeyAuth);
app.use("/api/manage/*", systemKeyAuth);
app.route("/api/import", importRoute);
app.route("/api/data", dataRoute);
app.route("/api/manage", manageRoute);
app.route("", seoRoute);
app.route("/api/embed", embedRoute);
app.route("/api/auth", authRoute);
app.route("", pagesRoute);

// src/startup/sync.ts
init_redis();
var BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
var MAX_RETRIES = 5;
var RETRY_DELAY_MS = 3e3;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function syncRedisSettingsFromFastAPI() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/sync/settings/redis/`, {
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
    const response = await fetch(`${BACKEND_URL}/api/pages/homepage/`, {
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
    await stateProvider.upsertPage(publishData);
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
  console.log("[Startup Sync] \u{1F680} Starting Edge database initialization...");
  await stateProvider.init();
  const platform = getPlatform();
  if (platform !== "docker") {
    console.log(`[Startup Sync] \u2601\uFE0F  Platform "${platform}" \u2014 skipping backend sync (secrets pushed at deploy time)`);
    return;
  }
  console.log("[Startup Sync] Syncing settings from backend...");
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const redisResult = await syncRedisSettingsFromFastAPI();
    const allDone = redisResult.status === "success" || redisResult.status === "not-configured";
    if (allDone) break;
    const needsRetry = redisResult.status === "error" && redisResult.retry;
    if (needsRetry && attempt < MAX_RETRIES) {
      console.log(`[Startup Sync] Attempt ${attempt}/${MAX_RETRIES}, retrying in ${RETRY_DELAY_MS / 1e3}s...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
  const existingHomepage = await stateProvider.getHomepage();
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

// src/index.ts
app.use("*", compress());
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var publicPath = path.resolve(__dirname, "../public");
app.use("/static/*", serveStatic({
  root: publicPath,
  rewriteRequestPath: (p) => p.replace(/^\/static/, "")
}));
app.post("/api/build-bundle", async (c) => {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const PROVIDER_CONFIGS = {
    "cloudflare": { config: "tsup.cloudflare-lite.ts", output: "cloudflare-lite.js" },
    "cloudflare-full": { config: "tsup.cloudflare.ts", output: "cloudflare.js" },
    "supabase": { config: "tsup.supabase-edge-lite.ts", output: "supabase-edge-lite.js" },
    "supabase-full": { config: "tsup.supabase-edge.ts", output: "supabase-edge.js" },
    "upstash": { config: "tsup.upstash-workflow-lite.ts", output: "upstash-workflow-lite.js" },
    "upstash-full": { config: "tsup.upstash-workflow.ts", output: "upstash-workflow.js" },
    "vercel": { config: "tsup.vercel-edge-lite.ts", output: "vercel-edge-lite.js" },
    "vercel-full": { config: "tsup.vercel-edge.ts", output: "vercel-edge.js" },
    "netlify": { config: "tsup.netlify-edge-lite.ts", output: "netlify-edge-lite.js" },
    "netlify-full": { config: "tsup.netlify-edge.ts", output: "netlify-edge.js" },
    "deno": { config: "tsup.deno-deploy-lite.ts", output: "deno-deploy-lite.js" },
    "deno-full": { config: "tsup.deno-deploy.ts", output: "deno-deploy.js" }
  };
  try {
    const body = await c.req.json().catch(() => ({}));
    const adapterType = body.adapter_type || "automations";
    const provider = body.provider || "cloudflare";
    const isFull = adapterType === "full";
    const configKey = isFull ? `${provider}-full` : provider;
    const cfg = PROVIDER_CONFIGS[configKey];
    if (!cfg) {
      return c.json({ success: false, error: `Unknown provider/adapter: ${configKey}` }, 400);
    }
    const { config: configFile, output: outputFile } = cfg;
    const label = `${provider.charAt(0).toUpperCase() + provider.slice(1)} ${isFull ? "Full" : "Lite"}`;
    const edgeRoot = path.resolve(__dirname, "..");
    const distFile = path.join(edgeRoot, "dist", outputFile);
    if (fs.existsSync(distFile)) fs.unlinkSync(distFile);
    console.log(`[Build] Building ${label} bundle in ${edgeRoot}...`);
    const result = execSync(`npx tsup --config ${configFile}`, {
      cwd: edgeRoot,
      encoding: "utf-8",
      timeout: isFull ? 12e4 : 6e4,
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (!fs.existsSync(distFile)) {
      return c.json({ success: false, error: `Build output not found: ${distFile}` }, 500);
    }
    const content = fs.readFileSync(distFile, "utf-8");
    console.log(`[Build] ${label} bundle: ${content.length} bytes (${Math.round(content.length / 1024)} KB)`);
    return c.json({
      success: true,
      script_content: content,
      script_filename: outputFile,
      size_bytes: content.length,
      adapter_type: adapterType
    });
  } catch (err) {
    console.error("[Build] Failed:", err.message);
    return c.json({
      success: false,
      error: err.stderr || err.message || "Unknown build error"
    }, 500);
  }
});
app.get("/api/source-snapshot", async (c) => {
  const fs = await import("fs");
  const crypto2 = await import("crypto");
  const provider = c.req.query("provider") || "";
  const adapterType = c.req.query("adapter_type") || "full";
  const isLite = ["automations", "lite", ""].includes(adapterType);
  const edgeRoot = path.resolve(__dirname, "..");
  const srcDir = path.join(edgeRoot, "src");
  if (!fs.existsSync(srcDir)) {
    return c.json({ success: false, error: "Source directory not found" }, 404);
  }
  const CORE_PREFIX = "frontbase-core";
  const allProviders = /* @__PURE__ */ new Set(["cloudflare", "supabase", "vercel", "netlify", "deno", "docker"]);
  const otherProviders = provider ? new Set([...allProviders].filter((p) => p !== provider)) : /* @__PURE__ */ new Set();
  const fullOnlyDirs = ["ssr/", "components/", "db/_archived/"];
  const files = {};
  let totalSize = 0;
  function walkDir(dir, prefix = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        walkDir(path.join(dir, entry.name), rel);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        if (rel.includes(".bak")) continue;
        if (rel.startsWith("adapters/") && otherProviders.size > 0) {
          const baseName = entry.name.replace(/\.[^.]+$/, "").toLowerCase();
          if ([...otherProviders].some((p) => baseName.includes(p))) continue;
        }
        if (isLite && fullOnlyDirs.some((d) => rel.startsWith(d))) continue;
        try {
          const content = fs.readFileSync(path.join(dir, entry.name), "utf-8");
          files[`${CORE_PREFIX}/${rel}`] = content;
          totalSize += content.length;
        } catch {
        }
      }
    }
  }
  walkDir(srcDir);
  if (Object.keys(files).length === 0) {
    return c.json({ success: false, error: "No source files found" }, 404);
  }
  const bundleMode = isLite ? "Lite (Automations only)" : "Full (SSR + Automations)";
  const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "Unknown";
  files[`${CORE_PREFIX}/README.md`] = `# Frontbase Edge Engine

**Provider**: ${providerLabel}
**Bundle**: ${bundleMode}
**Adapter**: ${adapterType || "automations"}

## Folder Structure

| Folder | Description |
|:-------|:------------|
| \`adapters/\` | Platform entry point \u2014 wires the Hono app to the runtime |
| \`engine/\` | Core Hono app creation, middleware, route registration |
| \`routes/\` | API routes: health, deploy, execute, webhook, executions |
| \`cache/\` | Redis/Upstash cache adapter with ICacheProvider interface |
| \`middleware/\` | Auth (API key, JWT), rate limiting |
| \`db/\` | State provider (SQLite/Turso), datasource adapters |
| \`schemas/\` | Zod validation schemas for API payloads |
| \`startup/\` | Backend sync on boot (Redis, Turso, JWT settings) |
| \`lib/\` | Shared utilities |
${!isLite ? "| `ssr/` | Server-side page rendering (React/Hono) |" : ""}
## Data vs Code

This Inspector shows the **engine source code** \u2014 how the runtime works.

Published **pages and workflows** are stored in the attached state database
(SQLite or Turso), not in these source files. They are deployed via the
\`/api/deploy\` endpoint and served by the routes defined here.
`;
  return c.json({
    success: true,
    files,
    file_count: Object.keys(files).length,
    total_size: totalSize
  });
});
app.get("/api/source-hash", async (c) => {
  const fs = await import("fs");
  const crypto2 = await import("crypto");
  const edgeRoot = path.resolve(__dirname, "..");
  const srcDir = path.join(edgeRoot, "src");
  if (!fs.existsSync(srcDir)) {
    return c.json({ success: false, hash: null }, 404);
  }
  const hasher = crypto2.createHash("sha256");
  let fileCount = 0;
  function walkDir(dir, prefix = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        walkDir(path.join(dir, entry.name), rel);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        try {
          hasher.update(rel);
          hasher.update(fs.readFileSync(path.join(dir, entry.name)));
          fileCount++;
        } catch {
        }
      }
    }
  }
  walkDir(srcDir);
  if (fileCount === 0) {
    return c.json({ success: false, hash: null }, 404);
  }
  const hash = hasher.digest("hex").substring(0, 12);
  return c.json({ success: true, hash, file_count: fileCount });
});
var port = parseInt(process.env.PORT || "3002");
serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`\u{1F680} Edge Engine running on http://localhost:${info.port}`);
  console.log(`\u{1F4CD} PUBLIC_URL: ${process.env.PUBLIC_URL || "(not set - using request headers)"}`);
  console.log(`\u{1F50C} Adapter: docker (scope: full)`);
  runStartupSync().catch((err) => {
    console.error("[Startup Sync] Error:", err);
  });
});
var index_default = app;
export {
  index_default as default
};
