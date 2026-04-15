#!/usr/bin/env node
/**
 * Post-build fix for Vercel Edge Functions.
 *
 * ESBuild avoids module scope collisions by renaming variables (e.g. `config` -> `config2`).
 * However, Vercel's Edge static AST analyzer explicitly demands `export const config = ...`
 * at the root level, ignoring renamed or aliased exports.
 * 
 * If we manually inject `export const config=...` back into the bundled module, we crash 
 * Vercel's build (`The symbol "config" has already been declared`) because there is another 
 * `function config()` or `var config` inside the bundled 3rd-party dependencies.
 *
 * SOLUTION:
 * We extract any top-level imports, wrap the ENTIRE bundled code into an IIFE 
 * (Immediately Invoked Function Expression) to protect the global scope, and then 
 * securely append `export const config` at the actual module root without risk of collision.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
    console.error('Usage: node fix-vercel-exports.mjs <file>');
    process.exit(1);
}

let text = readFileSync(file, 'utf-8');
const original = text;

// Extract top-level imports to hoist them outside the IIFE
const imports = [];
text = text.replace(/^(?:import\s+.*?(?:from\s+)?['"][^'"]+['"]\s*;?|import\s+['"][^'"]+['"]\s*;?)$/gm, (match) => {
    imports.push(match);
    return ''; // remove from body
});

// Delete esbuild's injected aliased config variable
text = text.replace(/^var config\d* = \{\s*runtime:\s*["']([^"']+)["']\s*\}\s*;?$/gm, '');

// Extract the default export identifier (e.g. "handler" from `export { config2 as config, handler as default };`)
let defaultHandlerName = '';
text = text.replace(/^export\s*\{.*?(?:([\w$]+)\s+as\s+default).*?\}\s*;?$/gm, (match, p1) => {
    defaultHandlerName = p1;
    return ''; // remove the export block entirely
});

if (!defaultHandlerName) {
    console.error('[fix-vercel-exports] CRITICAL: Could not locate default export identifier in the bundle!');
    process.exit(1);
}

// Rebuild the file flawlessly
const wrappedCode = `
${imports.join('\n')}

const __bundle_exports = (() => {
${text}
    return { handler: ${defaultHandlerName} };
})();

export const config = { runtime: "edge" };
export default __bundle_exports.handler;
`;

if (wrappedCode !== original) {
    writeFileSync(file, wrappedCode);
    console.log(`[fix-vercel-exports] Patched ${file} via IIFE scope isolation.`);
} else {
    console.log(`[fix-vercel-exports] No changes needed.`);
}
