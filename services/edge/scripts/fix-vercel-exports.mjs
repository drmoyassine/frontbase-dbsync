#!/usr/bin/env node
/**
 * Post-build fix for Vercel Edge Functions.
 *
 * Vercel's build system uses static analysis to detect the runtime from:
 *   export const config = { runtime: 'edge' };
 *
 * But tsup generates a re-export pattern that Vercel does NOT recognize:
 *   var config = { runtime: "edge" };
 *   export { config, handler as default };
 *
 * This script rewrites the bundle to use inline exports.
 *
 * Usage: node scripts/fix-vercel-exports.mjs <file>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
    console.error('Usage: node fix-vercel-exports.mjs <file>');
    process.exit(1);
}

let text = readFileSync(file, 'utf-8');
const original = text;

// var config = { runtime: "edge" };
// → export const config = { runtime: "edge" };
text = text.replace(
    /^var config = \{ runtime: "(.*)" \};$/m,
    'export const config = { runtime: "$1" };'
);

// export { config, handler as default };
// → export default handler;
text = text.replace(
    /^export \{ config, (\w+) as default \};$/m,
    'export default $1;'
);

if (text !== original) {
    writeFileSync(file, text);
    console.log(`[fix-vercel-exports] Patched ${file}`);
} else {
    console.log(`[fix-vercel-exports] No changes needed for ${file}`);
}
