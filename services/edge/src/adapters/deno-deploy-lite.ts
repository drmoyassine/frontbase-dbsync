/** Deno Deploy — Lite Adapter (Deno runtime) */
import { liteApp } from '../engine/lite.js';
import { createDenoHandler } from './shared.js';
Deno.serve(createDenoHandler(liteApp, 'deno-deploy-lite'));
