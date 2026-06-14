// src/middleware/tenant.ts
var RESERVED_SUBDOMAINS = /* @__PURE__ */ new Set([
  "app",
  // SPA login
  "api",
  // API gateway (future)
  "www",
  // Marketing site
  "admin",
  // Admin panel
  "status",
  // Status page
  "docs"
  // Documentation
]);
function extractTenantSlug(host, baseDomain) {
  const hostOnly = host.split(":")[0].toLowerCase();
  const base = baseDomain.toLowerCase();
  if (!hostOnly.endsWith(base)) return void 0;
  const prefix = hostOnly.slice(0, -(base.length + 1));
  if (!prefix || prefix.includes(".")) return void 0;
  if (RESERVED_SUBDOMAINS.has(prefix)) return "_reserved";
  return prefix;
}
var tenantMiddleware = async (c, next) => {
  const deploymentMode = process.env.FRONTBASE_DEPLOYMENT_MODE || "";
  const baseDomain = process.env.FRONTBASE_BASE_DOMAIN || "";
  if (deploymentMode !== "cloud" || !baseDomain) {
    c.set("tenantSlug", "_default");
    return next();
  }
  const host = c.req.header("host") || "";
  const tenantSlug = extractTenantSlug(host, baseDomain);
  if (!tenantSlug) {
    c.set("tenantSlug", "_default");
    return next();
  }
  if (tenantSlug === "_reserved") {
    c.set("tenantSlug", "_default");
    return next();
  }
  c.set("tenantSlug", tenantSlug);
  console.log(`[Tenant] Resolved tenant: ${tenantSlug} (host: ${host})`);
  return next();
};
function renderWorkspaceNotFound(tenantSlug) {
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

export {
  tenantMiddleware,
  renderWorkspaceNotFound
};
