/**
 * tsup config for Cloudflare Workers build.
 *
 * Bundles ALL npm dependencies into a single file for Cloudflare Workers.
 * Uses platform: 'node' so Node builtins resolve during build.
 * Maps bare builtin imports (e.g. 'fs') to 'node:' prefixed versions
 * which Cloudflare's nodejs_compat flag supports at runtime.
 */
import { defineConfig } from 'tsup';

// Cloudflare Workers with nodejs_compat require 'node:' prefixed builtins
const NODE_BUILTINS = [
    'fs', 'path', 'crypto', 'buffer', 'stream', 'events', 'util',
    'assert', 'module', 'net', 'tls', 'dns', 'url', 'string_decoder',
    'child_process', 'os', 'http', 'https', 'zlib', 'querystring',
    'worker_threads', 'async_hooks', 'diagnostics_channel',
];

// Create alias map: 'fs' -> 'node:fs', 'path' -> 'node:path', etc.
const builtinAlias: Record<string, string> = {};
for (const mod of NODE_BUILTINS) {
    builtinAlias[mod] = `node:${mod}`;
}

export default defineConfig({
    entry: ['src/adapters/cloudflare.ts'],
    format: ['esm'],
    noExternal: [/.*/],         // Bundle all npm packages
    splitting: false,
    sourcemap: false,
    clean: false,
    outDir: 'dist',
    platform: 'node',           // Resolve builtins during build
    target: 'es2022',
    treeshake: true,            // Remove dead code paths
    esbuildOptions(options) {
        // Map bare 'fs' imports to 'node:fs' for Cloudflare nodejs_compat
        options.alias = {
            ...options.alias,
            ...builtinAlias,
        };
    },
    define: {
        'process.env.NODE_ENV': '"production"',
    },
});
