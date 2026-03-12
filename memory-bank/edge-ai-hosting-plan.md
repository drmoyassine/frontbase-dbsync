# Edge AI Hosting Plan

> Distributed edge-native AI inference on Cloudflare Workers — Micromodel Swarm architecture, fully edge-self-sufficient.

## Vision

Run purpose-built micromodels (million-parameter range) across distributed edge Workers. Each Worker hosts a single specialist model in ONNX/WASM. A dedicated **Orchestrator Worker** manages routing, composition, and health — no FastAPI dependency at runtime. FastAPI is design-time only (model registration, deployment). No GPUs — all inference is CPU-based at the edge.

**Core Principle: Edge Self-Sufficiency.** Once models are deployed, the swarm operates independently. FastAPI publishes models and config. The edge runs, routes, reasons, and (optionally) trains — autonomously.

---

## Feasibility

### Multi-Provider Resource Landscape

> **Important:** The swarm is not limited to Cloudflare Workers. Frontbase deploys to multiple edge providers, each with different resource limits. The Orchestrator routes models to the provider best suited for their size.

| Provider | Memory | CPU Timeout | WASM | GPU | Free Tier Units |
|----------|--------|-------------|------|-----|-----------------|
| **Cloudflare Workers** | 128 MB | 10ms free / 30s paid | ✅ | ❌ | 100 workers |
| **Supabase Edge Functions** | 256 MB | 150s (paid: 400s) | ✅ | ❌ | 500K invocations/mo |
| **Deno Deploy** | 512 MB | 50ms free / unlimited paid | ✅ | ❌ | 1M req/mo |
| **Vercel Edge Functions** | 128 MB | 30s | ✅ (limited) | ❌ | 500K invocations/mo |
| **Netlify Edge Functions** | 128 MB | 50s | ✅ | ❌ | 125K invocations/mo |
| **Docker VPS (self-hosted)** | **Unlimited** | **Unlimited** | ✅ | Possible | N/A |

*(Resource limits are approximate and subject to provider changes. Verify before deploying.)*

### Provider-Aware Model Routing

The Orchestrator doesn't just route by model type — it routes by **model size → best-fit provider**:

```
Model ≤10M params  → CF Workers (128MB, fastest cold start, most free units)
Model 10-50M       → Supabase Edge / Deno Deploy (256-512MB, more headroom)
Model 50-200M      → Docker VPS (unlimited RAM, user's own infra)
Training jobs       → Docker VPS or Deno Deploy (need long timeouts + RAM)
```

This means the usable model range extends well beyond 128MB — a 200M param model (quantized to ~200MB) fits comfortably on Deno Deploy (512MB) or any Docker VPS.

### Model Size vs Provider Fit

| Model params | INT8 Size | CF (128MB) | Supabase (256MB) | Deno (512MB) | Docker (∞) |
|-------------|-----------|------------|-------------------|--------------|------------|
| 1-5M | 1-5 MB | ✅ | ✅ | ✅ | ✅ |
| 10M | ~10 MB | ✅ | ✅ | ✅ | ✅ |
| 20M | ~20 MB | ✅ | ✅ | ✅ | ✅ |
| 50M | ~50 MB | ⚠️ Tight | ✅ | ✅ | ✅ |
| 100M | ~100 MB | ❌ | ✅ | ✅ | ✅ |
| 200M | ~200 MB | ❌ | ❌ | ✅ | ✅ |
| 500M+ | ~500 MB+ | ❌ | ❌ | ❌ | ✅ |

### CPU Inference Latency (ONNX WASM, estimated)

| Model params | Forward pass | CF free (10ms)? | CF paid (30s)? | Supabase/Deno? |
|-------------|-------------|-----------------|----------------|----------------|
| 1-5M | ~0.5-2 ms | ✅ | ✅ | ✅ |
| 10M | ~2-5 ms | ✅ | ✅ | ✅ |
| 20M | ~5-10 ms | ⚠️ Borderline | ✅ | ✅ |
| 50M | ~10-50 ms | ❌ | ✅ | ✅ |
| 100-200M | ~50-200 ms | ❌ | ✅ | ✅ |

**Conclusion:** Free plan is ideal for models ≤10M params. Paid plan opens up to ~50M. Quantized (int8) is the default format.

---

## Primary Architecture: Micromodel Swarm

### Core Concept

