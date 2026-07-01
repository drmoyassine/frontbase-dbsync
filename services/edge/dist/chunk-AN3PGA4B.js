import {
  getTenantSecret
} from "./chunk-X3V6XZOJ.js";
import {
  init_storage,
  stateProvider
} from "./chunk-LMYJ5MDS.js";
import {
  cacheProvider
} from "./chunk-TIUQQ77S.js";

// src/execution/queueConsumer.ts
init_storage();
import { v4 as uuidv4 } from "uuid";

// src/services/queue/qstash-provider.ts
import { Client } from "@upstash/qstash";
var QStashProvider = class {
  client;
  handlers = /* @__PURE__ */ new Map();
  constructor() {
    this.client = new Client({ token: process.env.QSTASH_TOKEN });
  }
  destinationFor(jobName) {
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`;
    return `${baseUrl}/api/queue/process?jobName=${encodeURIComponent(jobName)}`;
  }
  async enqueue(jobName, data, opts) {
    const notBefore = opts?.delay ? Math.floor(Date.now() / 1e3) + Math.floor(opts.delay / 1e3) : void 0;
    const res = await this.client.publishJSON({
      url: this.destinationFor(jobName),
      body: data,
      retries: opts?.retries,
      notBefore
    });
    return res.messageId;
  }
  async schedule(jobName, data, opts) {
    let cron = opts.cron;
    if (!cron && opts.everyMs) {
      const minutes = Math.max(1, Math.ceil(opts.everyMs / 6e4));
      cron = `*/${minutes} * * * *`;
    }
    if (!cron) throw new Error("QStashProvider.schedule: cron or everyMs required");
    const created = await this.client.schedules.create({
      destination: this.destinationFor(jobName),
      cron,
      ...data && Object.keys(data).length ? { body: JSON.stringify(data) } : {}
    });
    const scheduleId = created?.scheduleId || created?.id || String(created);
    return { scheduleId, jobName };
  }
  async unschedule(scheduleId) {
    await this.client.schedules.delete(scheduleId);
  }
  process(jobName, handler) {
    this.handlers.set(jobName, handler);
  }
  getHandler(jobName) {
    return this.handlers.get(jobName);
  }
};

// src/services/queue/index.ts
var NoopProvider = class {
  async enqueue(jobName, data, opts) {
    console.warn(`[Queue] No queue configured, dropped job: ${jobName}`);
    return "noop-id";
  }
  process(jobName, handler) {
    console.warn(`[Queue] No queue configured, ignored process attempt for: ${jobName}`);
  }
  getHandler(jobName) {
    return void 0;
  }
  async schedule(jobName, data, opts) {
    throw new Error(`[Queue] No scheduler configured \u2014 cannot schedule ${jobName} (set QSTASH_TOKEN or BULLMQ_REDIS_URL)`);
  }
  async unschedule(_scheduleId) {
  }
};
async function createBullMQProvider() {
  try {
    const { Queue, Worker } = await import("bullmq");
    const parseRedisUrl = () => {
      const url = new URL(process.env.BULLMQ_REDIS_URL || "redis://localhost:6379");
      return { host: url.hostname, port: url.port ? parseInt(url.port) : 6379 };
    };
    const queues = /* @__PURE__ */ new Map();
    const workers = /* @__PURE__ */ new Map();
    const bullmqHandlers = /* @__PURE__ */ new Map();
    return {
      async enqueue(jobName, data, opts) {
        if (!queues.has(jobName)) {
          queues.set(jobName, new Queue(jobName, { connection: parseRedisUrl() }));
        }
        const job = await queues.get(jobName).add(jobName, data, {
          delay: opts?.delay,
          attempts: opts?.retries,
          priority: opts?.priority
        });
        return job.id;
      },
      process(jobName, handler) {
        if (workers.has(jobName)) return;
        bullmqHandlers.set(jobName, handler);
        const worker = new Worker(jobName, async (job) => {
          await handler(job.data);
        }, { connection: parseRedisUrl() });
        workers.set(jobName, worker);
      },
      getHandler(jobName) {
        return bullmqHandlers.get(jobName);
      },
      async schedule(jobName, data, opts) {
        if (!queues.has(jobName)) {
          queues.set(jobName, new Queue(jobName, { connection: parseRedisUrl() }));
        }
        const repeat = opts.cron ? { pattern: opts.cron } : opts.everyMs ? { every: opts.everyMs } : null;
        if (!repeat) throw new Error("BullMQProvider.schedule: cron or everyMs required");
        const job = await queues.get(jobName).add(jobName, data, { repeat });
        return { scheduleId: String(job.id), jobName };
      },
      async unschedule(scheduleId) {
        for (const q of queues.values()) {
          try {
            const repeatables = await q.getRepeatableJobs();
            for (const r of repeatables) {
              if (r.id === scheduleId || r.key === scheduleId) {
                await q.removeRepeatableByKey(r.key);
              }
            }
          } catch {
          }
        }
      }
    };
  } catch (e) {
    console.warn("[Queue] bullmq not available \u2014 falling back to NoopProvider");
    return new NoopProvider();
  }
}
async function createQueueService() {
  if (process.env.BULLMQ_REDIS_URL) return createBullMQProvider();
  if (process.env.QSTASH_TOKEN) return new QStashProvider();
  return new NoopProvider();
}
var queueServiceReady = createQueueService();

// src/engine/runtime.ts
init_storage();

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

// src/nodes/EmailNode.ts
function validateEmailNode(inputs) {
  const errors = [];
  if (!inputs.to) errors.push("Recipient (to) is required");
  if (!inputs.subject) errors.push("Subject is required");
  if (!inputs.body) errors.push("Body is required");
  if (typeof inputs.to === "string" && !inputs.to.includes("@")) {
    errors.push("Invalid email address");
  }
  if (Array.isArray(inputs.to)) {
    const invalid = inputs.to.filter((e) => typeof e !== "string" || !e.includes("@"));
    if (invalid.length > 0) errors.push(`Invalid email addresses: ${invalid.join(", ")}`);
  }
  return { valid: errors.length === 0, errors };
}
async function resolveEmailCredentials(providerAccountId, tenantSlug) {
  let integrations = null;
  if (tenantSlug && tenantSlug !== "_default") {
    try {
      const secret = await getTenantSecret("integrations", tenantSlug);
      integrations = secret || null;
    } catch (e) {
      console.warn(`[EmailNode] Failed to resolve tenant integrations: ${e}`);
    }
  }
  if (!integrations && process.env.FRONTBASE_INTEGRATIONS) {
    try {
      integrations = JSON.parse(process.env.FRONTBASE_INTEGRATIONS);
    } catch (e) {
      console.warn(`[EmailNode] Failed to parse FRONTBASE_INTEGRATIONS: ${e}`);
    }
  }
  if (!integrations) {
    console.error("[EmailNode] No email provider credentials available");
    return null;
  }
  if (providerAccountId && integrations[providerAccountId]) {
    return integrations[providerAccountId];
  }
  const providers = Object.values(integrations);
  const emailProvider = providers.find((p) => p.provider === "resend" || p.provider === "mailgun");
  if (!emailProvider) {
    console.error("[EmailNode] No email provider (resend/mailgun) found in integrations");
    return null;
  }
  return emailProvider;
}
async function sendViaResend(config, to, subject, html, from, fromName, replyTo) {
  const fromAddress = from || fromName ? `${fromName || "Frontbase"} <${from || "noreply@frontbase.com"}>` : void 0;
  const payload = {
    to,
    subject,
    html
  };
  if (fromAddress) payload.from = fromAddress;
  if (replyTo) payload.reply_to = replyTo;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        sent: false,
        error: `Resend API error: ${response.status} - ${errorText.substring(0, 200)}`,
        provider: "resend"
      };
    }
    const result = await response.json();
    return {
      success: true,
      sent: true,
      messageId: result.id,
      provider: "resend"
    };
  } catch (error) {
    return {
      success: false,
      sent: false,
      error: error?.message || "Failed to send email via Resend",
      provider: "resend"
    };
  }
}
async function sendViaMailgun(config, to, subject, html, from, fromName, replyTo) {
  const domain = config.domain || "mg.frontbase.com";
  const region = config.region || "us";
  const baseUrl = region === "eu" ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3";
  let fromAddress = from;
  if (fromName) {
    fromAddress = `${fromName} <${from || `postmaster@${domain}`}>`;
  }
  if (!fromAddress) {
    fromAddress = `postmaster@${domain}`;
  }
  const formData = new URLSearchParams();
  formData.append("to", to.join(","));
  formData.append("subject", subject);
  formData.append("html", html);
  formData.append("from", fromAddress);
  if (replyTo) formData.append("h:Reply-To", replyTo);
  try {
    const response = await fetch(`${baseUrl}/${domain}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`api:${config.api_key}`)}`
      },
      body: formData
    });
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        sent: false,
        error: `Mailgun API error: ${response.status} - ${errorText.substring(0, 200)}`,
        provider: "mailgun"
      };
    }
    const result = await response.json();
    return {
      success: true,
      sent: true,
      messageId: result.id || result.message,
      provider: "mailgun"
    };
  } catch (error) {
    return {
      success: false,
      sent: false,
      error: error?.message || "Failed to send email via Mailgun",
      provider: "mailgun"
    };
  }
}
async function executeEmailNode(inputs) {
  const { to, subject, body } = inputs;
  if (!to) return { success: false, sent: false, error: "Recipient (to) is required" };
  if (!subject) return { success: false, sent: false, error: "Subject is required" };
  if (!body) return { success: false, sent: false, error: "Body is required" };
  const isHtml = inputs.isHtml !== false;
  const html = isHtml ? body : `<p>${body}</p>`;
  const recipients = Array.isArray(to) ? to : [to];
  const tenantSlug = inputs._tenantSlug;
  const providerAccountId = inputs._providerAccountId;
  const config = await resolveEmailCredentials(providerAccountId, tenantSlug);
  if (!config) {
    return {
      success: false,
      sent: false,
      error: "No email provider credentials available. Configure an email provider in the integrations tab."
    };
  }
  console.log(`[EmailNode] Sending email via ${config.provider} to ${recipients.length} recipient(s)`);
  if (config.provider === "resend") {
    return await sendViaResend(
      config,
      recipients,
      subject,
      html,
      inputs.from,
      inputs.fromName,
      inputs.replyTo
    );
  } else if (config.provider === "mailgun") {
    return await sendViaMailgun(
      config,
      recipients,
      subject,
      html,
      inputs.from,
      inputs.fromName,
      inputs.replyTo
    );
  }
  return {
    success: false,
    sent: false,
    error: `Unsupported email provider: ${config.provider}`
  };
}

// src/nodes/DelayNode.ts
var DELAY_STATE_KEY = (executionId) => `exec:${executionId}:delay`;
var DELAY_TTL_SEC = 3600;
var MAX_INLINE_DELAY = 25e3;
var MAX_DELAY = 7 * 24 * 3600 * 1e3;
function calculateDelayMs(inputs) {
  if (inputs.delayMs !== void 0) {
    const ms = Number(inputs.delayMs);
    if (!Number.isFinite(ms) || ms < 0) throw new Error(`Invalid delayMs: ${inputs.delayMs}`);
    return Math.min(ms, MAX_DELAY);
  }
  if (inputs.delayUnit !== void 0 && inputs.delayValue !== void 0) {
    const value = Number(inputs.delayValue);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid delayValue: ${inputs.delayValue}`);
    const multipliers = {
      ms: 1,
      millisecond: 1,
      milliseconds: 1,
      s: 1e3,
      sec: 1e3,
      second: 1e3,
      seconds: 1e3,
      m: 6e4,
      min: 6e4,
      minute: 6e4,
      minutes: 6e4,
      h: 36e5,
      hour: 36e5,
      hours: 36e5
    };
    const mult = multipliers[String(inputs.delayUnit).toLowerCase()];
    if (!mult) throw new Error(`Unknown delay unit: ${inputs.delayUnit}`);
    return Math.min(value * mult, MAX_DELAY);
  }
  return 1e3;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function executeDelayNode(inputs) {
  const delayMs = calculateDelayMs(inputs);
  const executionId = inputs._executionId;
  const workflowId = inputs._workflowId;
  const nodeId = inputs._nodeId;
  if (delayMs <= MAX_INLINE_DELAY) {
    await sleep(delayMs);
    return { waited: true, delayedMs: delayMs };
  }
  if (!executionId) {
    return { waited: false, deferred: true, delayedMs: delayMs };
  }
  const resumeAt = Date.now() + delayMs;
  const state = {
    resumeAt,
    nodeId: nodeId || "unknown",
    delayMs,
    executionId,
    workflowId: workflowId || "unknown"
  };
  try {
    await cacheProvider.setex(DELAY_STATE_KEY(executionId), DELAY_TTL_SEC, JSON.stringify(state));
  } catch (error) {
    console.error("[DelayNode] Failed to save durable state:", error);
  }
  try {
    const queue = await queueServiceReady;
    await queue.enqueue(`wf:resume:${executionId}`, { executionId, nodeId: state.nodeId, workflowId }, { delay: delayMs });
  } catch (error) {
    console.error("[DelayNode] Failed to enqueue resume job:", error);
  }
  return {
    waited: false,
    deferred: true,
    delayedMs: delayMs,
    resumeAt: new Date(resumeAt).toISOString()
  };
}

