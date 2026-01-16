/**
 * Storage API Routes
 * 
 * Hono routes for file upload, download, and management via Supabase Storage.
 */

import { Hono } from 'hono';
import { createStorage, StorageConfig } from '../storage/supabase';

const storageRoute = new Hono();

// =============================================================================
// Helper: Get storage config from request context or database
// =============================================================================

// Cache config to avoid fetching on every request
let cachedConfig: StorageConfig | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

async function getStorageConfig(): Promise<StorageConfig | null> {
    // 1. Check environment variables (Priority 1)
    const envUrl = process.env.SUPABASE_URL;
    const envKey = process.env.SUPABASE_SERVICE_KEY;
    const envBucket = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

    if (envUrl && envKey) {
        return { supabaseUrl: envUrl, supabaseKey: envKey, bucket: envBucket };
    }

    // 2. Check cache
    const now = Date.now();
    if (cachedConfig && (now - lastFetchTime < CACHE_TTL)) {
        return cachedConfig;
    }

    // 3. Fetch from FastAPI (Priority 2)
    try {
        const fastApiUrl = process.env.FASTAPI_URL || 'http://localhost:8000';
        console.log(`[Storage Config] Fetching credentials from: ${fastApiUrl}/api/project/internal/creds/`);
        const response = await fetch(`${fastApiUrl}/api/project/internal/creds/`);

        if (response.ok) {
            const data = await response.json();
            console.log(`[Storage Config] Credentials fetched: ${data.supabaseUrl ? 'Yes' : 'No'}`);
            if (data.supabaseUrl && (data.supabaseServiceKey || data.supabaseKey)) {
                cachedConfig = {
                    supabaseUrl: data.supabaseUrl,
                    supabaseKey: data.supabaseServiceKey || data.supabaseKey,
                    bucket: envBucket // Bucket still mainly from env or default
                };
                lastFetchTime = now;
                return cachedConfig;
            }
        }
    } catch (error) {
        console.error("Failed to fetch storage config from backend:", error);
    }

    return null;
}

// =============================================================================
// POST /presign - Get presigned upload URL
// =============================================================================
storageRoute.post('/presign', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const { path } = await c.req.json<{ path: string }>();
        const storage = createStorage(config);
        const signedUrl = await storage.createSignedUploadUrl(path);
        return c.json({ success: true, signedUrl, path });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Upload URL generation failed',
        }, 500);
    }
});

// =============================================================================
// POST /create-folder - Create a folder by uploading a placeholder file
// =============================================================================
storageRoute.post('/create-folder', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const { folderPath, bucket } = await c.req.json<{ folderPath: string; bucket: string }>();

        if (!folderPath || !bucket) {
            return c.json({ success: false, error: 'folderPath and bucket are required' }, 400);
        }

        // Supabase doesn't have native folder creation - we create a placeholder file
        const placeholderPath = folderPath.endsWith('/') ? `${folderPath}.folder` : `${folderPath}/.folder`;
        const storage = createStorage(config);

        // Upload an empty placeholder file
        const placeholderContent = new Blob([''], { type: 'text/plain' });
        await storage.upload(placeholderPath, placeholderContent, { bucket, upsert: true });

        return c.json({ success: true, folderPath, message: 'Folder created' });
    } catch (error) {
        console.error('Create folder error:', error);
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Create folder failed',
        }, 500);
    }
});

// =============================================================================
// POST /upload - Direct upload (small files only)
// =============================================================================
storageRoute.post('/upload', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const formData = await c.req.formData();
        const file = formData.get('file') as File | null;
        const customPath = formData.get('path') as string | null;

        if (!file) {
            return c.json({ success: false, error: 'No file provided' }, 400);
        }

        // Limit direct upload to 5MB
        if (file.size > 5 * 1024 * 1024) {
            return c.json({
                success: false,
                error: 'File too large. Use presigned URL for files over 5MB.',
            }, 413);
        }

        const path = customPath || `uploads/${Date.now()}-${file.name}`;
        const bucket = formData.get('bucket') as string | null;
        const storage = createStorage(config);

        const result = await storage.upload(path, file, {
            contentType: file.type,
            bucket: bucket || undefined,
        });

        return c.json({
            success: true,
            path: result.path,
            publicUrl: result.publicUrl,
        });
    } catch (error) {
        console.error('Upload Error:', error);
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed',
        }, 500);
    }
});

// =============================================================================
// GET /list - List files in a directory
// =============================================================================
storageRoute.get('/list', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const bucket = c.req.query('bucket') || config.bucket;
    const path = c.req.query('path') || '';
    const limit = parseInt(c.req.query('limit') || '100');
    const offset = parseInt(c.req.query('offset') || '0');
    const search = c.req.query('search');
    const storage = createStorage(config);

    try {
        const files = await storage.list(path, { limit, offset, bucket, search });
        return c.json({ success: true, files });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'List failed',
        }, 500);
    }
});

