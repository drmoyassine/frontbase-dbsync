/** Upstash Workflows — Full Adapter (module worker) */
import { fullApp } from '../engine/full.js';
import { runStartupSync } from '../startup/sync.js';
import { createWorkerHandler } from './shared.js';
export default createWorkerHandler(fullApp, 'upstash-workflow', { runSync: runStartupSync });
