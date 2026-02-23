/**
 * tsup config for Cloudflare Workers LITE build.
 * 
 * Only bundles CF-compatible packages: hono, @libsql/client/web, @upstash/redis.
 * No shims needed — no Node-only dependencies in the import chain.
 */
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/adapters/cloudflare-lite.ts'],
    format: ['esm'],
    noExternal: [/.*/],         // Bundle all npm packages
    splitting: false,
    sourcemap: false,
    clean: false,
    outDir: 'dist',
    platform: 'browser',        // CF Workers = V8 isolate (browser-like)
    target: 'es2022',
    treeshake: true,
    define: {
        'process.env.NODE_ENV': '"production"',
    },
});
