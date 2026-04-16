import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@frontbase/datatable": path.resolve(__dirname, "./packages/datatable/src/index.ts"),
        "@frontbase/infolist": path.resolve(__dirname, "./packages/infolist/src/index.ts"),
        "@frontbase/form": path.resolve(__dirname, "./packages/form/src/index.ts"),
      },
    },
    // Expose server-side env vars to client
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.SUPABASE_PROJECT_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY),
      'import.meta.env.VITE_DEPLOYMENT_MODE': JSON.stringify(deploymentMode),
    },
  };
});
