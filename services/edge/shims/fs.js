/**
 * Empty stubs for Node.js built-in modules that are NOT available
 * in Cloudflare Workers, even with nodejs_compat enabled.
 * 
 * These are imported by bundled packages (detect-libc, @neon-rs/load,
 * liquidjs file-loader, ioredis) but are dead code on the Cloudflare path.
 * 
 * Supported by nodejs_compat (DON'T stub these):
 *   crypto, buffer, stream, events, util, assert, string_decoder,
 *   url, querystring, async_hooks, diagnostics_channel
 * 
 * NOT supported (STUB these):
 *   fs, path, child_process, net, tls, dns, os, http, https,
 *   zlib, worker_threads, module
 */

// fs stubs
export function readFileSync() { throw new Error('fs.readFileSync not available in Cloudflare Workers'); }
export function readFile() { throw new Error('fs.readFile not available in Cloudflare Workers'); }
export function writeFileSync() { throw new Error('fs.writeFileSync not available'); }
export function writeFile() { throw new Error('fs.writeFile not available'); }
export function existsSync() { return false; }
export function statSync() { throw new Error('fs.statSync not available'); }
export function stat() { throw new Error('fs.stat not available'); }
export function mkdirSync() { }
export function readdirSync() { return []; }
export function unlinkSync() { }
export function accessSync() { throw new Error('fs.accessSync not available'); }
export function createReadStream() { throw new Error('fs.createReadStream not available'); }
export function createWriteStream() { throw new Error('fs.createWriteStream not available'); }
export const promises = {
    readFile: async () => { throw new Error('fs.promises.readFile not available'); },
    writeFile: async () => { throw new Error('fs.promises.writeFile not available'); },
    stat: async () => { throw new Error('fs.promises.stat not available'); },
    readdir: async () => [],
    access: async () => { throw new Error('fs.promises.access not available'); },
};
export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 };

export default {
    readFileSync, readFile, writeFileSync, writeFile,
    existsSync, statSync, stat, mkdirSync, readdirSync,
    unlinkSync, accessSync, createReadStream, createWriteStream,
    promises, constants,
};