// src/engine/expr.ts
function normalizeExpression(expr) {
  return expr.replace(/\[['"]([^'"]+)['"]\]/g, ".$1").replace(/\[(\d+)\]/g, ".$1");
}
function getPath(obj, path) {
  const parts = path.trim().split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0) return void 0;
    current = current[part];
  }
  return current;
}
function safeEval(expression, data) {
  expression = normalizeExpression(expression.trim());
  if (expression === "true") return true;
  if (expression === "false") return false;
  if (expression === "null") return null;
  if (expression === "undefined") return void 0;
  if (/^\d+(\.\d+)?$/.test(expression)) {
    return Number(expression);
  }
  const stringMatch = expression.match(/^['"](.*)['"]$/);
  if (stringMatch) {
    return stringMatch[1];
  }
  if (expression.startsWith("!")) {
    return !safeEval(expression.substring(1), data);
  }
  if (expression.includes("||")) {
    const parts = expression.split("||");
    for (const part of parts) {
      const val = safeEval(part, data);
      if (val) return val;
    }
    return safeEval(parts[parts.length - 1], data);
  }
  if (expression.includes("&&")) {
    const parts = expression.split("&&");
    let val = true;
    for (const part of parts) {
      val = safeEval(part, data);
      if (!val) return val;
    }
    return val;
  }
  const operators = ["===", "!==", "==", "!=", ">=", "<=", ">", "<"];
  for (const op of operators) {
    if (expression.includes(op)) {
      const parts = expression.split(op).map((p) => p.trim());
      if (parts.length === 2) {
        const left = safeEval(parts[0], data);
        const right = safeEval(parts[1], data);
        switch (op) {
          case "===":
          case "==":
            return left === right;
          case "!==":
          case "!=":
            return left !== right;
          case ">=":
            return left >= right;
          case "<=":
            return left <= right;
          case ">":
            return left > right;
          case "<":
            return left < right;
        }
      }
    }
  }
  if (expression === "data") return data;
  if (expression.startsWith("data.")) {
    return getPath({ data }, expression);
  }
  return getPath(data, expression);
}

// src/nodes/LoopNode.ts
function createLoopContextVars(item, index, total) {
  return {
    item,
    index,
    isFirst: index === 0,
    isLast: index === total - 1,
    iterations: index + 1,
    total
  };
}
async function executeLoopNode(inputs) {
  const itemsInput = inputs.items;
  const items = Array.isArray(itemsInput) ? itemsInput : [itemsInput];
  if (items.length === 0) {
    return { iterations: 0, results: [] };
  }
  const maxIterations = Number(inputs.maxIterations ?? 1e3);
  if (!Number.isFinite(maxIterations) || maxIterations < 1) {
    throw new Error("maxIterations must be a positive number");
  }
  if (items.length > maxIterations) {
    throw new Error(
      `Loop exceeds max iterations: ${items.length} > ${maxIterations}. Raise maxIterations or filter the input.`
    );
  }
  const expression = inputs.expression;
  const transform = typeof inputs.transform === "function" ? inputs.transform : null;
  const breakCondition = inputs.breakCondition;
  const continueOnError = inputs.continueOnError !== false;
  const results = [];
  let breakTriggered = false;
  for (let i = 0; i < items.length; i++) {
    const ctxVars = createLoopContextVars(items[i], i, items.length);
    const scope = { ...inputs, ...ctxVars };
    try {
      const result = transform ? transform(scope) : expression ? safeEval(expression, scope) : items[i];
      results.push(result);
      if (breakCondition) {
        try {
          if (safeEval(breakCondition, { result, ...scope })) {
            breakTriggered = true;
            break;
          }
        } catch {
        }
      }
    } catch (error) {
      results.push({ error: error.message, item: items[i], index: i });
      if (!continueOnError) {
        throw new Error(`Loop failed at iteration ${i + 1}: ${error.message}`);
      }
    }
  }
  return { iterations: results.length, results, breakTriggered };
}

// src/nodes/CheckpointNode.ts
async function executeCheckpointNode(node, inputs, context) {
  const nodeInputs = node.inputs || node.data?.inputs || [];
  const getName = () => {
    const inp = nodeInputs.find((i) => i.name === "name");
    return inp?.value || `checkpoint-${node.id}`;
  };
  const checkpointName = getName();
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const completed = (context.nodeExecutions || []).filter((n) => n.status === "completed").map((n) => n.nodeId);
  let saved = false;
  try {
    await saveCheckpoint({
      executionId: context.executionId,
      workflowId: context.workflowId,
      completedNodes: completed,
      nodeOutputs: context.nodeOutputs,
      nodeExecutions: context.nodeExecutions
    });
    saved = true;
  } catch (error) {
    console.error("[CheckpointNode] Failed to save checkpoint:", error);
  }
  return { checkpoint: checkpointName, timestamp, saved };
}

// src/nodes/QueueTrigger.ts
function executeQueueTrigger(inputs) {
  return {
    message: inputs.message ?? inputs.data ?? inputs,
    messageId: inputs.messageId ?? inputs.id,
    queueName: inputs.queueName ?? inputs.queue,
    timestamp: inputs.timestamp ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/nodes/EmailTrigger.ts
function executeEmailTrigger(inputs) {
  return {
    from: inputs.from || "",
    to: inputs.to || "",
    subject: inputs.subject || "(no subject)",
    body: inputs.body || inputs.html || inputs.text || "",
    text: inputs.text,
    attachments: Array.isArray(inputs.attachments) ? inputs.attachments : [],
    headers: inputs.headers || {},
    timestamp: inputs.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
    provider: inputs.provider,
    messageId: inputs.messageId
  };
}

// src/execution/nodeCache.ts
var NODE_CACHE_PREFIX = "wf:node:cache";
var DEFAULT_TTL = 300;
function hashInputs(inputs) {
  const sorted = {};
  for (const k of Object.keys(inputs).sort()) {
    sorted[k] = inputs[k];
  }
  const str = JSON.stringify(sorted);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0") + ":" + str.length.toString(16);
}
function buildCacheKey(nodeId, inputHash, version = 0) {
  return `${NODE_CACHE_PREFIX}:${nodeId}:v${version}:${inputHash}`;
}
function versionKey(nodeId) {
  return `${NODE_CACHE_PREFIX}:version:${nodeId}`;
}
function workflowVersionKey(workflowId) {
  return `${NODE_CACHE_PREFIX}:wfversion:${workflowId}`;
}
async function getNodeVersion(nodeId) {
  try {
    const v = await cacheProvider.get(versionKey(nodeId));
    return v ? parseInt(String(v), 10) || 0 : 0;
  } catch {
    return 0;
  }
}
async function getWorkflowVersion(workflowId) {
  try {
    const v = await cacheProvider.get(workflowVersionKey(workflowId));
    return v ? parseInt(String(v), 10) || 0 : 0;
  } catch {
    return 0;
  }
}
async function getNodeOutput(nodeId, inputs, ttl = DEFAULT_TTL, workflowId) {
  try {
    const inputHash = hashInputs(inputs);
    const nodeVer = await getNodeVersion(nodeId);
    const wfVer = workflowId ? await getWorkflowVersion(workflowId) : 0;
    const key = buildCacheKey(nodeId, inputHash, nodeVer + wfVer);
    const cached = await cacheProvider.get(key);
    if (cached === null || cached === void 0) {
      return { cached: false, key };
    }
    const outputs = typeof cached === "string" ? JSON.parse(cached) : cached;
    return { cached: true, outputs, key };
  } catch (error) {
    console.error("[NodeCache] Get failed:", error);
    return { cached: false };
  }
}
async function setNodeOutput(nodeId, inputs, outputs, ttl = DEFAULT_TTL, workflowId) {
  try {
    const inputHash = hashInputs(inputs);
    const nodeVer = await getNodeVersion(nodeId);
    const wfVer = workflowId ? await getWorkflowVersion(workflowId) : 0;
    const key = buildCacheKey(nodeId, inputHash, nodeVer + wfVer);
    await cacheProvider.setex(key, ttl, JSON.stringify(outputs));
  } catch (error) {
    console.error("[NodeCache] Set failed:", error);
  }
}
function isCacheableNodeType(nodeType) {
  return ["data_request", "http_request", "transform", "json_transform"].includes(nodeType);
}
function getDefaultTTL(nodeType) {
  const ttlMap = {
    data_request: 60,
    http_request: 300,
    transform: 600,
    json_transform: 600
  };
  return ttlMap[nodeType] ?? DEFAULT_TTL;
}

// src/engine/node-executors.ts
async function executeNode(node, inputs, context) {
  if (isCacheableNodeType(node.type)) {
    const ttlInput = (node.inputs || []).find((i) => i.name === "cache_ttl")?.value;
    const ttl = typeof ttlInput === "number" ? ttlInput : getDefaultTTL(node.type);
    const cached = await getNodeOutput(node.id, inputs, ttl, context.workflowId);
    if (cached.cached && cached.outputs !== void 0) {
      return cached.outputs;
    }
  }
  switch (node.type) {
    case "trigger":
    case "manual_trigger":
      return { ...inputs };
    case "ui_event_trigger": {
      const event = inputs?.event ?? inputs;
      return {
        timestamp: event?.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
        eventType: event?.eventType ?? event?.type ?? null,
        element: event?.element ?? null,
        value: event?.value ?? null,
        checked: event?.checked ?? null,
        coordinates: event?.coordinates ?? null,
        modifiers: event?.modifiers ?? null,
        key: event?.key ?? null,
        target: event?.target ?? null
      };
    }
    case "data_change_trigger": {
      const payload = inputs?.changes !== void 0 ? inputs : { changes: [], operation: "any", count: 0 };
      const changes = Array.isArray(payload.changes) ? payload.changes : [];
      return {
        changes,
        operation: payload.operation ?? "any",
        count: typeof payload.count === "number" ? payload.count : changes.length
      };
    }
    case "schedule_trigger": {
      return {
        timestamp: inputs?.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
        scheduledTime: inputs?.scheduledTime ?? inputs?.timestamp ?? null
      };
    }
    case "data_request": {
      const dataResult = await executeDataRequest(node, inputs, context);
      await cacheStore(node, inputs, context, dataResult);
      return dataResult;
    }
    case "http_request": {
      const httpResult = await executeHttpRequest(node, inputs);
      await cacheStore(node, inputs, context, httpResult);
      return httpResult;
    }
    case "transform":
    case "json_transform": {
      const transformResult = executeTransform(node, inputs);
      await cacheStore(node, inputs, context, transformResult);
      return transformResult;
    }
    case "condition":
    case "if":
      return executeCondition(node, inputs);
    case "log":
    case "console":
      console.log(`[Node ${node.id}]:`, inputs);
      return { logged: true, data: inputs };
    case "set_variable":
    case "setVariable": {
      const nodeInputs = node.inputs || [];
      const getVal = (name) => {
        const inp = nodeInputs.find((i) => i.name === name);
        return inp?.value !== void 0 ? inp.value : inputs[name];
      };
      const scope = getVal("scope") || "local";
      const key = getVal("key");
      const rawValue = getVal("value");
      let evaluatedValue = rawValue;
      if (typeof rawValue === "string") {
        try {
          evaluatedValue = safeEval(rawValue, inputs);
        } catch (e) {
          evaluatedValue = rawValue;
        }
      }
      if (context.variableMutations) {
        context.variableMutations.push({
          scope,
          key,
          value: evaluatedValue
        });
      }
      console.log(`[Set Variable Node] scope=${scope}, key=${key}, value=`, evaluatedValue);
      return { scope, key, value: evaluatedValue };
    }
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
    // ── Automations A3: Email node ──
    case "email":
    case "send_email": {
      const validation = validateEmailNode(inputs);
      if (!validation.valid) {
        throw new Error(`Email node validation failed: ${validation.errors.join(", ")}`);
      }
      return await executeEmailNode(inputs);
    }
    // ── Automations A4: Delay / wait node ──
    case "delay":
    case "wait": {
      return await executeDelayNode({
        ...inputs,
        _executionId: context.executionId,
        _workflowId: context.workflowId,
        _nodeId: node.id
      });
    }
    // ── Automations A5: Loop / iterator node ──
    case "loop":
    case "iterator": {
      return await executeLoopNode(inputs);
    }
    // ── Automations A9: Manual checkpoint node ──
    case "checkpoint": {
      return await executeCheckpointNode(node, inputs, {
        executionId: context.executionId,
        workflowId: context.workflowId,
        nodeOutputs: context.nodeOutputs,
        nodeExecutions: context.nodeExecutions
      });
    }
    // ── Automations A10: Queue trigger node ──
    case "queue_trigger": {
      return executeQueueTrigger(inputs);
    }
    // ── Automations A11: Email received trigger node ──
    case "email_trigger": {
      return executeEmailTrigger(inputs);
    }
    default:
      console.warn(`Unknown node type: ${node.type}`);
      return { ...inputs };
  }
}
async function cacheStore(node, inputs, context, outputs) {
  if (!isCacheableNodeType(node.type)) return;
  try {
    const ttlInput = (node.inputs || []).find((i) => i.name === "cache_ttl")?.value;
    const ttl = typeof ttlInput === "number" ? ttlInput : getDefaultTTL(node.type);
    await setNodeOutput(node.id, inputs, outputs, ttl, context.workflowId);
  } catch (error) {
    console.error("[NodeCache] Store in executeNode failed:", error);
  }
}
async function executeDataRequest(node, inputs, context) {
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
  const table = getInputValue("table");
  if (table) {
    return await executeLegacyDataRequest(table, getInputValue, inputs);
  }
  const dataRequest = nodeData.dataRequest;
  if (!dataRequest) {
    return {
      success: false,
      error: "DataRequest configuration not found",
      data: [],
      rowCount: 0
    };
  }
  try {
    const { executeDataRequest: edgeExecuteDataRequest } = await import("./data-SPJ7CDXA.js");
    const tenantSlug = context?.tenantSlug;
    console.log(`[Data Request Node] Executing with tenantSlug=${tenantSlug || "single-tenant"}`);
    const result = await edgeExecuteDataRequest(dataRequest, tenantSlug);
    return {
      success: true,
      data: result.data,
      rowCount: result.data.length,
      total: result.total
    };
  } catch (error) {
    console.error(`[Data Request Node] Error:`, error);
    return {
      success: false,
      error: error.message || "Data request execution failed",
      data: [],
      rowCount: 0
    };
  }
}
async function executeLegacyDataRequest(table, getInputValue, inputs, context) {
  const operation = getInputValue("operation") || "select";
  const selectFields = getInputValue("selectFields") || [];
  const whereConditions = getInputValue("whereConditions") || [];
  const limit = getInputValue("limit") || 100;
  const returnData = getInputValue("returnData") !== false;
  console.log(`[Legacy Data Request] table=${table}, operation=${operation}`);
  try {
    const { dispatchByMode } = await import("./queryDispatch-QF2VNR4V.js");
    const tenantSlug = context?.tenantSlug;
    const dispatchRequest = {
      mode: "proxy-sql",
      datasourceId: null,
      // Will use default datasource
      queryConfig: {
        sql: buildLegacyQuery(table, operation, selectFields, whereConditions, limit)
      },
      body: null
    };
    console.log(`[Legacy Data Request] Dispatching with tenantSlug=${tenantSlug || "single-tenant"}`);
    const result = await dispatchByMode(dispatchRequest, tenantSlug);
    const data = returnData ? result.data || [] : [];
    const total = result.total || data.length;
    console.log(`[Legacy Data Request] Success: ${data.length} rows (total: ${total})`);
    return {
      success: true,
      data,
      rowCount: data.length,
      total
    };
  } catch (error) {
    console.error(`[Legacy Data Request] Error:`, error);
    return {
      success: false,
      error: error.message || "Legacy data request execution failed",
      data: [],
      rowCount: 0
    };
  }
}
function buildLegacyQuery(table, operation, selectFields, whereConditions, limit) {
  const fields = Array.isArray(selectFields) && selectFields.length > 0 ? selectFields.map((f) => f.key || f.name || f).filter(Boolean).join(", ") : "*";
  let sql = `SELECT ${fields} FROM ${table}`;
  if (Array.isArray(whereConditions) && whereConditions.length > 0) {
    const conditions = whereConditions.filter((c) => c.key && c.value !== void 0).map((c) => `${c.key} = '${c.value}'`).join(" AND ");
    if (conditions) {
      sql += ` WHERE ${conditions}`;
    }
  }
  if (limit && limit > 0) {
    sql += ` LIMIT ${limit}`;
  }
  return sql;
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
      return { result: safeEval(expression, inputs) };
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
      result = !!safeEval(condition, inputs);
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

// src/engine/validation.ts
var REQUIRED_FIELDS = {
  http_request: ["method", "url"],
  data_request: ["dataSource", "table"],
  data_change_trigger: ["dataSource", "table"],
  log: ["message"],
  redirect: ["url"],
  set_variable: ["scope", "key", "value"]
};
function getInputs(node) {
  const inputs = node.data?.inputs ?? node.inputs ?? [];
  return (inputs || []).map((i) => ({ name: i.name, value: i.value }));
}
function isEmpty(value) {
  return value === null || value === void 0 || value === "" || Array.isArray(value) && value.length === 0;
}
function validateNode(node) {
  const required = REQUIRED_FIELDS[node.type];
  if (!required || required.length === 0) return [];
  const inputs = getInputs(node);
  const valuesByName = new Map(inputs.map((i) => [i.name, i.value]));
  const errors = [];
  for (const field of required) {
    const value = valuesByName.get(field);
    if (isEmpty(value)) {
      errors.push({
        nodeId: node.id,
        nodeType: node.type,
        field,
        message: `Required field "${field}" is missing on node "${node.id}"`
      });
    }
  }
  return errors;
}
function validateWorkflowExecution(nodes) {
  const errors = [];
  for (const node of nodes) {
    errors.push(...validateNode(node));
  }
  return { valid: errors.length === 0, errors };
}

// src/websocket/executionServer.ts
init_storage();
var MAX_BUFFER = 100;
var ExecutionEventHub = class {
  subscribers = /* @__PURE__ */ new Map();
  buffer = /* @__PURE__ */ new Map();
  /**
   * Subscribe to events for an execution. Returns an unsubscribe function.
   */
  subscribe(executionId, cb) {
    let set = this.subscribers.get(executionId);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.subscribers.set(executionId, set);
    }
    set.add(cb);
    return () => {
      const s = this.subscribers.get(executionId);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) this.subscribers.delete(executionId);
    };
  }
  /**
   * Broadcast an event to all subscribers for that execution, buffering it.
   */
  broadcast(event) {
    const buf = this.buffer.get(event.executionId) || [];
    buf.push(event);
    if (buf.length > MAX_BUFFER) buf.shift();
    this.buffer.set(event.executionId, buf);
    const subs = this.subscribers.get(event.executionId);
    if (!subs) return;
    for (const cb of subs) {
      try {
        cb(event);
      } catch (err) {
        console.error("[EventHub] subscriber threw:", err);
      }
    }
  }
  /**
   * Return buffered events for an execution (for late-subscriber replay).
   */
  getBuffered(executionId) {
    return this.buffer.get(executionId) || [];
  }
  /**
   * Drop subscribers + buffer for an execution (on completion / cleanup).
   */
  cleanup(executionId) {
    this.subscribers.delete(executionId);
    this.buffer.delete(executionId);
  }
  /**
   * Fetch the persisted execution state (for initial snapshot on connect).
   */
  async getInitialState(executionId, tenantSlug) {
    const execution = await stateProvider.getExecutionById(executionId, tenantSlug);
    if (!execution) return { error: "Execution not found" };
    return {
      executionId: execution.id,
      workflowId: execution.workflowId,
      status: execution.status,
      nodeExecutions: execution.nodeExecutions ? safeParse(execution.nodeExecutions) : [],
      result: execution.result ? safeParse(execution.result) : null,
      error: execution.error,
      startedAt: execution.startedAt,
      endedAt: execution.endedAt
    };
  }
  /** Stats (observability). */
  getStats() {
    return {
      activeSubscriptions: this.subscribers.size,
      bufferedExecutions: this.buffer.size
    };
  }
};
function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
var globalHub = null;
function getExecutionEventHub() {
  if (!globalHub) globalHub = new ExecutionEventHub();
  return globalHub;
}
function broadcastExecutionEvent(event) {
  getExecutionEventHub().broadcast(event);
}
function createExecutionEvent(type, executionId, workflowId, data) {
  return {
    type,
    executionId,
    workflowId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    data
  };
}

// src/engine/runtime.ts
function broadcast(type, executionId, workflowId, data) {
  try {
    broadcastExecutionEvent(createExecutionEvent(type, executionId, workflowId, data));
  } catch {
  }
}
async function executeWorkflow(executionId, workflow, inputParameters, settings, tenantSlug) {
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
    tenantSlug,
    parameters: inputParameters,
    nodeOutputs: {},
    nodeExecutions: nodes.map((n) => ({
      nodeId: n.id,
      status: "idle"
    })),
    variableMutations: []
  };
  async function coreExecute() {
    try {
      const validation = validateWorkflowExecution(nodes);
      if (!validation.valid) {
        const messages = validation.errors.map((e) => e.message);
        log.error(`Validation failed, aborting execution: ${messages.join("; ")}`);
        await updateExecutionStatus(executionId, "error", context.nodeExecutions, stateProvider);
        return {
          status: "error",
          result: {},
          error: `Workflow validation failed: ${messages.join("; ")}`
        };
      }
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
      broadcast("executing", executionId, workflow.id, { nodes: nodes.length });
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
          broadcast("node_completed", executionId, workflow.id, { nodeId, nodeType: node.type });
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
          broadcast("node_error", executionId, workflow.id, { nodeId, nodeType: node?.type, error: error.message });
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
      broadcast("completed", executionId, workflow.id, { nodes: executed.size });
      return { status: "completed", result, httpResponse, variableMutations: context.variableMutations };
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
      broadcast("error", executionId, workflow.id, { error: error.message });
      return { status: "error", result: {}, error: error.message, variableMutations: context.variableMutations };
    }
  }
  const timeoutPromise = new Promise(
    (_, reject) => setTimeout(() => reject(new Error(
      `Execution timed out after ${timeoutMs}ms`
    )), timeoutMs)
  );
  return Promise.race([coreExecute(), timeoutPromise]);
}
async function executeSingleNode(executionId, workflow, targetNodeId, inputParameters, tenantSlug) {
  const nodes = JSON.parse(workflow.nodes);
  const edges = JSON.parse(workflow.edges);
  const targetNode = nodes.find((n) => n.id === targetNodeId);
  if (!targetNode) {
    throw new Error(`Node ${targetNodeId} not found in workflow`);
  }
  const context = {
    executionId,
    workflowId: workflow.id,
    tenantSlug,
    parameters: inputParameters,
    nodeOutputs: {},
    nodeExecutions: [],
    variableMutations: []
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

// src/execution/idempotency.ts
var IDEM_CACHE_KEY = (key) => `wf:idempotency:${key}`;
var DEFAULT_TTL2 = 86400;
async function checkIdempotency(key, _ttl = DEFAULT_TTL2) {
  try {
    const cached = await cacheProvider.get(IDEM_CACHE_KEY(key));
    if (!cached) return { seen: false };
    const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
    return {
      seen: true,
      executionId: parsed?.executionId,
      seenAt: parsed?.seenAt
    };
  } catch (error) {
    console.error("[Idempotency] Check failed:", error);
    return { seen: false };
  }
}
async function markIdempotency(key, executionId, ttl = DEFAULT_TTL2) {
  try {
    await cacheProvider.setex(
      IDEM_CACHE_KEY(key),
      ttl,
      JSON.stringify({ executionId, seenAt: (/* @__PURE__ */ new Date()).toISOString() })
    );
  } catch (error) {
    console.error("[Idempotency] Mark failed:", error);
  }
}
function generateIdempotencyKey(workflowId, triggerType, triggerPayload) {
  const parts = [workflowId, triggerType];
  if (triggerType === "webhook" || triggerType === "http_webhook") {
    parts.push(triggerPayload.eventId || triggerPayload.id || "");
  } else if (triggerType === "data_change") {
    parts.push(triggerPayload.operation || "");
    parts.push(JSON.stringify(triggerPayload.changes || []));
  } else if (triggerType === "scheduled" || triggerType === "schedule") {
    parts.push(triggerPayload.timestamp || triggerPayload.scheduledTime || "");
  } else if (triggerType === "queue" || triggerType === "queue_trigger") {
    parts.push(triggerPayload.messageId || triggerPayload.id || "");
  }
  return parts.join(":").replace(/[^a-zA-Z0-9:-]/g, "_");
}

// src/execution/spikeBuffer.ts
var SpikeBuffer = class {
  queue = [];
  processing = 0;
  config;
  constructor(config) {
    this.config = {
      maxConcurrent: config?.maxConcurrent ?? parseInt(process.env.WORKFLOW_MAX_CONCURRENT || "10", 10),
      queueTimeout: config?.queueTimeout ?? 3e5
      // 5 minutes default
    };
  }
  /**
   * Execute a job with spike leveling.
   */
  async execute(job) {
    if (this.processing < this.config.maxConcurrent) {
      return this.runJob(job);
    }
    return new Promise((resolve, reject) => {
      const task = { job, resolve, reject };
      if (this.config.queueTimeout && this.config.queueTimeout > 0) {
        task.timeout = setTimeout(() => {
          const idx = this.queue.indexOf(task);
          if (idx >= 0) this.queue.splice(idx, 1);
          reject(new Error("Workflow execution timed out in queue"));
        }, this.config.queueTimeout);
      }
      this.queue.push(task);
    });
  }
  async runJob(job) {
    this.processing++;
    try {
      return await job();
    } finally {
      this.processing--;
      this.processNext();
    }
  }
  processNext() {
    if (this.queue.length === 0 || this.processing >= this.config.maxConcurrent) {
      return;
    }
    const task = this.queue.shift();
    if (!task) return;
    if (task.timeout) clearTimeout(task.timeout);
    this.runJob(task.job).then(task.resolve).catch(task.reject);
  }
  /**
   * Current buffer stats.
   */
  getStats() {
    return {
      processing: this.processing,
      queued: this.queue.length,
      capacity: this.config.maxConcurrent
    };
  }
  /**
   * Shutdown: reject all queued tasks (for tests / graceful stop).
   */
  shutdown() {
    const drained = this.queue.splice(0);
    for (const task of drained) {
      if (task.timeout) clearTimeout(task.timeout);
      task.reject(new Error("Spike buffer shutdown"));
    }
  }
};
var globalBuffer = null;
function getWorkflowSpikeBuffer() {
  if (!globalBuffer) {
    globalBuffer = new SpikeBuffer();
  }
  return globalBuffer;
}

// src/execution/queueConsumer.ts
var QUEUE_JOB = (workflowId) => `queue:${workflowId}`;
var RESUME_JOB_PREFIX = "wf:resume:";
function isResumeJob(jobName) {
  return jobName.startsWith(RESUME_JOB_PREFIX);
}
async function handleQueueMessage(workflowId, message, _tenantSlug) {
  const workflow = await stateProvider.getWorkflowById(workflowId);
  if (!workflow || !workflow.isActive) {
    console.log(`[QueueConsumer] Workflow ${workflowId} not found or inactive, skipping`);
    return null;
  }
  const tenantSlug = workflow.tenantSlug || "_default";
  const idemKey = generateIdempotencyKey(workflowId, "queue", message);
  const idem = await checkIdempotency(idemKey);
  if (idem.seen) {
    console.log(`[QueueConsumer] Duplicate message skipped (seen as ${idem.executionId})`);
    return { executionId: idem.executionId, deduplicated: true };
  }
  const executionId = uuidv4();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await stateProvider.createExecution({
    id: executionId,
    workflowId,
    status: "started",
    triggerType: "queue_trigger",
    triggerPayload: JSON.stringify(message),
    startedAt: now
  });
  await markIdempotency(idemKey, executionId);
  const settings = workflow.settings ? JSON.parse(workflow.settings) : {};
  getWorkflowSpikeBuffer().execute(
    () => executeWorkflow(executionId, workflow, message, settings).catch(
      (err) => console.error(`[QueueConsumer] Execution ${executionId} failed:`, err)
    )
  ).catch((err) => console.error("[QueueConsumer] Spike buffer rejected job:", err));
  return { executionId };
}
async function handleResume(executionId, _data) {
  try {
    const execution = await stateProvider.getExecutionById(executionId);
    if (!execution) {
      console.warn(`[QueueConsumer] Resume: execution ${executionId} not found`);
      return;
    }
    const workflow = await stateProvider.getWorkflowById(execution.workflowId);
    if (!workflow) {
      console.warn(`[QueueConsumer] Resume: workflow ${execution.workflowId} not found`);
      return;
    }
    const settings = workflow.settings ? JSON.parse(workflow.settings) : {};
    await executeWorkflow(executionId, workflow, {}, settings);
  } catch (err) {
    console.error(`[QueueConsumer] Resume failed for ${executionId}:`, err);
  }
}
async function registerQueueConsumers() {
  try {
    const queue = await queueServiceReady;
    const workflows = await stateProvider.listWorkflows("_default");
    const queueWorkflows = workflows.filter(
      (w) => w.isActive && needsQueueTrigger(w.triggerType)
    );
    let registered = 0;
    for (const workflow of queueWorkflows) {
      const jobName = QUEUE_JOB(workflow.id);
      queue.process(jobName, async (data) => {
        await handleQueueMessage(workflow.id, data || {});
      });
      registered++;
    }
    console.log(
      `[QueueConsumer] Registered ${registered} queue-trigger handlers for ${queueWorkflows.length} workflows`
    );
  } catch (e) {
    console.warn(`[QueueConsumer] Failed to register (may be test env):`, e.message);
  }
}
function needsQueueTrigger(triggerType) {
  return (triggerType || "").split(",").map((t) => t.trim().toLowerCase()).some((t) => t === "queue" || t === "queue_trigger");
}

export {
  QStashProvider,
  queueServiceReady,
  getExecutionEventHub,
  executeWorkflow,
  executeSingleNode,
  QUEUE_JOB,
  RESUME_JOB_PREFIX,
  isResumeJob,
  handleQueueMessage,
  handleResume,
  registerQueueConsumers,
  needsQueueTrigger
};
