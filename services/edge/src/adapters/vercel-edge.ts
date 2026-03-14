/** Vercel Edge Functions — Full Adapter */
import { fullApp } from '../engine/full.js';
import { runStartupSync } from '../startup/sync.js';
import { setPlatform } from './shared.js';

setPlatform('vercel-edge');
let syncStarted = false;

export const config = { runtime: 'edge' };
export default async function handler(req: Request) {
    if (!syncStarted) {
        syncStarted = true;
        runStartupSync().catch(err => {
            console.error('[Startup Sync] Error:', err);
            syncStarted = false;
        });
    }
    return fullApp.fetch(req);
}
