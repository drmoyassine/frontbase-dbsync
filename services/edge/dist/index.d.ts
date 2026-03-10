import * as _hono_zod_openapi from '@hono/zod-openapi';
import * as hono from 'hono';

/**
 * Full Engine
 *
 * Extends the Lite Engine with SSR pages, data routes, cache management,
 * React rendering, and component renderers.
 *
 * DRY: imports createLiteApp() and layers page routes on top.
 * Everything from Lite (middleware, LiquidJS, automation routes) is inherited.
 *
 * Target bundle size: ~900 KB - 1.3 MB.
 */
declare const app: _hono_zod_openapi.OpenAPIHono<hono.Env, {}, "/">;

/**
 * Frontbase Edge Engine - Docker/Node.js Adapter
 *
 * Entry point for Docker and local development deployments.
 * Uses @hono/node-server for HTTP serving and filesystem-based static files.
 *
 * This is the "full" adapter — serves both SSR pages and automation routes.
 */

export { app as default };
