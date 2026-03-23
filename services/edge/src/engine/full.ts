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
import { systemKeyAuth } from '../middleware/auth.js';

// Page-specific routes (these pull in React, LiquidJS, SSR, etc.)
import { pagesRoute } from '../routes/pages.js';
import { importRoute } from '../routes/import.js';
import { dataRoute } from '../routes/data.js';
import { manageRoute } from '../routes/manage.js';

// =============================================================================
// Full App = Lite + Pages/SSR
// =============================================================================

const app = createLiteApp('full');

// ── System key auth for full-engine management routes ──────────────────
app.use('/api/import/*', systemKeyAuth);
app.use('/api/data/*', systemKeyAuth);
app.use('/api/manage/*', systemKeyAuth);

// ── Page / SSR Routes ──────────────────────────────────────────────────
app.route('/api/import', importRoute);
app.route('/api/data', dataRoute);
app.route('/api/manage', manageRoute);
app.route('', pagesRoute); // SSR pages at /{slug}

export { app as fullApp };
