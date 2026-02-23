// Path stub for Cloudflare Workers
export const sep = '/';
export const delimiter = ':';
export const posix = { sep: '/', delimiter: ':' };
export const win32 = { sep: '\\', delimiter: ';' };

export function resolve(...args) { return args.filter(Boolean).join('/'); }
export function join(...args) { return args.filter(Boolean).join('/'); }
export function dirname(p) { return p.replace(/\/[^/]*$/, '') || '/'; }
export function basename(p, ext) {
    const base = p.replace(/.*\//, '');
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
}
export function extname(p) { const m = p.match(/\.[^./]+$/); return m ? m[0] : ''; }
export function normalize(p) { return p; }
export function relative(from, to) { return to; }
export function isAbsolute(p) { return p.startsWith('/'); }
export function parse(p) {
    return { root: '/', dir: dirname(p), base: basename(p), ext: extname(p), name: basename(p, extname(p)) };
}
export function format(obj) { return (obj.dir || obj.root || '') + '/' + (obj.base || obj.name + (obj.ext || '')); }

export default {
    sep, delimiter, posix, win32, resolve, join, dirname, basename,
    extname, normalize, relative, isAbsolute, parse, format,
};