// =============================================================================
// DELETE /delete - Delete a file
// =============================================================================
storageRoute.delete('/delete', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const { paths, bucket } = await c.req.json<{ paths: string | string[]; bucket?: string }>();
        const storage = createStorage(config);
        await storage.delete(paths, { bucket });
        return c.json({ success: true });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Delete failed',
        }, 500);
    }
});

// =============================================================================
// GET /buckets - List all buckets
// =============================================================================
storageRoute.get('/buckets', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const storage = createStorage(config);

    try {
        const buckets = await storage.listBuckets();
        return c.json({ success: true, buckets });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'List buckets failed',
        }, 500);
    }
});

// =============================================================================
// POST /buckets - Create a bucket
// =============================================================================
storageRoute.post('/buckets', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const { name, public: isPublic, file_size_limit, allowed_mime_types } = await c.req.json<{
            name: string;
            public?: boolean;
            file_size_limit?: number;
            allowed_mime_types?: string[];
        }>();
        const storage = createStorage(config);
        const bucket = await storage.createBucket(name, {
            public: isPublic,
            file_size_limit,
            allowed_mime_types
        });
        return c.json({ success: true, bucket });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Create bucket failed',
        }, 500);
    }
});

// =============================================================================
// GET /buckets/:id - Get bucket details
// =============================================================================
storageRoute.get('/buckets/:id', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const id = c.req.param('id');
    const storage = createStorage(config);

    try {
        const bucket = await storage.getBucket(id);
        return c.json({ success: true, bucket });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Get bucket failed',
        }, 500);
    }
});

// =============================================================================
// PUT /buckets/:id - Update bucket
// =============================================================================
storageRoute.put('/buckets/:id', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const id = c.req.param('id');
    const storage = createStorage(config);

    try {
        const { public: isPublic, file_size_limit, allowed_mime_types } = await c.req.json<{
            public: boolean;
            file_size_limit?: number;
            allowed_mime_types?: string[];
        }>();
        const result = await storage.updateBucket(id, {
            public: isPublic,
            file_size_limit,
            allowed_mime_types
        });
        return c.json({ success: true, message: result.message });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Update bucket failed',
        }, 500);
    }
});

// =============================================================================
// DELETE /buckets/:id - Delete bucket
// =============================================================================
storageRoute.delete('/buckets/:id', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const id = c.req.param('id');
    const storage = createStorage(config);

    try {
        const result = await storage.deleteBucket(id);
        return c.json({ success: true, message: result.message });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Delete bucket failed',
        }, 500);
    }
});

// =============================================================================
// POST /buckets/:id/empty - Empty bucket
// =============================================================================
storageRoute.post('/buckets/:id/empty', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const id = c.req.param('id');
    const storage = createStorage(config);

    try {
        const result = await storage.emptyBucket(id);
        return c.json({ success: true, message: result.message });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Empty bucket failed',
        }, 500);
    }
});

// =============================================================================
// POST /move - Move file
// =============================================================================
storageRoute.post('/move', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const { sourceKey, destinationKey, sourceBucket, destBucket } = await c.req.json<{
            sourceKey: string;
            destinationKey: string;
            sourceBucket?: string;
            destBucket?: string;
        }>();

        const storage = createStorage(config);
        const result = await storage.move(sourceKey, destinationKey, { sourceBucket, destBucket });
        return c.json({ success: true, message: result.message });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Move file failed',
        }, 500);
    }
});

// =============================================================================
// POST /copy - Copy file
// =============================================================================
storageRoute.post('/copy', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const { sourceKey, destinationKey, sourceBucket, destBucket } = await c.req.json<{
            sourceKey: string;
            destinationKey: string;
            sourceBucket?: string;
            destBucket?: string;
        }>();

        const storage = createStorage(config);
        const result = await storage.copy(sourceKey, destinationKey, { sourceBucket, destBucket });
        return c.json({ success: true, message: result.message });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Copy file failed',
        }, 500);
    }
});

// =============================================================================
// GET /signed-url - Get signed download URL
// =============================================================================
storageRoute.get('/signed-url', async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const path = c.req.query('path');
    const bucket = c.req.query('bucket');
    const expiresIn = parseInt(c.req.query('expiresIn') || '3600');

    if (!path) {
        return c.json({ success: false, error: 'Path is required' }, 400);
    }

    const storage = createStorage(config);

    try {
        const signedUrl = await storage.createSignedUrl(path, expiresIn, bucket);
        return c.json({ success: true, signedUrl, path });
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Signed URL generation failed',
        }, 500);
    }
});

export { storageRoute };
