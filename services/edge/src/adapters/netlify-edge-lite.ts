/** Netlify Edge Functions — Lite Adapter (Deno runtime) */
import { liteApp } from '../engine/lite.js';
import { createDenoHandler } from './shared.js';

export default createDenoHandler(liteApp, 'netlify-edge-lite');
export const config = { path: "/*" };
