# Edge AI Hosting Plan

> Scratchpad for architecting distributed edge-native AI inference on Cloudflare Workers.

## Vision

Run small LLMs (million-parameter range) across distributed edge Workers, orchestrated by Redis, with FastAPI as the control plane. Not loading full models onto Workers — decomposing compute or using specialized micromodels.

## Feasibility Analysis

### Worker Constraints

| Resource | Free Plan | Paid ($5/mo) |
|----------|-----------|-------------|
| CPU time/request | 10 ms | 30 seconds |
| Memory | 128 MB | 128 MB |
| Worker size | 10 MB | 10 MB |
| WASM | ✅ Supported | ✅ Supported |
| GPU | ❌ None | ❌ None (use Workers AI) |
| Workers limit | 100 | 500 |

### Model Size vs Worker Memory

| Model params | FP32 | INT8 (quantized) | Fits 128 MB? |
|-------------|------|-------------------|-------------|
| 10M | ~40 MB | ~10 MB | ✅ Easy |
| 50M | ~200 MB | ~50 MB | ✅ Yes |
| 100M | ~400 MB | ~100 MB | ⚠️ Tight |
| 1B | ~4 GB | ~1 GB | ❌ No |

**Conclusion:** Models up to ~50M params (quantized) fit comfortably. 100M is borderline.

---

## Architecture Patterns

### Pattern A: Pipeline Parallelism (AirLLM-inspired)

```
FastAPI (model host) → decomposes into layer groups
    → Worker 1: Layers 1-4 (weights loaded from R2)
    → Worker 2: Layers 5-8
    → Worker 3: Layers 9-12
    → Redis: passes activation tensors between stages
    → Final aggregation Worker → response
```

- **Pros:** Distributes memory, horizontal throughput scaling
- **Cons:** Latency grows with hops, Redis serialization overhead
- **Best for:** High-throughput batch inference, not interactive chat

### Pattern B: Micromodel Swarm (recommended starting point)

```
FastAPI orchestrates, Redis dispatches:
    → Worker A: Intent classifier (5M params, ONNX)
    → Worker B: Embedding model (20M params, ONNX)
    → Worker C: Sentiment analyzer (10M params, ONNX)
    → Worker D: Response generator (50M params, ONNX)
```

- **Pros:** Each model is tiny, fits easily, task-specific, independently scalable
- **Cons:** Requires decomposing problem into discrete tasks
- **Best for:** AI-powered automations, content processing pipelines

### Pattern C: Hybrid — FastAPI GPU + Edge Cache/Route

```
User → Edge Worker (cache check) → FastAPI GPU inference → Edge Worker (cache set + respond)
```

- Workers handle routing, caching, pre/post-processing
- FastAPI or Workers AI handles actual GPU inference
- **Simplest to implement, biggest immediate value**

---

## Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Model format | ONNX | Portable, WASM-compatible |
| Edge runtime | `onnxruntime-web` (WASM) | Inference in Workers |
| Model storage | Cloudflare R2 | Pennies/GB, edge-proximate |
| Orchestration | Upstash Redis | Task dispatch, activation passing |
| State | Turso | Results persistence |
| Control plane | FastAPI | Model management, decomposition |
| Workers | Cloudflare Workers | Compute nodes |

## Key References

- [AirLLM](https://github.com/lyogavin/airllm) — Layer-by-layer inference with minimal memory
- [onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web) — ONNX inference in WASM
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) — GPU inference at edge
- [Cloudflare R2](https://developers.cloudflare.com/r2/) — Object storage for model weights

## Existing Infrastructure (already built)

- ✅ Edge Workers connected to Cloudflare
- ✅ Redis orchestration (Upstash) wired
- ✅ Workflow/automation engine in Edge Engine
- ✅ Turso state persistence
- ✅ Deployment targets + fan-out publish pipeline

## Open Questions

1. **ONNX in WASM bundle size** — Does `onnxruntime-web` WASM binary fit within 10 MB Worker limit?
2. **R2 model loading latency** — How fast can a Worker load a 50 MB model from R2 on cold start?
3. **Activation tensor serialization** — What format for passing tensors via Redis? (MessagePack? raw Float32Array?)
4. **Cold start impact** — Workers have ~5ms cold start, but loading WASM + model could add latency
5. **Multi-tenant model isolation** — Can different projects use different models on the same Worker?

## Next Steps (future sessions)

- [ ] Prototype: Load a tiny ONNX model (5M params) in a Worker via R2
- [ ] Benchmark: ONNX inference latency in WASM vs. Python (FastAPI)
- [ ] Benchmark: Redis activation passing overhead
- [ ] Design: Model registry in Turso (which models, which Workers, versioning)
- [ ] Design: Automation node type for "Edge AI Inference"
