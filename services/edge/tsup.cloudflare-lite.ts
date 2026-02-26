/**
 * tsup config for Cloudflare Workers LITE build.
 * 
 * Bundles the Lite engine adapter for Cloudflare Workers.
 * Uses the same shimming strategy as tsup.cloudflare.ts:
 *   - Unsupported Node builtins → shim stubs
 *   - Supported builtins → node: prefix (nodejs_compat provides them)
 */
import { defineConfig } from 'tsup';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const fsShim = resolve(__dirname, 'shims/fs.js');
const pathShim = resolve(__dirname, 'shims/path.js');
const emptyShim = resolve(__dirname, 'shims/empty.js');
const wsShim = resolve(__dirname, 'shims/ws.js');
const localSqliteShim = resolve(__dirname, 'shims/LocalSqliteProvider.js');

export default defineConfig({
    entry: ['src/adapters/cloudflare-lite.ts'],
    format: ['esm'],
    noExternal: [/.*/],         // Bundle all npm packages
    splitting: false,
    sourcemap: false,
    clean: false,
    outDir: 'dist',
    platform: 'node',           // Changed from 'browser' to resolve builtins during build
    target: 'es2022',
    treeshake: true,
    esbuildPlugins: [
        {
            name: 'replace-local-sqlite',
            setup(build) {
                // Intercept imports of LocalSqliteProvider and replace with stub
                build.onResolve({ filter: /LocalSqliteProvider/ }, () => ({
                    path: localSqliteShim,
                }));
            },
        },
    ],
    esbuildOptions(options) {
        options.alias = {
            ...options.alias,
            // NPM packages — force CF-compatible variants
            '@libsql/client': '@libsql/client/web',
            'ws': wsShim,  // CF Workers have native WebSocket
            // UNSUPPORTED builtins → shim stubs (inlined into bundle)
            'fs': fsShim,
            'node:fs': fsShim,
            'node:fs/promises': fsShim,
            'path': pathShim,
            'node:path': pathShim,
            'child_process': emptyShim,
            'node:child_process': emptyShim,
            'net': emptyShim,
            'node:net': emptyShim,
            'tls': emptyShim,
            'node:tls': emptyShim,
            'dns': emptyShim,
            'node:dns': emptyShim,
            'os': emptyShim,
            'node:os': emptyShim,
            'http': emptyShim,
            'node:http': emptyShim,
            'https': emptyShim,
            'node:https': emptyShim,
            'zlib': emptyShim,
            'node:zlib': emptyShim,
            'worker_threads': emptyShim,
            'node:worker_threads': emptyShim,
            'module': emptyShim,
            'node:module': emptyShim,
            // SUPPORTED builtins — alias bare to node: prefix
            // (nodejs_compat provides these at CF runtime)
            'crypto': 'node:crypto',
            'buffer': 'node:buffer',
            'stream': 'node:stream',
            'events': 'node:events',
            'util': 'node:util',
            'assert': 'node:assert',
            'string_decoder': 'node:string_decoder',
            'url': 'node:url',
            'querystring': 'node:querystring',
            'async_hooks': 'node:async_hooks',
            'diagnostics_channel': 'node:diagnostics_channel',
        };
    },
    define: {
        'process.env.NODE_ENV': '"production"',
    },
});
