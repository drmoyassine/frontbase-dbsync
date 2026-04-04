import * as _hono_zod_openapi from '@hono/zod-openapi';
import * as hono from 'hono';

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
