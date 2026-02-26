/**
 * Engine Module
 * 
 * Public API for the edge engine layer.
 */

// Pre-configured engine apps
export { liteApp, createLiteApp } from './lite.js';
export { fullApp } from './full.js';

// Workflow runtime (engine-agnostic)
export { executeWorkflow, executeSingleNode } from './runtime.js';