Instead of one large model, decompose AI capabilities into a **swarm of specialist micromodels**. Each Worker hosts one model, independently scalable, independently deployable. An **Orchestrator Worker** (not FastAPI) dispatches tasks to the right specialist at runtime.

### Architecture Diagram

```
                    ┌──────────────────────────┐
                    │    FastAPI (Design-Time)  │
                    │                          │
                    │  • Register models       │
                    │  • Deploy to R2          │
                    │  • Publish swarm config  │
                    │  • Training jobs (Sec 5) │
                    └───────────┬──────────────┘
                                │ publish (one-time)
                                ▼
┌────────────────────────────────────────────────────────────────┐
│                    EDGE RUNTIME (self-sufficient)               │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              🧠 Orchestrator Worker                      │  │
│  │                                                          │  │
│  │  ┌─────────────┐  ┌──────────┐  ┌─────────────────┐    │  │
│  │  │ Swarm       │  │ Router   │  │ Chain Engine    │    │  │
│  │  │ Registry    │  │ (model   │  │ (compose chains │    │  │
│  │  │ (from R2/   │  │  lookup, │  │  & loops,       │    │  │
│  │  │  Turso)     │  │  health) │  │  manage state)  │    │  │
│  │  └─────────────┘  └──────────┘  └─────────────────┘    │  │
│  └──────┬─────────────────┬─────────────────┬─────────────┘  │
│         ▼                 ▼                 ▼                 │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐           │
│  │ Worker A │      │ Worker B │      │ Worker C │           │
│  │ Intent   │      │ Embed    │      │ Sentiment│           │
│  │ 5M ONNX  │      │ 20M ONNX│      │ 10M ONNX│           │
│  └──────────┘      └──────────┘      └──────────┘           │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐           │
│  │ Worker D │      │ Worker E │      │ Worker F │           │
│  │ Response │      │ Spam     │      │ Language │           │
│  │ 50M ONNX │      │ 3M ONNX │      │ 2M ONNX │           │
│  └──────────┘      └──────────┘      └──────────┘           │
│         │                │                │                  │
│         ▼                ▼                ▼                  │
│  ┌──────────────────────────────────────────────┐            │
│  │         Cloudflare R2 (model weights)        │            │
│  └──────────────────────────────────────────────┘            │
│  ┌────────────────┐  ┌─────────────────────────┐            │
│  │ Upstash Redis  │  │ Turso (state, results)  │            │
│  └────────────────┘  └─────────────────────────┘            │
└────────────────────────────────────────────────────────────────┘
```

### Why This Works

| Property | Why It's a Fit |
|----------|---------------|
| **Edge self-sufficient** | Orchestrator is a Worker — no FastAPI calls at runtime |
| **Embarrassingly parallel** | Each specialist handles its own requests independently |
| **Fits in memory** | 1-50M params (quantized) easily fits in 128MB |
| **Fast on CPU** | Forward pass in 1-10ms — within free-tier CPU limits |
| **Independently scalable** | Popular models get more Worker replicas |
| **Fault tolerant** | One Worker dying doesn't affect other model types |
| **Incrementally deployable** | Ship one micromodel at a time |
| **Cost: $0** | 100 free Workers = significant inference capacity |

### The Orchestrator Worker

The Orchestrator is a **dedicated Cloudflare Worker** (no model loaded — pure routing logic). It:

1. **Receives all AI requests** — single entry point: `POST /ai/infer`
2. **Looks up the swarm registry** — which models exist, which Workers serve them, health status
3. **Routes to the right specialist** — via Service Bindings (same-account, zero-latency Worker-to-Worker calls) or HTTP fetch
4. **Manages composition chains** — sequential, parallel, and recursive patterns (see Section 3)
5. **Holds swarm config** — loaded from R2/Turso at startup, cached in memory

```typescript
// Orchestrator Worker — simplified
export default {
  async fetch(request: Request, env: Env) {
    const { model, input, chain } = await request.json();

    // Single model inference
    if (model) {
      const worker = env.swarmRegistry.resolve(model); // Service Binding
      return worker.fetch(new Request('/infer', {
        method: 'POST',
        body: JSON.stringify({ input })
      }));
    }

    // Composition chain (see Section 3)
    if (chain) {
      return env.chainEngine.execute(chain, input, env);
    }
  }
};
```

**Why Service Bindings matter:** CF Worker-to-Worker calls via Service Bindings are **zero-network-latency** — they run in the same isolate group. No HTTP round-trip, no Redis overhead. This makes the Orchestrator→Specialist hop essentially free.

