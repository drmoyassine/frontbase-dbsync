# API contracts

The OpenAPI contract is a **committed, generated artifact** — the single source
of truth for the frontend (typed client) and, downstream, for the
frontbase-framework backend (which reimplements the community-edition surface).

## Files

| File | What |
|---|---|
| `openapi.full.json` | The full (`DEPLOYMENT_MODE=cloud`) surface. Each operation carries `x-edition: community \| cloud` (derived — an op is `community` iff it also exists self-host). |
| `openapi.community.json` | The self-host surface. **This is what the framework must implement** (CF-22 P1/P2). |
| `openapi_gaps.json` | Ratchet baseline of routes whose success response is still untyped. Must only shrink. (Currently empty.) |

These are regenerated, never hand-edited.

## Regenerate

```bash
# from repo root
npm run contracts:export     # fastapi-backend/venv ... export_openapi.py
npm run client:generate      # regen src/client from the spec
```

## Gates (enforced in CI — `.github/workflows/contracts.yml`)

- **Staleness:** `export_openapi.py --check` regenerates and fails if the
  committed spec differs from the routers. The frontend job does the same for
  `src/client`.
- **Hygiene:** `openapi_check.py` hard-fails on missing/duplicate `operationId`,
  missing tags / `x-edition`, module-prefixed schema names (duplicate classes),
  and ratchets untyped responses (new untyped route → fail).

## Adding a route

1. Add the router handler with a `response_model` (or `status_code=204` for a
   no-content delete) and ensure the operation lands under the right
   `tags=[...]`.
2. `npm run contracts:export && npm run client:generate`.
3. Commit the spec, the client, and the router together. CI will reject a
   router change that doesn't regenerate both.
