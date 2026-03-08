# Backlog — Future Roadmap

> Items here are not on the immediate roadmap. They are parked for future consideration.

---

## Edge Database — Direct Postgres via TCP

**What**: Add a "Self-Hosted Postgres" edge database provider using `postgresjs` (Postgres.js) for raw TCP connections from the edge — no PostgREST, no Neon, no Supabase middleware.

**Why**: Users with their own Postgres (VPS, managed, on-prem) could connect it directly as an edge state database without deploying any intermediary layer.

**Limitation**: Only works on runtimes with TCP support (Deno Deploy, Supabase Edge). **Does not work on Cloudflare Workers** (no TCP without Hyperdrive). This breaks the unified architecture principle — we'd need adapter-specific code paths.

**Decision**: Parked. Unified architecture (works on all adapters) takes priority. Revisit when/if Cloudflare adds native TCP or if a Deno-only deployment mode is introduced.

**Deno modules**: `postgresjs` (4,631 ★), `postgres` (528 ★)

---

## Deno Module Registry Audit

**What**: Programmatically review all 7,739 modules on `deno.land/x` via `apiland.deno.dev/v2/modules` API. Identify modules relevant to edge engine capabilities (HTML transforms, image processing, auth, DB drivers, etc.).

**API**: `GET https://apiland.deno.dev/v2/modules?limit=100&sort=popularity&page={N}` — 78 pages.

**Modules of interest** (from top 100):

| Module | Stars | Description |
|--------|-------|-------------|
| `html_rewriter` | 14 | WASM port of CF HTMLRewriter — SSR transforms on non-CF runtimes |
| `deno_dom` | 328 | DOM parser for Deno — HTML manipulation without a browser |
| `imagescript` | 461 | Zero-dep image manipulation |
| `postgresjs` | 4,631 | Direct Postgres via TCP (see above) |
| `redis` | 430 | TCP Redis client (only Deno, not CF) |

**Status**: Script to dump full registry not yet written. To be done in future session.

---

## Edge — `html_rewriter` for Non-CF SSR

**What**: Use `deno.land/x/html_rewriter` (WASM) to enable Cloudflare-style HTML streaming transforms on Deno Deploy and Supabase Edge Functions. Currently only CF Workers have `HTMLRewriter` built-in.

**Use case**: SSR page post-processing — inject scripts, modify meta tags, add CSP nonces, streaming HTML transforms.

**Companion**: `deno_dom` for full DOM parse-and-modify (non-streaming).

**Status**: Research item. Not blocking any current feature.

---

## Edge Zero Trust Mesh — Secure Edge-to-Edge Communications

> **Full design doc**: [edge-zero-trust-mesh.md](./edge-zero-trust-mesh.md)

**Vision**: Enterprise-grade secure communications between edge nodes and message brokers, with dynamic topology. Respects edge self-sufficiency — no backend calls after deployment.

**Key approach**: Decentralized PKI using `jose` library (EdDSA). Backend acts as CA at deploy time, bakes trust chain into each edge. Edges verify each other at runtime without backend.

**Status**: Parked. Post-MVP infrastructure. Unified integrations layer and provider audit come first.

