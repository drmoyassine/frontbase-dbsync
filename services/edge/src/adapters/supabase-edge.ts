/** Supabase Edge Functions — Full Adapter (Deno runtime) */
import { fullApp } from '../engine/full.js';
import { runStartupSync } from '../startup/sync.js';
import { createDenoHandler } from './shared.js';
Deno.serve(createDenoHandler(fullApp, 'supabase-edge', { runSync: runStartupSync }));
