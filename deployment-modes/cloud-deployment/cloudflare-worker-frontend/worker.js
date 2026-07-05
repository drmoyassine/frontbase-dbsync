/**
 * Cloudflare Worker — Frontbase Admin SPA host + API reverse proxy.
 *
 * Serves the Vite-built admin SPA (dist/) and forwards API/edge traffic to the
 * VPS gateway (the core-tier api-gateway, which itself splits backend vs edge).
 *
 * WHY a proxy is required: the SPA hardcodes SAME-ORIGIN request paths in
 * production (src/lib/portConfig.ts -> baseUrl ''), so it calls /api/* on its
 * own host. There is no build flag to point it at a different API origin, and
 * a cross-origin split would also break credentialed requests. So this Worker
 * plays the role the nginx "static tier" plays in the all-in-compose setup.
 *
 * BASE PATH: cloud builds live under /admin/ (vite.config.ts base). The admin
 * shell is therefore served for /admin and /admin/* ; the SPA's client router
 * handles sub-routes. "/" is proxied to the gateway too, so published SSR
 * pages resolve if you point this same domain at content (usually you don't —
 * published sites get their own domains on the edge).
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, search } = url;

    // 1. API + edge traffic -> VPS gateway (backend/edge split happens there).
    //    Covers /api/*, /static/*, /edge/* — every server route the SPA calls.
    if (
      pathname.startsWith("/api/") ||
      pathname.startsWith("/static/") ||
      pathname.startsWith("/edge/")
    ) {
      const target = new URL(pathname + search, env.GATEWAY_ORIGIN);
      // Preserve method, headers, body, and the Supabase Bearer token.
      return fetch(new Request(target, request));
    }

    // 2. Admin SPA assets + shell.
    //    The SPA is built with Vite base '/admin/', so it requests
    //    /admin/assets/... — but the built files live at dist/ ROOT
    //    (dist/assets/..., dist/index.html). CF's ASSETS.fetch matches the URL
    //    path to the file path literally, so we STRIP the /admin prefix before
    //    serving. index.html itself still references /admin/assets/... which
    //    the browser then re-requests through this same stripping path.
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      const inner = pathname.replace(/^\/admin/, "") || "/";
      const assetReq = new Request(new URL(inner + search, url), request);
      const res = await env.ASSETS.fetch(assetReq);
      if (res.status !== 404) return res;
      // SPA client-route fallback: serve the shell for unknown /admin/* routes
      // (but NOT for a missing hashed asset, which must stay a real 404).
      // Fetch the canonical root "/" (CF Assets serves index.html for it and
      // strips a literal "/index.html" via a 307, so we must NOT ask for that).
      const last = pathname.split("/").pop() || "";
      if (!last.includes(".")) {
        return env.ASSETS.fetch(new Request(new URL("/", url), { method: "GET" }));
      }
      return res;
    }

    // 3. Bare root -> send users to the admin panel.
    if (pathname === "/") {
      return Response.redirect(new URL("/admin/", url).toString(), 302);
    }

    // 4. Anything else (published SSR pages, if this domain also fronts them)
    //    -> gateway. Remove this block if the Worker only serves the admin SPA.
    const target = new URL(pathname + search, env.GATEWAY_ORIGIN);
    return fetch(new Request(target, request));
  },
};
