// vite.config.ts
import { defineConfig, loadEnv } from "file:///C:/Users/drmoy/OneDrive%20-%20studygram.me/VsCode/Frontbase-/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/drmoy/OneDrive%20-%20studygram.me/VsCode/Frontbase-/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///C:/Users/drmoy/OneDrive%20-%20studygram.me/VsCode/Frontbase-/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\drmoy\\OneDrive - studygram.me\\VsCode\\Frontbase-";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: "/",
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxkcm1veVxcXFxPbmVEcml2ZSAtIHN0dWR5Z3JhbS5tZVxcXFxWc0NvZGVcXFxcRnJvbnRiYXNlLVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcZHJtb3lcXFxcT25lRHJpdmUgLSBzdHVkeWdyYW0ubWVcXFxcVnNDb2RlXFxcXEZyb250YmFzZS1cXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL2RybW95L09uZURyaXZlJTIwLSUyMHN0dWR5Z3JhbS5tZS9Wc0NvZGUvRnJvbnRiYXNlLS92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZywgbG9hZEVudiB9IGZyb20gXCJ2aXRlXCI7XHJcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djXCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCB7IGNvbXBvbmVudFRhZ2dlciB9IGZyb20gXCJsb3ZhYmxlLXRhZ2dlclwiO1xyXG5cclxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xyXG4gIC8vIExvYWQgZW52IGZpbGUgYmFzZWQgb24gYG1vZGVgIGluIHRoZSBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5LlxyXG4gIC8vIFNldCB0aGUgdGhpcmQgcGFyYW1ldGVyIHRvICcnIHRvIGxvYWQgYWxsIGVudiByZWdhcmRsZXNzIG9mIHRoZSBgVklURV9gIHByZWZpeC5cclxuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHByb2Nlc3MuY3dkKCksICcnKTtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGJhc2U6ICcvJyxcclxuICAgIHNlcnZlcjoge1xyXG4gICAgICBob3N0OiBcIjo6XCIsXHJcbiAgICAgIHBvcnQ6IDUxNzMsXHJcbiAgICAgIHByb3h5OiB7XHJcbiAgICAgICAgJy9hcGknOiB7XHJcbiAgICAgICAgICB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjgwMDAnLCAvLyBSZWRpcmVjdCBhbGwgQVBJIGNhbGxzIHRvIEZhc3RBUElcclxuICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICAgICAgICAgIHNlY3VyZTogZmFsc2UsXHJcbiAgICAgICAgICB0aW1lb3V0OiAxMDAwMCwgLy8gMTAgc2Vjb25kIHRpbWVvdXRcclxuICAgICAgICAgIG9uUHJveHlSZXE6IChwcm94eVJlcTogYW55LCByZXE6IGFueSwgcmVzOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgLy8gQWRkIENPUlMgaGVhZGVycyBmb3IgZGV2ZWxvcG1lbnRcclxuICAgICAgICAgICAgcHJveHlSZXEuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCAnKicpO1xyXG4gICAgICAgICAgICBwcm94eVJlcS5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnLCAnR0VULCBQT1NULCBQVVQsIERFTEVURSwgT1BUSU9OUycpO1xyXG4gICAgICAgICAgICBwcm94eVJlcS5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLCAnQ29udGVudC1UeXBlLCBBdXRob3JpemF0aW9uJyk7XHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgb25FcnJvcjogKGVycjogYW55LCByZXE6IGFueSwgcmVzOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgLy8gSGFuZGxlIHByb3h5IGVycm9ycyBncmFjZWZ1bGx5XHJcbiAgICAgICAgICAgIGlmIChyZXEudXJsPy5pbmNsdWRlcygnL2FwaS8nKSkge1xyXG4gICAgICAgICAgICAgIGNvbnNvbGUud2FybihgW1ZpdGUtUHJveHldIEJhY2tlbmQgdW5hdmFpbGFibGUgYXQgJHtlcnIuaG9zdH06JHtlcnIucG9ydH1gKTtcclxuICAgICAgICAgICAgICBpZiAoIXJlcy5oZWFkZXJzU2VudCkge1xyXG4gICAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDMsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcclxuICAgICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJ0JhY2tlbmQgc2VydmljZSB1bmF2YWlsYWJsZScsXHJcbiAgICAgICAgICAgICAgICAgIGVycm9yOiAnQmFja2VuZCBzZXJ2aWNlIGlzIG5vdCBydW5uaW5nJ1xyXG4gICAgICAgICAgICAgICAgfSkpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIG9uUHJveHlSZXM6IChwcm94eVJlczogYW55LCByZXE6IGFueSwgcmVzOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgLy8gQ2xlYW4gdXAgcmVzcG9uc2UgaGVhZGVycyB0byBhdm9pZCBDT1JTIGlzc3Vlc1xyXG4gICAgICAgICAgICBkZWxldGUgcHJveHlSZXMuaGVhZGVyc1sneC1mcmFtZS1vcHRpb25zJ107XHJcbiAgICAgICAgICAgIGRlbGV0ZSBwcm94eVJlcy5oZWFkZXJzWyd4LWNvbnRlbnQtdHlwZS1vcHRpb25zJ107XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICAvLyBBY3Rpb25zIEVuZ2luZSBwcm94eVxyXG4gICAgICAgICcvYWN0aW9ucyc6IHtcclxuICAgICAgICAgIHRhcmdldDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMicsXHJcbiAgICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXHJcbiAgICAgICAgICBzZWN1cmU6IGZhbHNlLFxyXG4gICAgICAgICAgcmV3cml0ZTogKHBhdGg6IHN0cmluZykgPT4gcGF0aC5yZXBsYWNlKC9eXFwvYWN0aW9ucy8sICcnKSxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICAgIHBsdWdpbnM6IFtyZWFjdCgpLCBtb2RlID09PSBcImRldmVsb3BtZW50XCIgJiYgY29tcG9uZW50VGFnZ2VyKCldLmZpbHRlcihCb29sZWFuKSxcclxuICAgIHJlc29sdmU6IHtcclxuICAgICAgYWxpYXM6IHtcclxuICAgICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcclxuICAgICAgICBcIkBmcm9udGJhc2UvZGF0YXRhYmxlXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9wYWNrYWdlcy9kYXRhdGFibGUvc3JjL2luZGV4LnRzXCIpLFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICAgIC8vIEV4cG9zZSBzZXJ2ZXItc2lkZSBlbnYgdmFycyB0byBjbGllbnRcclxuICAgIGRlZmluZToge1xyXG4gICAgICAnaW1wb3J0Lm1ldGEuZW52LlZJVEVfU1VQQUJBU0VfVVJMJzogSlNPTi5zdHJpbmdpZnkoZW52LlNVUEFCQVNFX1BST0pFQ1RfVVJMKSxcclxuICAgICAgJ2ltcG9ydC5tZXRhLmVudi5WSVRFX1NVUEFCQVNFX0FOT05fS0VZJzogSlNPTi5zdHJpbmdpZnkoZW52LlNVUEFCQVNFX0FOT05fS0VZKSxcclxuICAgIH0sXHJcbiAgfTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMFcsU0FBUyxjQUFjLGVBQWU7QUFDaFosT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixTQUFTLHVCQUF1QjtBQUhoQyxJQUFNLG1DQUFtQztBQU16QyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUd4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFFM0MsU0FBTztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04sUUFBUTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLFFBQ0wsUUFBUTtBQUFBLFVBQ04sUUFBUTtBQUFBO0FBQUEsVUFDUixjQUFjO0FBQUEsVUFDZCxRQUFRO0FBQUEsVUFDUixTQUFTO0FBQUE7QUFBQSxVQUNULFlBQVksQ0FBQyxVQUFlLEtBQVUsUUFBYTtBQUVqRCxxQkFBUyxVQUFVLCtCQUErQixHQUFHO0FBQ3JELHFCQUFTLFVBQVUsZ0NBQWdDLGlDQUFpQztBQUNwRixxQkFBUyxVQUFVLGdDQUFnQyw2QkFBNkI7QUFBQSxVQUNsRjtBQUFBLFVBQ0EsU0FBUyxDQUFDLEtBQVUsS0FBVSxRQUFhO0FBRXpDLGdCQUFJLElBQUksS0FBSyxTQUFTLE9BQU8sR0FBRztBQUM5QixzQkFBUSxLQUFLLHVDQUF1QyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUMxRSxrQkFBSSxDQUFDLElBQUksYUFBYTtBQUNwQixvQkFBSSxVQUFVLEtBQUssRUFBRSxnQkFBZ0IsbUJBQW1CLENBQUM7QUFDekQsb0JBQUksSUFBSSxLQUFLLFVBQVU7QUFBQSxrQkFDckIsU0FBUztBQUFBLGtCQUNULFNBQVM7QUFBQSxrQkFDVCxPQUFPO0FBQUEsZ0JBQ1QsQ0FBQyxDQUFDO0FBQUEsY0FDSjtBQUFBLFlBQ0Y7QUFBQSxVQUNGO0FBQUEsVUFDQSxZQUFZLENBQUMsVUFBZSxLQUFVLFFBQWE7QUFFakQsbUJBQU8sU0FBUyxRQUFRLGlCQUFpQjtBQUN6QyxtQkFBTyxTQUFTLFFBQVEsd0JBQXdCO0FBQUEsVUFDbEQ7QUFBQSxRQUNGO0FBQUE7QUFBQSxRQUVBLFlBQVk7QUFBQSxVQUNWLFFBQVE7QUFBQSxVQUNSLGNBQWM7QUFBQSxVQUNkLFFBQVE7QUFBQSxVQUNSLFNBQVMsQ0FBQ0EsVUFBaUJBLE1BQUssUUFBUSxjQUFjLEVBQUU7QUFBQSxRQUMxRDtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsSUFDQSxTQUFTLENBQUMsTUFBTSxHQUFHLFNBQVMsaUJBQWlCLGdCQUFnQixDQUFDLEVBQUUsT0FBTyxPQUFPO0FBQUEsSUFDOUUsU0FBUztBQUFBLE1BQ1AsT0FBTztBQUFBLFFBQ0wsS0FBSyxLQUFLLFFBQVEsa0NBQVcsT0FBTztBQUFBLFFBQ3BDLHdCQUF3QixLQUFLLFFBQVEsa0NBQVcsbUNBQW1DO0FBQUEsTUFDckY7QUFBQSxJQUNGO0FBQUE7QUFBQSxJQUVBLFFBQVE7QUFBQSxNQUNOLHFDQUFxQyxLQUFLLFVBQVUsSUFBSSxvQkFBb0I7QUFBQSxNQUM1RSwwQ0FBMEMsS0FBSyxVQUFVLElBQUksaUJBQWlCO0FBQUEsSUFDaEY7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsicGF0aCJdCn0K
