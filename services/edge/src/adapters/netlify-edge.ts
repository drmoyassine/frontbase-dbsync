/** Netlify Edge Functions — Full Adapter (Deno runtime) */
import { fullApp } from '../engine/full.js';
import { runStartupSync } from '../startup/sync.js';
import { createDenoHandler } from './shared.js';

export default createDenoHandler(fullApp, 'netlify-edge', { runSync: runStartupSync });
export const config = { path: "/*" };
