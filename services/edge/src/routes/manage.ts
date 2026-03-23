/**
 * Page Management Route — List, inspect, and delete published pages
 *
 * Provides read/delete endpoints for inspecting what's deployed on this engine.
 * Separate from import.ts (which handles FastAPI-to-edge sync).
 *
 * Full Engine only — lite engines don't serve pages.
 * All endpoints protected by systemKeyAuth (registered in full.ts).
 *
 * Routes:
 *   GET    /pages         — List all published pages
 *   GET    /pages/:slug   — Get full page bundle by slug
 *   DELETE /pages/:slug   — Delete a page (+ Redis cache invalidation)
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { stateProvider } from '../storage/index.js';
import { SuccessResponseSchema, ErrorResponseSchema } from '../schemas';

const manageRoute = new OpenAPIHono();

// ── GET /pages — List all pages ─────────────────────────────────────────────

const listPagesRoute = createRoute({
    method: 'get',
    path: '/pages',
    tags: ['Pages'],
    summary: 'List all published pages',
    description: 'Returns slug, name, and version for each published page on this engine',
    responses: {
        200: {
            description: 'Page list',
            content: {
                'application/json': {
                    schema: z.object({
                        pages: z.array(z.object({
                            slug: z.string(),
                            name: z.string(),
                            version: z.number(),
                        })),
                        total: z.number(),
                    }),
                },
            },
        },
    },
});

manageRoute.openapi(listPagesRoute, async (c) => {
    const pages = await stateProvider.listPages();
    return c.json({ pages, total: pages.length }, 200);
});

// ── GET /pages/:slug — Get full page ────────────────────────────────────────

const getPageRoute = createRoute({
    method: 'get',
    path: '/pages/:slug',
    tags: ['Pages'],
    summary: 'Get page by slug',
    description: 'Returns the full page bundle including layout, SEO, datasources, and CSS',
    request: {
        params: z.object({
            slug: z.string().openapi({ description: 'Page slug' }),
        }),
    },
    responses: {
        200: {
            description: 'Page bundle',
            content: {
                'application/json': {
                    schema: z.object({ page: z.record(z.unknown()) }),
                },
            },
        },
        404: {
            description: 'Page not found',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
});

manageRoute.openapi(getPageRoute, async (c) => {
    const { slug } = c.req.valid('param');
    const page = await stateProvider.getPageBySlug(slug);
    if (!page) {
        return c.json({ error: 'NotFound', message: `Page "${slug}" not found` }, 404);
    }
    return c.json({ page }, 200);
});

// ── DELETE /pages/:slug — Delete a page ─────────────────────────────────────

const deletePageRoute = createRoute({
    method: 'delete',
    path: '/pages/:slug',
    tags: ['Pages'],
    summary: 'Delete a page',
    description: 'Removes a published page from this engine and invalidates Redis cache',
    request: {
        params: z.object({
            slug: z.string().openapi({ description: 'Page slug' }),
        }),
    },
    responses: {
        200: {
            description: 'Page deleted',
            content: {
                'application/json': { schema: SuccessResponseSchema },
            },
        },
    },
});

manageRoute.openapi(deletePageRoute, async (c) => {
    const { slug } = c.req.valid('param');
    await stateProvider.deletePage(slug);

    // Invalidate Redis cache
    try {
        const { getRedis } = await import('../cache/redis.js');
        const redis = getRedis();
        await redis.del(`page:${slug}`);
    } catch {
        // Redis not configured — no-op
    }

    return c.json({ success: true as const, message: `Page "${slug}" deleted` }, 200);
});

export { manageRoute };
