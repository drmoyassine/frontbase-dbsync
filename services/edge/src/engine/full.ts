/**
 * Full Engine
 * 
 * Extends the Lite Engine with SSR pages, data routes,
 * React rendering, and component renderers.
 * 
 * DRY: imports createLiteApp() and layers page routes on top.
 * Everything from Lite (middleware, LiquidJS, automation routes, cache) is inherited.
 * 
 * Target bundle size: ~900 KB - 1.3 MB.
 */

import { createLiteApp } from './lite.js';

// Page-specific routes (these pull in React, LiquidJS, SSR, etc.)
import { pagesRoute } from '../routes/pages.js';
import { importRoute } from '../routes/import.js';
import { dataRoute } from '../routes/data.js';

// =============================================================================
// Full App = Lite + Pages/SSR
// =============================================================================

const app = createLiteApp();

// ── Page / SSR Routes ──────────────────────────────────────────────────
app.route('/api/import', importRoute);
app.route('/api/data', dataRoute);
app.route('', pagesRoute); // SSR pages at /{slug}

export { app as fullApp };
