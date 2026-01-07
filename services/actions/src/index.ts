/**
 * Frontbase Actions Engine - Runtime Service
 * 
 * Hono-based workflow execution server with Zod-OpenAPI validation.
 * Handles published workflows, webhooks, and execution monitoring.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';

import { healthRoute } from './routes/health';
import { deployRoute } from './routes/deploy';
import { executeRoute } from './routes/execute';
import { webhookRoute } from './routes/webhook';
import { executionsRoute } from './routes/executions';

// Create OpenAPI-enabled Hono app
const app = new OpenAPIHono();

// Middleware
app.use('*', logger());
app.use('*', cors({
    origin: ['http://localhost:5173', 'http://localhost:8000'],
    credentials: true,
}));

// OpenAPI Info
app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
        title: 'Frontbase Actions Engine API',
        version: '0.1.0',
        description: 'Runtime API for executing published workflows and handling triggers.',
    },
    servers: [
        { url: 'http://localhost:3002', description: 'Local development' },
    ],
});

// Swagger UI
app.get('/docs', swaggerUI({ url: '/openapi.json' }));

// Routes
app.route('/health', healthRoute);
app.route('/deploy', deployRoute);
app.route('/execute', executeRoute);
app.route('/webhook', webhookRoute);
app.route('/executions', executionsRoute);

// Root redirect to docs
app.get('/', (c) => c.redirect('/docs'));

// Start server with Node.js adapter
const port = parseInt(process.env.PORT || '3002');

serve({
    fetch: app.fetch,
    port,
}, (info) => {
    console.log(`🚀 Actions Engine running on http://localhost:${info.port}`);
});

export default app;
