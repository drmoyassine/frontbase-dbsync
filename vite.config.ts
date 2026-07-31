import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs";
import zlib from "node:zlib";
import { build as esbuildBuild } from "esbuild";
import { componentTagger } from "lovable-tagger";

// Cache busting timestamp - update this to force browser cache invalidation
const BUILD_TIMESTAMP = new Date().getTime();

// ---------------------------------------------------------------------------
// Phase E — builder-scoped Service Worker build pass.
//
// The builder SW (src/sw/builder-sw.ts) imports renderPage/renderDocument from
// @frontbase/edge-core — the SAME workspace package the framework cf-full
// worker uses — so canvas re-renders happen LOCALLY in the SW thread with zero
// drift vs /builder/api/reRender. @frontbase/edge-core is NOT a dependency of
// this product repo and is not on its tsconfig paths, so we resolve it
// explicitly against the framework workspace's compiled dist (the worker
// imports the same dist/index.js).
//
// Strategy: a tiny vite plugin that runs an esbuild pass. esbuild is already a
// transitive dependency of vite (the bundler vite itself uses for deps), so
// this adds NO new dependency. We use esbuild rather than a second vite
// build/rollup pass because (a) the SW is a single self-contained entry with
// one external workspace package — exactly esbuild's sweet spot — and (b) it
// must emit a fixed-name `builder-sw.js` at the dist root (NOT under the
// hashed assets/ folder, so the registration module can address it by a stable
// URL), which vite's main rollup pass cannot do without fighting the
// assetFileNames template above. vite-plugin-sw / @vite-pwa were rejected as
// overkill: they carry Workbox precaching opinions this SW does not want.
//
// Build:  closeBundle -> dist/builder-sw.js (the production asset).
// Dev:    configureServer middleware serves the same bundle at
//         `${base}builder-sw.js` so vite dev has SW parity (rebuilt lazily and
//         cached; restart vite to pick up SW-source edits).
// ---------------------------------------------------------------------------

// The framework repo is checked out as a sibling of this product repo. We also
// keep an absolute fallback so the build still resolves when the repos are not
// laid out as siblings.
const FRAMEWORK_EDGE_CORE_CANDIDATES = [
  path.resolve(__dirname, "../frontbase-framework/packages/edge-core/dist/index.js"),
  "C:/Users/PC/OneDrive - studygram.me/VsCode/frontbase-framework/packages/edge-core/dist/index.js",
];

function resolveEdgeCoreEntry(): string {
  for (const candidate of FRAMEWORK_EDGE_CORE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "[builderSwPlugin] Could not resolve @frontbase/edge-core dist. Looked for:\n  " +
      FRAMEWORK_EDGE_CORE_CANDIDATES.join("\n  ") +
      "\nBuild the framework package first (npm run build in frontbase-framework/packages/edge-core).",
  );
}

function builderSwPlugin(): Plugin {
  const swSourcePath = path.resolve(__dirname, "src/sw/builder-sw.ts");
  const edgeCoreEntry = resolveEdgeCoreEntry();

  /** Bundle the SW with esbuild. Returns the JS string + byte stats. */
  async function bundleBuilderSw(outFile?: string): Promise<{ bytes: number; gzipped: number; js: string }> {
    const result = await esbuildBuild({
      entryPoints: [swSourcePath],
      bundle: true,
      // IIFE, not ESM: a classic SW needs no {type:'module'} registration and
      // works on every browser that supports SWs. esbuild inlines every import
      // (including the framework dist + liquidjs) into one self-contained file.
      format: "iife",
      platform: "browser",
      target: "es2020",
      minify: true,
      sourcemap: false,
      // The SW ships internal builder tooling; strip license comments to keep
      // the payload inside the ~200-500 KB budget.
      legalComments: "none",
      alias: {
        // Pin the SW to the SAME edge-core the cf-full worker imports. A bare
        // `@frontbase/edge-core` would otherwise fail to resolve (not in this
        // repo's node_modules / tsconfig paths).
        "@frontbase/edge-core": edgeCoreEntry,
      },
      write: !!outFile,
      ...(outFile ? { outfile: outFile } : {}),
    });

    if (result.errors.length > 0) {
      throw new Error(
        `[builderSwPlugin] SW bundle failed:\n` +
          result.errors.map((e) => e.text).join("\n"),
      );
    }
    if (result.warnings.length > 0) {
      console.warn("[builderSwPlugin] esbuild warnings:\n" + result.warnings.map((w) => w.text).join("\n"));
    }

    const js = outFile ? fs.readFileSync(outFile, "utf8") : result.outputFiles![0].text;
    const bytes = outFile ? fs.statSync(outFile).size : Buffer.byteLength(js);
    const gzipped = zlib.gzipSync(js).length;
    return { bytes, gzipped, js };
  }

  return {
    name: "frontbase-builder-sw",
    // Build: emit dist/builder-sw.js after the main rollup pass finishes, so the
    // SPA bundle and the SW land in dist together from a single `vite build`.
    apply: "build",
    async closeBundle() {
      const outFile = path.resolve(__dirname, "dist/builder-sw.js");
      await fs.promises.mkdir(path.dirname(outFile), { recursive: true });
      const { bytes, gzipped } = await bundleBuilderSw(outFile);
      const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
      console.log(
        `[builder-sw] emitted dist/builder-sw.js — ${kb(bytes)} raw, ${kb(gzipped)} gzipped`,
      );
    },
  };
}

