/** Vercel Edge Functions — Lite Adapter */
import { liteApp } from '../engine/lite.js';
import { handle } from 'hono/vercel';
import { setPlatform } from './shared.js';

setPlatform('vercel-edge-lite');
export const config = { runtime: 'edge' };
export default handle(liteApp);