---

## Composition & Reasoning Patterns

The Orchestrator Worker's Chain Engine supports multiple composition patterns, from simple sequences to advanced recursive reasoning.

### Pattern 1: Linear Chain (Basic)

Sequential specialist calls. Output of one feeds input of the next.

```
Input → [Language Detect] → [Translate] → [Classify] → [Respond] → Output

Orchestrator executes steps 1, 2, 3, 4 in order.
Each step is a Service Binding call (~0ms network overhead).
Total latency: sum of individual inference times.
```

**Use case:** Multi-step content processing (detect language → translate → analyze → respond).

### Pattern 2: Parallel Fan-Out + Merge

Run multiple specialists simultaneously, merge results.

```
                    ┌→ [Sentiment]  → score ──┐
Input → Orchestrator├→ [Intent]     → label ──├→ Merge → Decision
                    └→ [Spam Check] → flag  ──┘
```

**Use case:** Evaluate an input from multiple angles at once. All three Workers run in parallel via `Promise.all()`. Total latency = slowest specialist (not sum).

### Pattern 3: Conditional Routing

Route to different specialists based on intermediate results.

```
Input → [Intent Classifier]
         ├→ "support"  → [Entity Extractor] → create ticket
         ├→ "feedback" → [Sentiment]        → store + notify
         └→ "question" → [Response Gen]     → auto-reply
```

**Use case:** Smart routing based on AI classification.

### Pattern 4: Recursive Refinement (Looped LLM)

A specialist is called **repeatedly** until a convergence condition is met. Inspired by Tiny Recursive Models (TRMs) and LoopLM patterns.

```
┌─────────────────────────────────────────────────┐
│              Orchestrator Chain Engine           │
│                                                 │
│  state = { input, answer: null, iteration: 0 }  │
│                                                 │
│  LOOP (max_iterations=5):                       │
│    result = [Refiner Worker].infer(state)       │
│    state.answer = result.answer                 │
│    state.latent = result.latent_state           │
│    IF result.confidence > 0.95 → BREAK          │
│    IF result.halted → BREAK                     │
│    iteration++                                  │
│  END LOOP                                       │
│                                                 │
│  return state.answer                            │
└─────────────────────────────────────────────────┘
```

**Key idea:** The model itself doesn't loop — the Orchestrator loops, re-calling the same specialist with updated state. Each call is a fresh stateless inference but the state accumulates in the Orchestrator.

- **Convergence check:** The Orchestrator checks confidence score, halt signal, or max iterations
- **Latent state:** The model outputs a "scratchpad" alongside the answer — the Orchestrator feeds it back on the next iteration
- **Budget control:** `max_iterations` prevents runaway loops; each iteration costs one Worker invocation

**Use case:** Iterative answer improvement, multi-step reasoning on a single specialist.

### Pattern 5: Maximal Agentic Decomposition (MAD)

