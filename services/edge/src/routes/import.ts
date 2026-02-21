/**
 * Import Route (Phase 3)
 * 
 * Receives page bundles from FastAPI and stores them locally.
 * POST /api/import - Import a page bundle
 */

import { Hono } from 'hono';
import {
    ImportPageRequestSchema,
    PublishPageSchema
} from '../schemas/publish';
import {
    upsertPublishedPage,
    getPublishedPageBySlug,
    deletePublishedPage,
    initPagesDb
} from '../db/pages-store';
import {
    updateProjectSettings,
    getProjectSettings,
    initProjectSettingsDb
} from '../db/project-settings';

// Create the import route (non-OpenAPI for better error handling)
export const importRoute = new Hono();

// =============================================================================
// POST /api/import - Import a page bundle
// =============================================================================

importRoute.post('/', async (c) => {
    try {
        const rawBody = await c.req.json();

        console.log('[Import] Received raw body keys:', Object.keys(rawBody));
        console.log('[Import] Page keys:', rawBody.page ? Object.keys(rawBody.page) : 'NO PAGE');

        // Manually validate with Zod and log errors
        const validationResult = ImportPageRequestSchema.safeParse(rawBody);

        if (!validationResult.success) {
            console.error('[Import] Zod Validation Failed!');
            console.error('[Import] Errors:', JSON.stringify(validationResult.error.issues, null, 2));

            // Log the problematic fields
            for (const issue of validationResult.error.issues) {
                console.error(`[Import] Field: ${issue.path.join('.')} - ${issue.message}`);

                // Log the actual value at that path for debugging
                let value = rawBody;
                for (const key of issue.path) {
                    value = value?.[key];
                }
                console.error(`[Import] Actual value: ${JSON.stringify(value)?.slice(0, 200)}`);
            }

            return c.json({
                success: false,
                error: 'Validation failed',
                details: validationResult.error.issues.map(i => ({
                    path: i.path.join('.'),
                    message: i.message,
                })),
            }, 400);
        }

        const { page, force } = validationResult.data;

        console.log(`[Import] Validated page: ${page.slug} (v${page.version})`);
        console.log(`[Import] cssBundle present: ${!!page.cssBundle}, length: ${page.cssBundle?.length || 0}`);

        // Check if page already exists with same or higher version
        if (!force) {
            const existing = await getPublishedPageBySlug(page.slug);
            if (existing && existing.version >= page.version) {
                return c.json({
                    success: false,
                    error: 'Version conflict',
                    details: {
                        existingVersion: existing.version,
                        newVersion: page.version,
                        message: 'Use force=true to overwrite'
                    }
                }, 400);
            }
        }

        // Upsert the page
        const result = await upsertPublishedPage(page);

        // Build preview URL - use PUBLIC_URL env var for production, fallback to host header for dev
        const publicUrl = process.env.PUBLIC_URL;
        let previewUrl: string;

        // For homepage, use '/' instead of slug
        const pageUrlPath = page.isHomepage ? '' : page.slug;

        console.log(`[Import] Building preview URL - PUBLIC_URL env: "${publicUrl}", isHomepage: ${page.isHomepage}`);

        if (publicUrl) {
            // Production: use configured public URL
            previewUrl = `${publicUrl.replace(/\/$/, '')}/${pageUrlPath}`;
            console.log(`[Import] Using PUBLIC_URL: ${previewUrl}`);
        } else {
            // Fallback: use request headers
            const host = c.req.header('host') || 'localhost:3002';

            // CHECK: If request came from internal Docker network (e.g. FastAPI calling Edge),
            // the host might be 'edge:3002'. In this case, return a RELATIVE path
            // so the frontend opens it relative to the current domain.
            if (host.includes('edge')) {
                previewUrl = `/${pageUrlPath}`;
                console.log(`[Import] Internal host detected (${host}), returning relative path: ${previewUrl}`);
            } else {
                const protocol = c.req.header('x-forwarded-proto') || 'http';
                previewUrl = `${protocol}://${host}/${pageUrlPath}`;
                console.log(`[Import] Using request headers fallback: ${previewUrl}`);
            }
        }

        return c.json({
            success: true,
            slug: page.slug,
            version: result.version,
            previewUrl,
            message: `Page "${page.name}" published successfully`
        }, 200);

    } catch (error) {
        console.error('[Import] Error:', error);
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});

// =============================================================================
// DELETE /api/import/:slug - Unpublish a page (remove from SSR)
// =============================================================================

importRoute.delete('/:slug', async (c) => {
    try {
        const slug = c.req.param('slug');

        if (!slug) {
            return c.json({
                success: false,
                error: 'Missing slug parameter',
            }, 400);
        }

        console.log(`[Import] Unpublishing page: ${slug}`);

        // Check if page exists
        const existing = await getPublishedPageBySlug(slug);
        if (!existing) {
            console.log(`[Import] Page not found in SSR: ${slug}`);
            // Return success anyway - page might already be unpublished
            return c.json({
                success: true,
                message: `Page "${slug}" was not published`,
            }, 200);
        }

        // Delete the page
        await deletePublishedPage(slug);
        console.log(`[Import] Successfully unpublished: ${slug}`);

        return c.json({
            success: true,
            slug,
            message: `Page "${slug}" unpublished successfully`,
        }, 200);

    } catch (error) {
        console.error('[Import] Unpublish error:', error);
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});

// =============================================================================
// POST /api/import/settings - Sync project settings (favicon, branding)
// =============================================================================

importRoute.post('/settings', async (c) => {
    try {
        const body = await c.req.json();

        console.log('[Import Settings] Received:', Object.keys(body));

        // Update project settings in local store
        await updateProjectSettings({
            faviconUrl: body.faviconUrl || null,
            logoUrl: body.logoUrl || null,
            siteName: body.siteName || body.name || null,
            siteDescription: body.siteDescription || body.description || null,
            appUrl: body.appUrl || null,
        });

        return c.json({
            success: true,
            message: 'Project settings synced successfully',
        }, 200);

    } catch (error) {
        console.error('[Import Settings] Error:', error);
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});

// =============================================================================
// GET /api/import/settings - Get current project settings
// =============================================================================

importRoute.get('/settings', async (c) => {
    try {
        const settings = await getProjectSettings();
        return c.json({
            success: true,
            settings,
        }, 200);
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});

// =============================================================================
// GET /api/import/status - Check import service status
// =============================================================================

importRoute.get('/status', async (c) => {
    return c.json({
        status: 'ok',
        ready: true,
    });
});

// Initialize databases on module load
initPagesDb().catch(console.error);
initProjectSettingsDb().catch(console.error);
