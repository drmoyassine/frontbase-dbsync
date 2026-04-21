/**
 * Tenant Middleware — Multi-tenant subdomain routing for Community Engines
 *
 * Extracts the tenant slug from the Host header and sets it on the request
 * context so downstream handlers (pages, seo, embed) can scope queries.
 *
 * Routing logic:
 *   - `acme.frontbase.dev`  → tenantSlug = 'acme'
 *   - `app.frontbase.dev`   → skipped (SPA login, not a tenant)
 *   - `frontbase.dev`       → skipped (no subdomain)
 *   - Custom domains         → skipped (no base domain match)
 *   - Self-host (no env)    → tenantSlug = '_default'
 *
 * Env vars:
 *   - FRONTBASE_BASE_DOMAIN: The base domain for tenant subdomains (e.g. 'frontbase.dev')
 *   - FRONTBASE_DEPLOYMENT_MODE: Must be 'cloud' to activate subdomain routing
 *
 * AGENTS.md §2.1: Edge Self-Sufficiency — middleware resolves tenant from
 * the request itself, no calls to FastAPI.
 */

import type { MiddlewareHandler } from 'hono';

// Subdomains that are reserved and NOT tenants
const RESERVED_SUBDOMAINS = new Set([
    'app',       // SPA login
    'api',       // API gateway (future)
    'www',       // Marketing site
    'admin',     // Admin panel
    'status',    // Status page
    'docs',      // Documentation
]);

/**
 * Extract tenant slug from the Host header.
 *
 * Returns:
 *   - The subdomain string if it's a tenant (e.g. 'acme')
 *   - undefined if the request doesn't match a tenant subdomain
 *   - '_reserved' if the subdomain is in the reserved list
 */
function extractTenantSlug(host: string, baseDomain: string): string | undefined {
    // Remove port if present
    const hostOnly = host.split(':')[0].toLowerCase();
    const base = baseDomain.toLowerCase();

    // Must end with the base domain
    if (!hostOnly.endsWith(base)) return undefined;

    // Extract the subdomain part: "acme.frontbase.dev" → "acme"
    const prefix = hostOnly.slice(0, -(base.length + 1)); // +1 for the dot

    // No subdomain (bare domain)
    if (!prefix || prefix.includes('.')) return undefined;

    // Reserved subdomains
    if (RESERVED_SUBDOMAINS.has(prefix)) return '_reserved';

    return prefix;
}

/**
 * Tenant middleware for Hono.
 *
 * When FRONTBASE_DEPLOYMENT_MODE=cloud and FRONTBASE_BASE_DOMAIN is set:
 * - Extracts tenant slug from subdomain
 * - Sets `tenantSlug` on the context for downstream handlers
 * - Returns 404 for unregistered tenant subdomains (currently all are allowed;
 *   registration check will be added when tenant DB lookup is wired)
 *
 * When not in cloud mode: sets tenantSlug = '_default' (single-tenant).
 */
export const tenantMiddleware: MiddlewareHandler = async (c, next) => {
    const deploymentMode = process.env.FRONTBASE_DEPLOYMENT_MODE || '';
    const baseDomain = process.env.FRONTBASE_BASE_DOMAIN || '';

    // Self-host or no base domain configured → single tenant
    if (deploymentMode !== 'cloud' || !baseDomain) {
        c.set('tenantSlug', '_default');
        return next();
    }

    const host = c.req.header('host') || '';
    const tenantSlug = extractTenantSlug(host, baseDomain);

    // No subdomain or custom domain → single-tenant fallback
    if (!tenantSlug) {
        c.set('tenantSlug', '_default');
        return next();
    }

    // Reserved subdomain (app, www, etc.) → skip tenant routing entirely
    if (tenantSlug === '_reserved') {
        c.set('tenantSlug', '_default');
        return next();
    }

    // Set tenant slug on context for downstream handlers
    c.set('tenantSlug', tenantSlug);
    console.log(`[Tenant] Resolved tenant: ${tenantSlug} (host: ${host})`);

    return next();
};

/**
 * Render a "Workspace not found" HTML page.
 * Used when a tenant subdomain has no published pages.
 */
export function renderWorkspaceNotFound(tenantSlug: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workspace Not Found</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 480px;
    }
    .code {
      font-size: 6rem;
      font-weight: 700;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: #f0f0f0;
    }
    p {
      font-size: 1rem;
      color: #888;
      line-height: 1.6;
    }
    .slug {
      display: inline-block;
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
      padding: 0.2em 0.6em;
      border-radius: 6px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.9em;
    }
    .footer {
      margin-top: 2rem;
      font-size: 0.8rem;
      color: #555;
    }
    .footer a { color: #6366f1; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="code">404</div>
    <h1>Workspace Not Found</h1>
    <p>
      The workspace <span class="slug">${tenantSlug}</span> doesn\u2019t have any published pages yet,
      or the workspace doesn\u2019t exist.
    </p>
    <p class="footer">
      Powered by <a href="https://frontbase.dev" target="_blank" rel="noopener">Frontbase</a>
    </p>
  </div>
</body>
</html>`;
}