Inspired by [Cognizant's MAKER system](https://arxiv.org/abs/2502.09561). Decompose a complex task into **atomic subproblems**, each handled by a single microagent with minimal context. The Orchestrator manages the decomposition tree.

```
┌──────────────────────────────────────────────────────────┐
│                   Orchestrator (MAD Mode)                 │
│                                                          │
│  Task: "Analyze customer feedback CSV and generate       │
│         a summary report with sentiment per category"    │
│                                                          │
│  Decomposition:                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ Step 1: Parse CSV → extract rows (code, no AI)   │    │
│  │ Step 2: For EACH row:                            │    │
│  │   ├ 2a: [Language Detect] → lang                 │    │
│  │   ├ 2b: [Translate if needed] → english text     │    │
│  │   ├ 2c: [Intent Classify] → category             │    │
│  │   └ 2d: [Sentiment] → score                     │    │
│  │ Step 3: Aggregate scores by category (code)      │    │
│  │ Step 4: [Summarizer] → natural language report   │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  Reliability:                                            │
│  • Each step runs k=3 parallel attempts                  │
│  • First-to-agree-by-majority wins                       │
│  • Suspicious outputs (low confidence) are discarded     │
│  • Failed steps retry with fresh Worker instance         │
└──────────────────────────────────────────────────────────┘
```

**MAD principles applied to the swarm:**

| MAD Principle | Swarm Implementation |
|---------------|---------------------|
| **Atomic decomposition** | Each step = one micromodel call (already tiny specialists) |
| **Minimal context per agent** | Each Worker only sees its input — no accumulated context drift |
| **First-to-ahead-by-k voting** | Run k=3 parallel Workers for a step, majority-vote result |
| **Error isolation** | Bad output from one step doesn't cascade — Orchestrator validates between steps |
| **Million-step reliability** | Each step is ~2ms, so 1M steps = ~33 minutes. Feasible within paid Worker limits via chained invocations |

**Why this maps perfectly to the swarm:**
- Cognizant's key insight is that **smaller models with atomic tasks outperform large monolithic models on reliability**. This is *exactly* what the Micromodel Swarm already is — each specialist model is maximally decomposed by design.
- The Orchestrator Worker is the coordination layer that MAD requires — it holds the decomposition plan, routes steps, validates outputs, and manages retries.

### Pattern 6: Recursive Decomposition (Tree of Specialists)

Combine MAD with recursion — the Orchestrator can decompose a task into subtasks, each of which may themselves require further decomposition.

```
Orchestrator receives: "Summarize this 50-page document"

Decomposition (recursive):
  [Chunker] → splits into 10 chunks (code, no AI)
  For each chunk:
    [Summarizer] → chunk summary
  [Summarizer] → summarize the 10 summaries (recursive call!)
  → Final summary
```

This is a **recursive MapReduce** pattern — the same specialist (Summarizer) is used at multiple levels of the tree. The Orchestrator manages the recursion depth and aggregation.

### Chain Definition Schema

All patterns are expressed as declarative chain configs, stored in R2 alongside model files:

```typescript
interface ChainDefinition {
  id: string;
  name: string;                      // "feedback-analyzer"
  steps: ChainStep[];
  maxTotalLatency?: number;          // budget in ms
}

interface ChainStep {
  id: string;
  type: 'infer' | 'code' | 'branch' | 'loop' | 'parallel' | 'decompose';
  model?: string;                    // for 'infer' steps
  input?: string;                    // template: "{{ steps.prev.output }}"

  // For 'branch'
  condition?: string;                // "{{ steps.classify.output.label }}"
  branches?: Record<string, ChainStep[]>;

  // For 'loop' (Pattern 4)
  maxIterations?: number;
  convergenceField?: string;         // field to check for halt
  convergenceThreshold?: number;

  // For 'parallel' (Pattern 2)
  parallelSteps?: ChainStep[];
  mergeStrategy?: 'concat' | 'vote' | 'first';

  // For 'decompose' (MAD, Pattern 5)
  decompositionStrategy?: string;
  votingK?: number;                  // parallel attempts per step
  retryOnLowConfidence?: boolean;
}
```

---

## Distributed Edge Training (Train on User Data)

### The Opportunity

Frontbase users connect their own data sources (Supabase, Neon, Postgres, MySQL, WordPress). These data sources contain **domain-specific text** — product descriptions, customer feedback, support tickets, blog posts. Instead of training offline, the swarm can **train directly on the user's connected data**, producing custom models tailored to their domain.

This would be a genuine differentiator: **no-code, edge-native model training on your own data.**

### How It Works

```
┌──────────────────────────────────────────────────────────┐
│                FastAPI (Training Control Plane)            │
│                                                          │
│  1. User selects: data source + model type + base model  │
│  2. FastAPI fetches training data from connected source   │
│  3. Chunks data into N batches                           │
│  4. Publishes: base model weights → R2                   │
│                 data batches → R2                         │
│                 training config → Redis                   │
│  5. Dispatches training jobs to Worker fleet              │
└──────────────────────┬───────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────┐
│              EDGE TRAINING SWARM                          │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │            Orchestrator Worker (Training Mode)    │   │
│  │                                                   │   │
│  │  • Tracks which batches are assigned/completed    │   │
│  │  • Collects gradients from training Workers       │   │
│  │  • Aggregates (averages) gradients                │   │
│  │  • Updates global weights in R2                   │   │
│  │  • Monitors convergence (loss trending down?)     │   │
│  └──────┬──────────┬──────────┬──────────────────────┘   │
│         ▼          ▼          ▼                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│  │ Train    │ │ Train    │ │ Train    │                  │
│  │ Worker 1 │ │ Worker 2 │ │ Worker 3 │ ... (N workers)  │
│  │          │ │          │ │          │                  │
│  │ 1. Pull  │ │ 1. Pull  │ │ 1. Pull  │                  │
│  │    weights│ │    weights│ │    weights│                  │
│  │ 2. Load  │ │ 2. Load  │ │ 2. Load  │                  │
│  │    batch  │ │    batch  │ │    batch  │                  │
│  │ 3. Fwd+  │ │ 3. Fwd+  │ │ 3. Fwd+  │                  │
│  │    Bkwd   │ │    Bkwd   │ │    Bkwd   │                  │
│  │ 4. Push  │ │ 4. Push  │ │ 4. Push  │                  │
│  │    grads  │ │    grads  │ │    grads  │                  │
│  └──────────┘ └──────────┘ └──────────┘                  │
│                                                          │
│  Async SGD: Workers don't wait for each other.           │
│  Each grabs next batch immediately after pushing grads.  │
└──────────────────────────────────────────────────────────┘
```

### Training Step Detail

Each Training Worker, per step:

```
1. Pull current global weights from R2    (~40MB for 10M model, ~100-200ms)
2. Pull assigned data batch from R2       (~1-5MB, ~50ms)
3. Forward pass                           (~50-100ms on CPU)
4. Backward pass (compute gradients)      (~100-200ms on CPU)
5. Push gradient tensor to Redis          (~40MB, ~100ms)
6. Don't wait — Orchestrator aggregates asynchronously
7. Pull next batch → repeat
```

**Async SGD (no synchronization barrier):**
Workers don't wait for each other. The Orchestrator periodically averages collected gradients, updates global weights in R2, and Workers pick up the new weights on their next pull. This is **Federated Learning** adapted for edge Workers.

### What Users Could Train

| Model Type | Data Source | Example | Params | Training Time (est.) |
|-----------|------------|---------|--------|---------------------|
| **Custom classifier** | Support tickets | "Is this billing, technical, or general?" | 3-5M | ~30 min on 20 Workers |
| **Domain embeddings** | Product catalog | Semantic search tuned to their vocabulary | 10-20M | ~1-2 hours on 50 Workers |
| **Spam detector** | Form submissions | Learns their specific spam patterns | 3M | ~15 min on 10 Workers |
| **Sentiment model** | Customer reviews | Tuned to their product domain | 5M | ~30 min on 20 Workers |
| **Entity extractor** | Invoices, forms | Extract fields specific to their schema | 10M | ~1 hour on 30 Workers |

### The User Experience (No-Code)

```
Dashboard → AI Models → "Train New Model"

1. Select base model:     [Sentiment Analyzer v1 ▼]
2. Connect data source:   [My Supabase - reviews table ▼]
3. Select columns:
     Text input:   [review_text ▼]
     Label:        [sentiment ▼]     (for supervised training)
4. Training budget:       [50 Workers] [Max 1 hour]
5. [Start Training →]

Progress bar: ████████░░ 80% — Loss: 0.23, Epoch: 3/5

6. Training complete → Model deployed to edge automatically
     New model: "my-sentiment-v1" — 5M params, trained on 12,000 reviews
     [Test It] [Deploy to Production] [View Metrics]
```

### Memory Budget per Training Worker

| Component | Size (10M model) | Fits 128MB? |
|-----------|-----------------|-------------|
| Model weights (int8) | ~10 MB | ✅ |
| Gradients (fp32) | ~40 MB | ✅ |
| Optimizer state (SGD) | ~40 MB | ✅ |
| Data batch | ~1-5 MB | ✅ |
| WASM runtime | ~10 MB | ✅ |
| **Total** | **~100-105 MB** | **⚠️ Tight but feasible** |

Using SGD (not Adam) keeps optimizer state small. For models >10M, would need gradient checkpointing or split across steps.

### Training Safeguards

| Risk | Mitigation |
|------|-----------|
| Stale gradients (async SGD) | Lower learning rate; Orchestrator discards gradients older than N steps |
| Worker timeout (30s paid) | Each training step must complete within 30s — feasible for ≤10M models |
| Data privacy | Training data stays in R2 (user's account) — never leaves their infra boundary |
| Runaway costs | Budget cap: max Workers × max duration, hard stop |
| Bad convergence | Orchestrator monitors loss — auto-stops if loss plateaus or diverges |
| Model too large for CPU training | Gate: only allow training for models ≤20M params on Workers |

---

## Model Registry (Turso)

Track which models exist, where they're stored, and which Workers serve them:

```sql
CREATE TABLE ai_models (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,          -- "sentiment-analyzer"
  version     TEXT NOT NULL,          -- "1.2.0"
  task_type   TEXT NOT NULL,          -- "classification", "embedding", "generation"
  params_m    REAL,                   -- 10.0 (millions)
  size_bytes  INTEGER,               -- file size in R2
  r2_key      TEXT NOT NULL,          -- "models/sentiment-v1.2.0.onnx"
  quantized   BOOLEAN DEFAULT true,
  input_schema  TEXT,                 -- JSON: expected input shape
  output_schema TEXT,                 -- JSON: output shape
  trained_on    TEXT,                 -- data source id (if user-trained)
  training_job_id TEXT,              -- link to training job
  status      TEXT DEFAULT 'active',  -- active | training | deprecated | disabled
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE ai_worker_assignments (
  id          TEXT PRIMARY KEY,
  model_id    TEXT REFERENCES ai_models(id),
  worker_name TEXT NOT NULL,          -- "ai-sentiment-prod-1"
  edge_engine_id TEXT,                -- links to existing EdgeEngine table
  is_warm     BOOLEAN DEFAULT false,
  last_health TEXT,                   -- ISO timestamp
  requests_served INTEGER DEFAULT 0
);

CREATE TABLE ai_training_jobs (
  id              TEXT PRIMARY KEY,
  model_id        TEXT REFERENCES ai_models(id),
  base_model_id   TEXT REFERENCES ai_models(id),
  datasource_id   TEXT,               -- Frontbase connected data source
  status          TEXT DEFAULT 'queued', -- queued | running | completed | failed
  workers_used    INTEGER,
  epochs_target   INTEGER,
  epochs_done     INTEGER DEFAULT 0,
  current_loss    REAL,
  started_at      TEXT,
  completed_at    TEXT,
  r2_checkpoint   TEXT                -- latest weight checkpoint in R2
);
```

---

## Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Model format | ONNX (int8 quantized) | Portable, WASM-compatible, small |
| Edge runtime | `onnxruntime-web` (WASM) | CPU inference in Workers |
| Model storage | Cloudflare R2 | Pennies/GB, edge-proximate, no egress fees |
| Orchestration | **Orchestrator Worker** | Routing, chain execution, training coordination |
| Task dispatch | Upstash Redis | Queue for async tasks, gradient collection |
| State/registry | Turso (SQLite) | Model metadata, assignments, training jobs |
| Control plane | FastAPI (design-time only) | Model registration, deployment, training initiation |
| Compute nodes | Cloudflare Workers | Stateless inference & training hosts |
| Worker-to-Worker | CF Service Bindings | Zero-latency same-account Worker calls |

---

## Cold Start & Warming Strategy

| Phase | Duration | Mitigation |
|-------|----------|------------|
| Worker cold start | ~5 ms | Negligible |
| WASM runtime init | ~50-100 ms | One-time per Worker instance |
| Model load from R2 | ~100-500 ms (depends on size) | **Warming pings** |
| Inference | ~1-10 ms | Already fast |

**Warming strategy:**
- Cron-triggered health pings every 5 minutes for high-priority models
- Pre-warm on deploy (Orchestrator sends a dummy inference request after model publish)
- Track `is_warm` in the registry — route to warm Workers first

---

## Integration with Existing Infrastructure

| Existing System | How It Plugs In |
|----------------|----------------|
| **Edge Engine deploy pipeline** | Same `wrangler deploy` flow — AI Workers are specialized Edge Workers |
| **Redis orchestration (Upstash)** | Already wired — task dispatch, gradient collection |
| **R2 storage** | Already available — ONNX model files, training data batches |
| **Turso persistence** | Already wired — Model Registry + Training Jobs |
| **Workflow automation engine** | New node type: "AI Inference" — picks model, sends input, returns output |
| **Connected data sources** | User's Supabase/Neon/Postgres → training data source |
| **Fan-out publish pipeline** | Extend to deploy model files + swarm config |
| **Health monitoring** | Extend existing heartbeat to include model warm/cold status |
| **Queue module (`engine/queue.ts`)** | Reuse for async inference and training job dispatch |
| **Bundle checksums** | Apply to model files — detect when a model is outdated |

---

## Model Catalog (Target)

| Model Name | Task | Est. Params | Size (int8) | Priority |
|-----------|------|-------------|-------------|----------|
| `intent-classifier` | Classify user intent | 5M | ~5 MB | 🟢 High |
| `sentiment-analyzer` | Positive / negative / neutral | 5-10M | ~5-10 MB | 🟢 High |
| `spam-filter` | Detect spam form submissions | 3M | ~3 MB | 🟢 High |
| `text-embedder` | Semantic search / RAG | 20-30M | ~20-30 MB | 🟢 High |
| `language-detector` | Identify input language | 2M | ~2 MB | 🟡 Medium |
| `summarizer` | Compress long text | 30-50M | ~30-50 MB | 🟡 Medium |
| `entity-extractor` | Pull names, dates, amounts from text | 10-20M | ~10-20 MB | 🟡 Medium |
| `response-generator` | Generate short replies | 30-50M | ~30-50 MB | 🔴 Later |
| `image-classifier` | Categorize uploaded images | 10-20M | ~10-20 MB | 🔴 Later |

---

## Automation Integration

### New Workflow Node: `ai-inference`

```typescript
// Workflow definition
{
  type: "ai-inference",
  config: {
    model: "sentiment-analyzer",      // from Model Registry
    input: "{{ trigger.body.text }}", // LiquidJS template
    timeout_ms: 5000,
    fallback: "neutral"               // if inference fails
  }
}
```

### Example: AI-Powered Contact Form

```
Trigger: Form submission
  → Node 1: ai-inference (spam-filter)
      → If spam → discard + log
  → Node 2: ai-inference (sentiment-analyzer)
  → Node 3: ai-inference (intent-classifier)
  → Node 4: Route by intent
      → "support" → create ticket in external API
      → "feedback" → store in Turso + notify Slack
      → "question" → ai-inference (response-generator) → auto-reply
```

---

## Open Questions

1. **ONNX WASM loading at runtime** — Can Workers fetch the WASM binary from R2 at runtime (not bundled)? This avoids the 10MB bundle limit.
2. **R2 loading latency benchmarks** — Need real numbers for 5MB / 20MB / 50MB model loads from R2 in a Worker.
3. **Model versioning** — How to handle rollback? Blue/green with two Worker versions?
4. **Multi-tenant isolation** — Single Worker serving multiple models (switched by request param) vs. dedicated Worker per model?
5. **Inference cost accounting** — Track per-model request counts + CPU time for future billing.
6. **Service Bindings limits** — How many Service Bindings can one Orchestrator Worker have? (Currently ~6-8 per account.)
7. **ONNX backward pass in WASM** — Does `onnxruntime-web` support gradient computation, or do we need a custom training runtime?
8. **Async SGD convergence** — Optimal learning rate and staleness threshold for gradient aggregation on Workers?
9. **Connected data sampling** — Best strategy for pulling representative training batches from user data sources?

## Next Steps

- [ ] Prototype: Load a tiny ONNX model (5M params) in a Worker via R2
- [ ] Benchmark: ONNX inference latency in WASM (classification task, 5M params)
- [ ] Benchmark: R2 model load latency (5MB, 20MB, 50MB files)
- [ ] Benchmark: Cold start overhead (WASM init + model load + first inference)
- [ ] Prototype: Orchestrator Worker with Service Binding to one specialist
- [ ] Design: Chain Engine — implement linear + parallel + loop patterns
- [ ] Design: Model Registry schema in Turso
- [ ] Design: Automation node type "AI Inference" in workflow engine
- [ ] Design: Model deploy CLI / UI in FastAPI dashboard
- [ ] Design: Warming cron strategy
- [ ] Prototype: Composition chain (language detect → translate → classify → respond)
- [ ] Research: ONNX backward pass feasibility in WASM
- [ ] Design: Training job UI (data source selection → model training → deploy)
- [ ] Prototype: Single-Worker training loop (forward + backward + gradient push)

---

## Appendix: Pipeline Parallelism (Reference Only)

> **Deprioritized.** Kept for reference. Only relevant if a model is too large for a single Worker (>100M params quantized), which is outside the current target range.

```
Orchestrator → decomposes model into layer groups
    → Worker 1: Layers 1-4 (weights loaded from R2)
    → Worker 2: Layers 5-8
    → Worker 3: Layers 9-12
    → Redis: passes activation tensors between stages
    → Final aggregation Worker → response
```

- **Cons:** Latency grows with hops, activation tensors can be megabytes, serial dependency kills parallelism.
- **When to revisit:** Only if there's a need for models >100M params that can't be substituted by a chain of smaller specialists.
