/**
 * Update Route - Self-update the Edge Engine bundle (Docker/Node.js)
 *
 * Receives a compiled bundle from the Control Plane, writes it to dist/,
 * responds 200, then schedules a graceful exit so Docker `restart: always`
 * brings it back with the new code.
 *
 * Security: Protected by the same API key auth as /api/deploy.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { SuccessResponseSchema, ErrorResponseSchema } from '../schemas';

const updateRoute = new OpenAPIHono();

const route = createRoute({
    method: 'post',
    path: '/',
    tags: ['System'],
    summary: 'Self-update the Edge Engine bundle',
    description: 'Receives a new compiled bundle, writes to disk, and schedules a graceful restart.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        script_content: z.string().min(1).openapi({
                            description: 'The compiled JS bundle content',
                        }),
                        source_hash: z.string().min(1).openapi({
                            description: '12-char source hash for tracking',
                        }),
                        version: z.string().optional().openapi({
                            description: 'Optional version string',
                        }),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Bundle written — restart scheduled',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema.extend({
                        source_hash: z.string(),
                        restart_in_ms: z.number(),
                    }),
                },
            },
        },
        400: {
            description: 'Invalid payload',
            content: {
                'application/json': {
                    schema: ErrorResponseSchema,
                },
            },
        },
        500: {
            description: 'Write failed',
            content: {
                'application/json': {
                    schema: ErrorResponseSchema,
                },
            },
        },
    },
});

updateRoute.openapi(route, async (c) => {
    try {
        const { script_content, source_hash, version } = c.req.valid('json');

        // Resolve the dist directory (relative to the running process)
        const path = await import('path');
        const fs = await import('fs');
        const { fileURLToPath } = await import('url');

        // In production Docker: cwd = /app, entry = dist/index.js
        // In dev: cwd = services/edge, entry = src/index.ts
        const distDir = path.resolve(process.cwd(), 'dist');
        const entryFile = path.join(distDir, 'index.js');

        // Ensure dist/ exists
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
        }

        // Write the new bundle atomically (write to temp, then rename)
        const tmpFile = `${entryFile}.tmp.${Date.now()}`;
        fs.writeFileSync(tmpFile, script_content, 'utf-8');
        fs.renameSync(tmpFile, entryFile);

        const sizeKB = Math.round(script_content.length / 1024);
        console.log(`[Update] New bundle written: ${sizeKB} KB, hash=${source_hash}, version=${version || 'N/A'}`);

        // Schedule graceful exit after responding
        // Docker `restart: always` will bring us back with the new code
        const restartDelayMs = 1500;
        setTimeout(() => {
            console.log('[Update] Restarting with new bundle...');
            process.exit(0);
        }, restartDelayMs);

        return c.json({
            success: true as const,
            message: `Bundle updated (${sizeKB} KB). Restarting in ${restartDelayMs}ms.`,
            source_hash,
            restart_in_ms: restartDelayMs,
        }, 200);
    } catch (err: any) {
        console.error('[Update] Failed:', err);
        return c.json({
            error: 'UpdateFailed',
            message: err.message || 'Failed to write bundle',
        }, 500);
    }
});

export { updateRoute };
