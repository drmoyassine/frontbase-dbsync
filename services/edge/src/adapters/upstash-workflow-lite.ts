/** Upstash Workflows — Lite Adapter (module worker) */
import { liteApp } from '../engine/lite.js';
import { createWorkerHandler } from './shared.js';
export default createWorkerHandler(liteApp, 'upstash-workflow-lite');
