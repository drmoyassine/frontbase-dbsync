// Empty stub for modules that are completely unavailable and unused on Cloudflare
// child_process, net, tls, dns, os, http, https, zlib, worker_threads, module

export function exec() { throw new Error('Not available in Cloudflare Workers'); }
export function execSync() { throw new Error('Not available in Cloudflare Workers'); }
export function spawn() { throw new Error('Not available in Cloudflare Workers'); }
export function createServer() { throw new Error('Not available in Cloudflare Workers'); }
export function connect() { throw new Error('Not available in Cloudflare Workers'); }
export function createConnection() { throw new Error('Not available in Cloudflare Workers'); }
export function resolve4() { throw new Error('Not available in Cloudflare Workers'); }
export function lookup() { throw new Error('Not available in Cloudflare Workers'); }
export function createRequire() { return () => null; }
export function platform() { return 'cloudflare'; }
export function arch() { return 'v8'; }
export function hostname() { return 'cloudflare-worker'; }
export function tmpdir() { return '/tmp'; }
export function homedir() { return '/'; }
export function type() { return 'CloudflareWorker'; }
export function release() { return '0.0.0'; }
export function cpus() { return []; }
export function totalmem() { return 128 * 1024 * 1024; }
export function freemem() { return 128 * 1024 * 1024; }
export const EOL = '\n';
export const constants = {};
export const env = {};

export default {
    exec, execSync, spawn, createServer, connect, createConnection,
    resolve4, lookup, createRequire, platform, arch, hostname, tmpdir,
    homedir, type, release, cpus, totalmem, freemem, EOL, constants, env,
};
