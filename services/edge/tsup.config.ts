import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    external: [
        // Docker-only dependencies - not available in cloud builds
        '@lancedb/lancedb',
        'pg',
        // Node.js built-ins (available at runtime)
        'node:*',
        'node:child_process',
        'node:fs/promises',
        'node:crypto',
        'node:path',
        'node:util',
        // Other runtime-only dependencies
        '@libsql/client',
        '@supabase/postgrest-js',
    ],
});
