/**
 * Shared tsup Config Factories
 * 
 * Two runtime profiles — each encapsulates the full alias/shim map
 * so individual tsup configs become one-line consumers.
 * 
 * - tsupConfigNode: CF Workers, Vercel (shim unsupported Node builtins)
 * - tsupConfigDeno: Supabase, Netlify, Deno Deploy (minimal shims)
 * 
 * To add a new provider:
 *   1. Create adapter in src/adapters/{provider}.ts
 *   2. Create tsup.{provider}.ts that calls the matching factory
 *   3. Add entry to PROVIDER_TSUP_CONFIGS in backend bundle.py
 */
import { defineConfig } from 'tsup';
import type { Options } from 'tsup';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, readdirSync, existsSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const shim = (name: string) => resolve(__dirname, `shims/${name}.js`);

// ── Shared esbuild plugins ───────────────────────────────────────────

const localSqlitePlugin = {
    name: 'replace-local-sqlite',
    setup(build: any) {
        build.onResolve({ filter: /LocalSqliteProvider/ }, () => ({
            path: shim('LocalSqliteProvider'),
        }));
    },
};

/**
 * Embed Vite-built client assets (hydrate.js, CSS, favicon) as string
 * constants in the server bundle. This allows cloud edges (CF, Vercel,
 * Netlify, Deno, Supabase) to serve them without a filesystem.
 */
const embedClientAssetsPlugin = {
    name: 'embed-client-assets',
    setup(build: any) {
        build.onLoad({ filter: /staticAssets\.ts$/ }, (args: any) => {
            const publicReact = resolve(__dirname, 'public/react');
            
            // Read hydrate.js
            let hydrateJs = '';
            const hydratePath = join(publicReact, 'hydrate.js');
            if (existsSync(hydratePath)) {
                hydrateJs = readFileSync(hydratePath, 'utf-8');
                console.log(`[embed] hydrate.js: ${(hydrateJs.length / 1024).toFixed(0)} KB`);
            } else {
                console.warn('[embed] WARNING: public/react/hydrate.js not found — run "vite build" first');
            }
            
            // Read CSS (entry-*.css — filename has a hash)
            let hydrateCss = '';
            if (existsSync(publicReact)) {
                const cssFile = readdirSync(publicReact).find(f => f.startsWith('entry-') && f.endsWith('.css'));
                if (cssFile) {
                    hydrateCss = readFileSync(join(publicReact, cssFile), 'utf-8');
                    console.log(`[embed] ${cssFile}: ${(hydrateCss.length / 1024).toFixed(0)} KB`);
                }
            }
            
            // Read favicon as base64
            let faviconB64 = '';
            const iconPath = join(resolve(__dirname, 'public'), 'icon.png');
            if (existsSync(iconPath)) {
                faviconB64 = readFileSync(iconPath).toString('base64');
                console.log(`[embed] icon.png: ${(faviconB64.length / 1024).toFixed(0)} KB (base64)`);
            }
            
            // Escape backticks and ${} in JS content for template literal safety
            const escapeForTemplateLiteral = (s: string) =>
                s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
            
            const contents = `
export const HYDRATE_JS = \`${escapeForTemplateLiteral(hydrateJs)}\`;
export const HYDRATE_CSS = \`${escapeForTemplateLiteral(hydrateCss)}\`;
export const FAVICON_PNG_B64 = '${faviconB64}';
`;
            return { contents, loader: 'ts' as const };
        });
    },
};

// ── Shared base config ───────────────────────────────────────────────

const BASE: Partial<Options> = {
    format: ['esm'],
    noExternal: [/.*/],
    splitting: false,
    sourcemap: false,
    clean: false,
    outDir: 'dist',
    target: 'es2022',
    treeshake: true,
    esbuildPlugins: [localSqlitePlugin, embedClientAssetsPlugin],
    define: { 'process.env.NODE_ENV': '"production"' },
};

// ── Node builtins alias map (CF Workers, Vercel) ────────────────

