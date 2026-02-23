// vite.config.ts
import { defineConfig, loadEnv } from "file:///C:/Users/drmoy/OneDrive%20-%20studygram.me/VsCode/Frontbase-/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/drmoy/OneDrive%20-%20studygram.me/VsCode/Frontbase-/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///C:/Users/drmoy/OneDrive%20-%20studygram.me/VsCode/Frontbase-/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\drmoy\\OneDrive - studygram.me\\VsCode\\Frontbase-";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: "/frontbase-admin/",
    server: {
      host: "::",
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          // Redirect all API calls to FastAPI
          changeOrigin: true,
          secure: false,
          timeout: 1e4,
          // 10 second timeout
          onProxyReq: (proxyReq, req, res) => {
            proxyReq.setHeader("Access-Control-Allow-Origin", "*");
            proxyReq.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            proxyReq.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
          },
          onError: (err, req, res) => {
            if (req.url?.includes("/api/")) {
              console.warn(`[Vite-Proxy] Backend unavailable at ${err.host}:${err.port}`);
              if (!res.headersSent) {
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                  success: false,
                  message: "Backend service unavailable",
                  error: "Backend service is not running"
                }));
              }
            }
          },
          onProxyRes: (proxyRes, req, res) => {
            delete proxyRes.headers["x-frame-options"];
            delete proxyRes.headers["x-content-type-options"];
          }
        },
        // Static assets (favicon, logos) stored on backend
        "/static": {
          target: "http://localhost:8000",
          changeOrigin: true,
          secure: false
        },
        // Actions Engine proxy
        "/actions": {
          target: "http://localhost:3002",
          changeOrigin: true,
          secure: false,
          rewrite: (path2) => path2.replace(/^\/actions/, "")
        }
      }
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "./src"),
        "@frontbase/datatable": path.resolve(__vite_injected_original_dirname, "./packages/datatable/src/index.ts")
      }
    },
    // Expose server-side env vars to client
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.SUPABASE_PROJECT_URL),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(env.SUPABASE_ANON_KEY)
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxkcm1veVxcXFxPbmVEcml2ZSAtIHN0dWR5Z3JhbS5tZVxcXFxWc0NvZGVcXFxcRnJvbnRiYXNlLVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcZHJtb3lcXFxcT25lRHJpdmUgLSBzdHVkeWdyYW0ubWVcXFxcVnNDb2RlXFxcXEZyb250YmFzZS1cXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL2RybW95L09uZURyaXZlJTIwLSUyMHN0dWR5Z3JhbS5tZS9Wc0NvZGUvRnJvbnRiYXNlLS92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZywgbG9hZEVudiB9IGZyb20gXCJ2aXRlXCI7XHJcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djXCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCB7IGNvbXBvbmVudFRhZ2dlciB9IGZyb20gXCJsb3ZhYmxlLXRhZ2dlclwiO1xyXG5cclxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xyXG4gIC8vIExvYWQgZW52IGZpbGUgYmFzZWQgb24gYG1vZGVgIGluIHRoZSBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5LlxyXG4gIC8vIFNldCB0aGUgdGhpcmQgcGFyYW1ldGVyIHRvICcnIHRvIGxvYWQgYWxsIGVudiByZWdhcmRsZXNzIG9mIHRoZSBgVklURV9gIHByZWZpeC5cclxuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHByb2Nlc3MuY3dkKCksICcnKTtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGJhc2U6ICcvZnJvbnRiYXNlLWFkbWluLycsXHJcbiAgICBzZXJ2ZXI6IHtcclxuICAgICAgaG9zdDogXCI6OlwiLFxyXG4gICAgICBwb3J0OiA1MTczLFxyXG4gICAgICBwcm94eToge1xyXG4gICAgICAgICcvYXBpJzoge1xyXG4gICAgICAgICAgdGFyZ2V0OiAnaHR0cDovL2xvY2FsaG9zdDo4MDAwJywgLy8gUmVkaXJlY3QgYWxsIEFQSSBjYWxscyB0byBGYXN0QVBJXHJcbiAgICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXHJcbiAgICAgICAgICBzZWN1cmU6IGZhbHNlLFxyXG4gICAgICAgICAgdGltZW91dDogMTAwMDAsIC8vIDEwIHNlY29uZCB0aW1lb3V0XHJcbiAgICAgICAgICBvblByb3h5UmVxOiAocHJveHlSZXE6IGFueSwgcmVxOiBhbnksIHJlczogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIC8vIEFkZCBDT1JTIGhlYWRlcnMgZm9yIGRldmVsb3BtZW50XHJcbiAgICAgICAgICAgIHByb3h5UmVxLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJywgJyonKTtcclxuICAgICAgICAgICAgcHJveHlSZXEuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJywgJ0dFVCwgUE9TVCwgUFVULCBERUxFVEUsIE9QVElPTlMnKTtcclxuICAgICAgICAgICAgcHJveHlSZXEuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJywgJ0NvbnRlbnQtVHlwZSwgQXV0aG9yaXphdGlvbicpO1xyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIG9uRXJyb3I6IChlcnI6IGFueSwgcmVxOiBhbnksIHJlczogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIC8vIEhhbmRsZSBwcm94eSBlcnJvcnMgZ3JhY2VmdWxseVxyXG4gICAgICAgICAgICBpZiAocmVxLnVybD8uaW5jbHVkZXMoJy9hcGkvJykpIHtcclxuICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFtWaXRlLVByb3h5XSBCYWNrZW5kIHVuYXZhaWxhYmxlIGF0ICR7ZXJyLmhvc3R9OiR7ZXJyLnBvcnR9YCk7XHJcbiAgICAgICAgICAgICAgaWYgKCFyZXMuaGVhZGVyc1NlbnQpIHtcclxuICAgICAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoNTAzLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XHJcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdCYWNrZW5kIHNlcnZpY2UgdW5hdmFpbGFibGUnLFxyXG4gICAgICAgICAgICAgICAgICBlcnJvcjogJ0JhY2tlbmQgc2VydmljZSBpcyBub3QgcnVubmluZydcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBvblByb3h5UmVzOiAocHJveHlSZXM6IGFueSwgcmVxOiBhbnksIHJlczogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIC8vIENsZWFuIHVwIHJlc3BvbnNlIGhlYWRlcnMgdG8gYXZvaWQgQ09SUyBpc3N1ZXNcclxuICAgICAgICAgICAgZGVsZXRlIHByb3h5UmVzLmhlYWRlcnNbJ3gtZnJhbWUtb3B0aW9ucyddO1xyXG4gICAgICAgICAgICBkZWxldGUgcHJveHlSZXMuaGVhZGVyc1sneC1jb250ZW50LXR5cGUtb3B0aW9ucyddO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy8gU3RhdGljIGFzc2V0cyAoZmF2aWNvbiwgbG9nb3MpIHN0b3JlZCBvbiBiYWNrZW5kXHJcbiAgICAgICAgJy9zdGF0aWMnOiB7XHJcbiAgICAgICAgICB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjgwMDAnLFxyXG4gICAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxyXG4gICAgICAgICAgc2VjdXJlOiBmYWxzZSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vIEFjdGlvbnMgRW5naW5lIHByb3h5XHJcbiAgICAgICAgJy9hY3Rpb25zJzoge1xyXG4gICAgICAgICAgdGFyZ2V0OiAnaHR0cDovL2xvY2FsaG9zdDozMDAyJyxcclxuICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICAgICAgICAgIHNlY3VyZTogZmFsc2UsXHJcbiAgICAgICAgICByZXdyaXRlOiAocGF0aDogc3RyaW5nKSA9PiBwYXRoLnJlcGxhY2UoL15cXC9hY3Rpb25zLywgJycpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gICAgcGx1Z2luczogW3JlYWN0KCksIG1vZGUgPT09IFwiZGV2ZWxvcG1lbnRcIiAmJiBjb21wb25lbnRUYWdnZXIoKV0uZmlsdGVyKEJvb2xlYW4pLFxyXG4gICAgcmVzb2x2ZToge1xyXG4gICAgICBhbGlhczoge1xyXG4gICAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxyXG4gICAgICAgIFwiQGZyb250YmFzZS9kYXRhdGFibGVcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3BhY2thZ2VzL2RhdGF0YWJsZS9zcmMvaW5kZXgudHNcIiksXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gICAgLy8gRXhwb3NlIHNlcnZlci1zaWRlIGVudiB2YXJzIHRvIGNsaWVudFxyXG4gICAgZGVmaW5lOiB7XHJcbiAgICAgICdpbXBvcnQubWV0YS5lbnYuVklURV9TVVBBQkFTRV9VUkwnOiBKU09OLnN0cmluZ2lmeShlbnYuU1VQQUJBU0VfUFJPSkVDVF9VUkwpLFxyXG4gICAgICAnaW1wb3J0Lm1ldGEuZW52LlZJVEVfU1VQQUJBU0VfQU5PTl9LRVknOiBKU09OLnN0cmluZ2lmeShlbnYuU1VQQUJBU0VfQU5PTl9LRVkpLFxyXG4gICAgfSxcclxuICB9O1xyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUEwVyxTQUFTLGNBQWMsZUFBZTtBQUNoWixPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBQ2pCLFNBQVMsdUJBQXVCO0FBSGhDLElBQU0sbUNBQW1DO0FBTXpDLElBQU8sc0JBQVEsYUFBYSxDQUFDLEVBQUUsS0FBSyxNQUFNO0FBR3hDLFFBQU0sTUFBTSxRQUFRLE1BQU0sUUFBUSxJQUFJLEdBQUcsRUFBRTtBQUUzQyxTQUFPO0FBQUEsSUFDTCxNQUFNO0FBQUEsSUFDTixRQUFRO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixPQUFPO0FBQUEsUUFDTCxRQUFRO0FBQUEsVUFDTixRQUFRO0FBQUE7QUFBQSxVQUNSLGNBQWM7QUFBQSxVQUNkLFFBQVE7QUFBQSxVQUNSLFNBQVM7QUFBQTtBQUFBLFVBQ1QsWUFBWSxDQUFDLFVBQWUsS0FBVSxRQUFhO0FBRWpELHFCQUFTLFVBQVUsK0JBQStCLEdBQUc7QUFDckQscUJBQVMsVUFBVSxnQ0FBZ0MsaUNBQWlDO0FBQ3BGLHFCQUFTLFVBQVUsZ0NBQWdDLDZCQUE2QjtBQUFBLFVBQ2xGO0FBQUEsVUFDQSxTQUFTLENBQUMsS0FBVSxLQUFVLFFBQWE7QUFFekMsZ0JBQUksSUFBSSxLQUFLLFNBQVMsT0FBTyxHQUFHO0FBQzlCLHNCQUFRLEtBQUssdUNBQXVDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQzFFLGtCQUFJLENBQUMsSUFBSSxhQUFhO0FBQ3BCLG9CQUFJLFVBQVUsS0FBSyxFQUFFLGdCQUFnQixtQkFBbUIsQ0FBQztBQUN6RCxvQkFBSSxJQUFJLEtBQUssVUFBVTtBQUFBLGtCQUNyQixTQUFTO0FBQUEsa0JBQ1QsU0FBUztBQUFBLGtCQUNULE9BQU87QUFBQSxnQkFDVCxDQUFDLENBQUM7QUFBQSxjQUNKO0FBQUEsWUFDRjtBQUFBLFVBQ0Y7QUFBQSxVQUNBLFlBQVksQ0FBQyxVQUFlLEtBQVUsUUFBYTtBQUVqRCxtQkFBTyxTQUFTLFFBQVEsaUJBQWlCO0FBQ3pDLG1CQUFPLFNBQVMsUUFBUSx3QkFBd0I7QUFBQSxVQUNsRDtBQUFBLFFBQ0Y7QUFBQTtBQUFBLFFBRUEsV0FBVztBQUFBLFVBQ1QsUUFBUTtBQUFBLFVBQ1IsY0FBYztBQUFBLFVBQ2QsUUFBUTtBQUFBLFFBQ1Y7QUFBQTtBQUFBLFFBRUEsWUFBWTtBQUFBLFVBQ1YsUUFBUTtBQUFBLFVBQ1IsY0FBYztBQUFBLFVBQ2QsUUFBUTtBQUFBLFVBQ1IsU0FBUyxDQUFDQSxVQUFpQkEsTUFBSyxRQUFRLGNBQWMsRUFBRTtBQUFBLFFBQzFEO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxJQUNBLFNBQVMsQ0FBQyxNQUFNLEdBQUcsU0FBUyxpQkFBaUIsZ0JBQWdCLENBQUMsRUFBRSxPQUFPLE9BQU87QUFBQSxJQUM5RSxTQUFTO0FBQUEsTUFDUCxPQUFPO0FBQUEsUUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsUUFDcEMsd0JBQXdCLEtBQUssUUFBUSxrQ0FBVyxtQ0FBbUM7QUFBQSxNQUNyRjtBQUFBLElBQ0Y7QUFBQTtBQUFBLElBRUEsUUFBUTtBQUFBLE1BQ04scUNBQXFDLEtBQUssVUFBVSxJQUFJLG9CQUFvQjtBQUFBLE1BQzVFLDBDQUEwQyxLQUFLLFVBQVUsSUFBSSxpQkFBaUI7QUFBQSxJQUNoRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJwYXRoIl0KfQo=
