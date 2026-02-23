/**
 * Edge Deployment Adapter Interface
 * 
 * Abstracts platform-specific concerns (server startup, static file serving)
 * so the same Edge Engine core can run on Docker, Cloudflare Workers,
 * Vercel Edge Functions, Netlify Edge, etc.
 * 
 * Each adapter implementation wires the shared routes/middleware
 * and handles platform-specific entry/exit.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';

export type HonoApp = InstanceType<typeof OpenAPIHono>;

export interface IEdgeAdapter {
    /** Platform identifier — stored in deployment_targets.provider */
    readonly platform: 'cloudflare' | 'vercel' | 'netlify' | 'docker';

    /** Adapter scope — which subset of routes this adapter serves */
    readonly scope: 'pages' | 'automations' | 'full';
}