const NODE_ALIASES: Record<string, string> = {
    // NPM packages — force edge-compatible variants
    '@libsql/client': '@libsql/client/web',
    '@upstash/redis': '@upstash/redis/cloudflare',
    'ws': shim('ws'),
    // UNSUPPORTED builtins → shim stubs
    'fs': shim('fs'), 'node:fs': shim('fs'), 'node:fs/promises': shim('fs'),
    'path': shim('path'), 'node:path': shim('path'),
    'child_process': shim('empty'), 'node:child_process': shim('empty'),
    'net': shim('empty'), 'node:net': shim('empty'),
    'tls': shim('empty'), 'node:tls': shim('empty'),
    'dns': shim('empty'), 'node:dns': shim('empty'),
    'os': shim('empty'), 'node:os': shim('empty'),
    'http': shim('empty'), 'node:http': shim('empty'),
    'https': shim('empty'), 'node:https': shim('empty'),
    'zlib': shim('empty'), 'node:zlib': shim('empty'),
    'worker_threads': shim('empty'), 'node:worker_threads': shim('empty'),
    'module': shim('empty'), 'node:module': shim('empty'),
    // SUPPORTED builtins — alias bare to node: prefix (nodejs_compat)
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

// ── Deno alias map (Supabase, Netlify, Deno Deploy) ──────────────────

const DENO_ALIASES: Record<string, string> = {
    '@libsql/client': '@libsql/client/web',
    'fs': shim('fs'), 'node:fs': shim('fs'), 'node:fs/promises': shim('fs'),
    'path': shim('path'), 'node:path': shim('path'),
};

// ── Exported factories ───────────────────────────────────────────────

/** Node/V8 isolate config — for Cloudflare Workers, Vercel */
export function tsupConfigNode(entry: string) {
    return defineConfig({
        ...BASE,
        entry: [entry],
        platform: 'node',
        esbuildOptions(opts) {
            opts.alias = { ...opts.alias, ...NODE_ALIASES };
        },
    } as Options);
}

// ── esbuild plugin: externalize Node-only packages in edge builds ────
// noExternal: [/.*/] forces esbuild to inline everything, including dynamic
// imports. This plugin intercepts ioredis resolution and marks it external
// so edge bundles (Supabase, Netlify, Deno) never pull in Node built-ins.
const externalizeNodeOnly = {
    name: 'externalize-node-only',
    setup(build: any) {
        build.onResolve({ filter: /^ioredis$/ }, () => ({
            path: 'ioredis',
            external: true,
        }));
    },
};

/** Deno config — for Supabase Edge Functions, Netlify Edge, Deno Deploy */
export function tsupConfigDeno(entry: string) {
    return defineConfig({
        ...BASE,
        entry: [entry],
        platform: 'browser',
        esbuildPlugins: [localSqlitePlugin, externalizeNodeOnly, embedClientAssetsPlugin],
        esbuildOptions(opts) {
            opts.alias = { ...opts.alias, ...DENO_ALIASES };
        },
    } as Options);
}

// ── esbuild plugin: stub ioredis for Vercel Edge ────────────────────
// Vercel Edge Runtime can't resolve external imports (they hang instead
// of failing). Instead of externalizing ioredis, redirect it to an
// empty shim so the IoRedisAdapter constructor fails immediately and
// falls back to NullCache.
const stubIoredis = {
    name: 'stub-ioredis',
    setup(build: any) {
        build.onResolve({ filter: /^ioredis$/ }, () => ({
            path: shim('empty'),
        }));
    },
};

/** Vercel config — like Deno but stubs ioredis + post-build export fix */
export function tsupConfigVercel(entry: string) {
    return defineConfig({
        ...BASE,
        entry: [entry],
        platform: 'browser',
        esbuildPlugins: [localSqlitePlugin, stubIoredis, embedClientAssetsPlugin],
        esbuildOptions(opts) {
            opts.alias = { ...opts.alias, ...DENO_ALIASES };
        },
    } as Options);
}

