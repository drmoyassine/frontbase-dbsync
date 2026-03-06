# Self-Describing Engine Bundles

> Deploy once, discover everywhere — engines advertise their own capabilities.

## What It Does
Every Frontbase Edge Engine exposes a public `/api/manifest` endpoint that describes what the engine is, what it can do, and when it was last deployed. Any Frontbase instance that imports the engine automatically gets GPU model badges, capability tags, and binding information — no manual configuration.

## How It Works

```
┌──────────────────┐         GET /api/manifest         ┌─────────────────────┐
│  Frontbase (VPS) │  ─────────────────────────────►   │  Edge Engine (CF)   │
│  Control Plane   │  ◄─────────────────────────────   │  Running Worker     │
│                  │     { gpu_models, capabilities,   │                     │
│  → Creates GPU   │       bindings, deployed_at }     │  Reads from live    │
│    model records │                                   │  in-memory state    │
│  → Updates badge │                                   │                     │
└──────────────────┘                                   └─────────────────────┘
```

| Field | Source | Example |
|-------|--------|---------|
| `engine_name` | Env var | `frontbase-edge-please` |
| `adapter_type` | Platform detection | `full` |
| `capabilities` | Derived from features | `["ssr", "workflows", "ai"]` |
| `gpu_models` | In-memory registry | `[{slug, model_id, model_type}]` |
| `bindings` | Env var detection | `{db: "turso", cache: "upstash"}` |
| `deployed_at` | Deploy timestamp | ISO 8601 |
| `bundle_checksum` | Build hash | Content hash for staleness |

## Key Capabilities
- **Zero-config import**: Import a CF Worker → AI badge automatically appears
- **Cross-instance sharing**: Different Frontbase instances get the same metadata from the same worker
- **Auto-update on redeploy**: Manifest syncs automatically after every deploy/redeploy
- **No secrets exposed**: Only binding *types* shown (e.g., "turso"), never credentials
- **Backward compatible**: Non-Frontbase workers simply return 404 on `/api/manifest` — silently ignored

## Graceful Degradation
- If the engine doesn't respond (offline, non-Frontbase) → import proceeds normally, no badge
- If manifest is unreachable after redeploy → metadata stays at last-known state
- If GPU models section is empty → no AI badge, other metadata still synced

## Configuration
No configuration needed — the manifest is dynamically generated from live engine state. Deployed automatically with every engine bundle.

**Status**: ✅ Production
