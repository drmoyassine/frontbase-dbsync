/** Vercel Edge Functions — Lite Adapter */
import { liteApp } from '../engine/lite.js';
import { setPlatform } from './shared.js';

setPlatform('vercel-edge-lite');
export const config = { runtime: 'edge' };
export default async function handler(req: Request): Promise<Response> {
    try {
        return await liteApp.fetch(req);
    } catch (err: any) {
        return new Response(JSON.stringify({
            error: err?.message || 'Unknown error',
            stack: err?.stack?.slice(0, 500),
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