/**
 * Dev-only middleware that serves the freshly bundled SW so `vite dev` has SW
 * parity with production. Registered separately so it never runs during
 * `vite build` (where closeBundle owns emission).
 */
function builderSwDevMiddleware(): Plugin {
  let cached: { js: string; mtime: number } | null = null;
  const swSourcePath = path.resolve(__dirname, "src/sw/builder-sw.ts");
  return {
    name: "frontbase-builder-sw-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        // Base-agnostic match: serve at <base>builder-sw.js in every mode.
        if (!url.split("?")[0].endsWith("/builder-sw.js")) return next();
        try {
          const mtime = fs.statSync(swSourcePath).mtimeMs;
          if (!cached || cached.mtime !== mtime) {
            const { js } = await (async () => {
              // Reuse the bundler without writing to disk.
              const result = await esbuildBuild({
                entryPoints: [swSourcePath],
                bundle: true,
                format: "iife",
                platform: "browser",
                target: "es2020",
                minify: true,
                sourcemap: false,
                legalComments: "none",
                alias: { "@frontbase/edge-core": resolveEdgeCoreEntry() },
                write: false,
              });
              return { js: result.outputFiles![0].text };
            })();
            cached = { js, mtime };
          }
          res.setHeader("Content-Type", "text/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(cached.js);
        } catch (err) {
          console.error("[builder-sw] dev bundle failed:", err);
          res.statusCode = 500;
          res.end("// builder-sw bundle failed — see server log");
        }
      });
    },
  };
}



// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  // Edition-aware base path: cloud → /admin/, self-host → /frontbase-admin/
  const deploymentMode = env.VITE_DEPLOYMENT_MODE || 'self-host';
  const basePath = deploymentMode === 'cloud' ? '/admin/' : '/frontbase-admin/';

  return {
    base: basePath,
    build: {
      // Add cache busting to asset filenames
      sourcemap: false,
      rollupOptions: {
        output: {
          // Use content-based hash + timestamp for aggressive cache busting
          assetFileNames: `assets/[name]-[hash]-${BUILD_TIMESTAMP}[extname]`,
          chunkFileNames: `assets/[name]-[hash]-${BUILD_TIMESTAMP}.js`,
          entryFileNames: `assets/[name]-[hash]-${BUILD_TIMESTAMP}.js`,
        },
      },
    },
    server: {
      host: "::",
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:8000', // Redirect all API calls to FastAPI
          changeOrigin: true,
          secure: false,
          timeout: 360000, // 6 min — Vercel/Netlify deploys can take 3-5 min (bundle + CLI + upload)
          onProxyReq: (proxyReq: any, req: any, res: any) => {
            // Add CORS headers for development
            proxyReq.setHeader('Access-Control-Allow-Origin', '*');
            proxyReq.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            proxyReq.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          },
          onError: (err: any, req: any, res: any) => {
            // Handle proxy errors gracefully
            if (req.url?.includes('/api/')) {
              console.warn(`[Vite-Proxy] Backend unavailable at ${err.host}:${err.port}`);
              if (!res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: false,
                  message: 'Backend service unavailable',
                  error: 'Backend service is not running'
                }));
              }
            }
          },
          onProxyRes: (proxyRes: any, req: any, res: any) => {
            // Clean up response headers to avoid CORS issues
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['x-content-type-options'];
          }
        },
        // Static assets (favicon, logos) stored on backend
        '/static': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        // Actions Engine proxy
        '/actions': {
          target: 'http://localhost:3002',
          changeOrigin: true,
          secure: false,
          rewrite: (path: string) => path.replace(/^\/actions/, ''),
        },
        // Framework builder worker (cf-full / wrangler dev :8787) — eSSR reRender +
        // registry descriptor. Same-origin via proxy so the fb_session cookie carries
        // through builderAuthGate. (In prod the console is served from the worker, so
        // these are already same-origin; this is dev-only.)
        '/builder': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [
      react(),
      // Phase E: builder-scoped SW. The build plugin emits dist/builder-sw.js;
      // the dev middleware serves the same bundle during `vite dev`. Both
      // resolve @frontbase/edge-core from the framework workspace.
      builderSwPlugin(),
      builderSwDevMiddleware(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@frontbase/types": path.resolve(__dirname, "./packages/types/src/index.ts"),
        "@frontbase/datatable": path.resolve(__dirname, "./packages/datatable/src/index.ts"),
        "@frontbase/infolist": path.resolve(__dirname, "./packages/infolist/src/index.ts"),
        "@frontbase/form": path.resolve(__dirname, "./packages/form/src/index.ts"),
        "@frontbase/chart": path.resolve(__dirname, "./packages/chart/src/index.ts"),
        "@frontbase/kpicard": path.resolve(__dirname, "./packages/kpicard/src/index.ts"),
        "@frontbase/grid": path.resolve(__dirname, "./packages/grid/src/index.ts"),
        "@frontbase/liquid-core": path.resolve(__dirname, "./packages/liquid-core/src/index.ts"),
      },
    },
    // Expose server-side env vars to client
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.SUPABASE_PROJECT_URL || env.SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY),
      'import.meta.env.VITE_DEPLOYMENT_MODE': JSON.stringify(deploymentMode),
      'import.meta.env.VITE_AUTH_PROVIDER': JSON.stringify(env.AUTH_PROVIDER),
    },
  };
});
