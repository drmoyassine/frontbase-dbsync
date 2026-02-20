# Frontbase Backlog

## Performance
- [ ] **Replace Tailwind CDN with build-time CSS generation** — Currently SSR pages load `cdn.tailwindcss.com` (~300KB JS) for runtime class compilation. Replace with Tailwind CLI at publish time: scan `layoutData` component classes → generate static CSS → inject as `cssBundle`. Eliminates external dependency, console warning, and ~300KB load per page.
- [ ] **Backend Redis Caching** — Extend Redis caching to FastAPI backend for data source operations. Cache table/column metadata (Schema Discovery), external API caching, and rate limiting.

## Data Layer & Tables
- [ ] **User-configurable FK display columns** — Allow users to select which columns to display for foreign key relationships.
- [ ] **Optimized fetching** — Select specific columns instead of `*` for better performance.
- [ ] **Heuristic FK detection fallback** — Auto-detect foreign keys based on column names if DB schema lacks explicit FKs.
- [ ] **Multi-level relation support** — Support fetching data for nested foreign key relationships.

## Integration & Deployment
- [ ] **Multi-Database Support** — Neon/PlanetScale HTTP drivers, Self-hosted Postgres/MySQL support.
- [ ] **Local Data Proxy (Hybrid Edge)** — Connect Edge workers to local/private infrastructure (Redis, SQL) without public IPs using tools like `serverless-redis-http` or Cloudflare Tunnels.
- [ ] **One-Click Integrations** — Simplify connecting third-party services (Upstash auto-create, Supabase project selector, Vercel auto-deploy).
- [ ] **Conditional Service Deployment** — Optimize local dev by using Docker Compose `profiles` to start only necessary services (e.g. SQLite vs Postgres).

## Enterprise & Security
- [ ] **Enterprise Secrets Management** — Self-hosted Infisical integration for deploy-time secrets injection, E2E encrypted storage, audit logs.
- [ ] **GDPR Compliance Enhancements** — Cookie Consent Banner, IP Anonymization Toggle (`anonymizeIPs`), auto-generated Privacy Policy Template, Data Retention Controls.

## Storage & Assets
- [ ] **Storage Architecture Refactor** — Move admin storage APIs to FastAPI. On-demand edge shipping (tree-shaking storage routes from edge bundle).
- [ ] **Storage Provider Selector** — Dropdown in Settings to select default storage provider (multi-provider support: Supabase, S3, R2).

## Enhancements & App Experience
- [ ] **PWA Support for Published Apps** — Dynamic Manifest, Service Worker (Cache-first for static, Network-first for API), offline support, "Add to Home Screen" prompt.
- [ ] **Custom WebSockets** — Custom WebSocket implementation for real-time workflow execution streaming (replacing Supabase Realtime).
- [ ] **Observability** — Axiom/Sentry logging integration, OpenTelemetry tracing.
