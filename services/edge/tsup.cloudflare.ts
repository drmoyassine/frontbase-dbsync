/**
 * tsup config for Cloudflare Workers build.
 *
 * Strategy:
 * 1. Bundle ALL npm packages (noExternal)
 * 2. platform: 'node' so esbuild can resolve builtins during build
 * 3. Alias UNSUPPORTED builtins (fs, path, net, etc.) to local shim stubs
 *    so they never appear in the output as real imports
 * 4. Supported builtins (crypto, buffer, stream, etc.) are left as external
 *    imports — Cloudflare's nodejs_compat provides them at runtime
 */
import { defineConfig } from 'tsup';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const fsShim = resolve(__dirname, 'shims/fs.js');
const pathShim = resolve(__dirname, 'shims/path.js');
const emptyShim = resolve(__dirname, 'shims/empty.js');

export default defineConfig({
    entry: ['src/adapters/cloudflare.ts'],
    format: ['esm'],
    noExternal: [/.*/],
    splitting: false,
    sourcemap: false,
    clean: false,
    outDir: 'dist',
    platform: 'node',
    target: 'es2022',
    treeshake: true,
    esbuildOptions(options) {
        options.alias = {
            ...options.alias,
            // UNSUPPORTED builtins -> shim stubs (inlined into bundle)
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
