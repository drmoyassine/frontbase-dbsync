#!/usr/bin/env node
/**
 * sync-framework-pin — repoint the Docker frontend build at a framework commit.
 *
 * The builder canvas SW bundles @frontbase/edge-core from the framework repo
 * (vite.config.ts builderSwPlugin; Dockerfile.frontend clones the pinned SHA
 * and builds the package). The product pins that SHA in FRAMEWORK_PIN.json —
 * the mirror image of the framework's CONSOLE_PIN, which pins the product SHA
 * the console is vendored from. Bumping the pin changes what self-host builds
 * render the builder canvas with.
 *
 * Usage:
 *   node scripts/sync-framework-pin.mjs                 # pin sibling checkout HEAD
 *   node scripts/sync-framework-pin.mjs --commit <sha>  # pin an explicit SHA
 *   node scripts/sync-framework-pin.mjs --repo <url>    # override the repo URL
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// .json extension matters: Dockerfile.frontend reads this with require(),
// which only auto-parses JSON when the extension says so.
const pinPath = path.join(root, 'FRAMEWORK_PIN.json');

const args = process.argv.slice(2);
const argValue = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
};

const previous = existsSync(pinPath) ? JSON.parse(readFileSync(pinPath, 'utf8')) : {};
const repo = argValue('--repo') ?? previous.repo ?? 'https://github.com/drmoyassine/frontbase-framework.git';

let commit = argValue('--commit');
if (!commit) {
    const sibling = path.resolve(root, '../frontbase-framework');
    commit = execFileSync('git', ['-C', sibling, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}
// Full 40-char SHAs only — same discipline as the framework's console/contract pins.
if (!/^[0-9a-f]{40}$/.test(commit)) {
    console.error(`Refusing to pin: '${commit}' is not a full 40-char SHA.`);
    process.exit(1);
}

writeFileSync(pinPath, JSON.stringify({ repo, commit }, null, 2) + '\n');
console.log(`FRAMEWORK_PIN.json -> ${commit}`);
console.log(`  repo: ${repo}`);
console.log('Next: commit the pin and redeploy — Dockerfile.frontend clones exactly this SHA.');
