/**
 * tsup config for Cloudflare Workers build.
 *
 * Bundles ALL npm dependencies into a single file for Cloudflare Workers.
 * Uses platform: 'node' so Node builtins resolve (Cloudflare's nodejs_compat
 * compatibility flag provides these at runtime). Then noExternal bundles all
 * npm packages into the output.
 */
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/adapters/cloudflare.ts'],
    format: ['esm'],
    noExternal: [/.*/],         // Bundle all npm packages
    splitting: false,
    sourcemap: false,
    clean: false,
    outDir: 'dist',
    platform: 'node',           // Resolve Node builtins (nodejs_compat provides them at runtime)
    target: 'es2022',
    treeshake: true,            // Remove dead code paths (e.g. Node-only branches)
    define: {
        'process.env.NODE_ENV': '"production"',
    },
});
