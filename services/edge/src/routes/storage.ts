/**
 * Storage API Routes
 * 
 * Hono routes for file upload, download, and management via Supabase Storage.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { createStorage, StorageConfig } from '../storage/supabase_provider';
import {
    StorageErrorSchema,
    PresignRequestSchema,
    PresignResponseSchema,
    CreateFolderRequestSchema,
    CreateFolderResponseSchema,
    UploadRequestSchema,
    UploadResponseSchema,
    ListFilesQuerySchema,
    ListFilesResponseSchema,
    DeleteRequestSchema,
    ListBucketsResponseSchema,
    CreateBucketRequestSchema,
    UpdateBucketRequestSchema,
    BucketSchema,
    BucketResponseSchema,
    MoveRequestSchema,
    SignedUrlQuerySchema,
    SuccessResponseSchema
} from '../schemas/storage';

const storageRoute = new OpenAPIHono();

// =============================================================================
// Helper: Get storage config from request context or database
// =============================================================================

// Cache config to avoid fetching on every request
let cachedConfig: StorageConfig | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

async function getStorageConfig(): Promise<StorageConfig | null> {
    // ... (rest of getStorageConfig stays same)
    // 1. Check environment variables (Priority 1)
    const envUrl = process.env.SUPABASE_URL;
    const envKey = process.env.SUPABASE_SERVICE_KEY;
    const envBucket = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';
    const envDatasourceName = process.env.SUPABASE_DATASOURCE_NAME || 'Supabase';

    if (envUrl && envKey) {
        return { supabaseUrl: envUrl, supabaseKey: envKey, bucket: envBucket, datasourceName: envDatasourceName };
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
                    bucket: envBucket, // Bucket still mainly from env or default
                    datasourceName: data.datasourceName || envDatasourceName
                };
                console.log(`[Storage Config] datasourceName: ${cachedConfig.datasourceName}`);
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
const presignRoute = createRoute({
    method: 'post',
    path: '/presign',
    tags: ['Storage'],
    summary: 'Get presigned upload URL',
    description: 'Generates a signed URL for direct file upload to Supabase Storage.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: PresignRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Presigned URL generated',
            content: {
                'application/json': {
                    schema: PresignResponseSchema,
                },
            },
        },
        400: {
            description: 'Storage not configured',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(presignRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const { path } = c.req.valid('json');
        const storage = createStorage(config);
        const signedUrl = await storage.createSignedUploadUrl(path);
        return c.json({ success: true, signedUrl, path }, 200);
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
const createFolderRoute = createRoute({
    method: 'post',
    path: '/create-folder',
    tags: ['Storage'],
    summary: 'Create a folder',
    description: 'Creates a folder by uploading a .folder placeholder file to Supabase Storage.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: CreateFolderRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Folder created',
            content: {
                'application/json': {
                    schema: CreateFolderResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(createFolderRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const { folderPath, bucket } = c.req.valid('json');

        // Supabase doesn't have native folder creation - we create a placeholder file
        const placeholderPath = folderPath.endsWith('/') ? `${folderPath}.folder` : `${folderPath}/.folder`;
        const storage = createStorage(config);

        // Upload an empty placeholder file
        const placeholderContent = new Blob([''], { type: 'text/plain' });
        await storage.upload(placeholderPath, placeholderContent, { bucket, upsert: true });

        return c.json({ success: true, folderPath, message: 'Folder created' }, 200);
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
const uploadRoute = createRoute({
    method: 'post',
    path: '/upload',
    tags: ['Storage'],
    summary: 'Direct file upload',
    description: 'Uploads a file directly (limited to 5MB, use presigned URL for larger files).',
    request: {
        body: {
            content: {
                'multipart/form-data': {
                    schema: UploadRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'File uploaded',
            content: {
                'application/json': {
                    schema: UploadResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        413: {
            description: 'File too large',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(uploadRoute, async (c) => {
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
        console.log('[Storage Upload] bucket from formData:', bucket, 'path:', path);
        const storage = createStorage(config);

        const result = await storage.upload(path, file, {
            contentType: file.type,
            bucket: bucket || undefined,
        });

        return c.json({
            success: true,
            path: result.path,
            publicUrl: result.publicUrl || '',
        }, 200);
    } catch (error) {

        console.error('Upload Error:', error);

        // Extract error message properly
        let errorMessage = 'Upload failed';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else if (error && typeof error === 'object') {
            errorMessage = (error as any).message || JSON.stringify(error);
        }

        return c.json({
            success: false,
            error: errorMessage,
        }, 500);
    }
});

// =============================================================================
// GET /list - List files in a directory
// =============================================================================
const listFilesRoute = createRoute({
    method: 'get',
    path: '/list',
    tags: ['Storage'],
    summary: 'List files',
    description: 'Lists files and folders in a specified path within a bucket.',
    request: {
        query: ListFilesQuerySchema,
    },
    responses: {
        200: {
            description: 'File list retrieved',
            content: {
                'application/json': {
                    schema: ListFilesResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(listFilesRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const { bucket: queryBucket, path: queryPath, limit: queryLimit, offset: queryOffset, search } = c.req.valid('query');
    const bucket = queryBucket || config.bucket;
    const path = queryPath || '';
    const limit = parseInt(queryLimit);
    const offset = parseInt(queryOffset);
    const storage = createStorage(config);

    try {
        const files = await storage.list(path, { limit, offset, bucket, search });
        return c.json({ success: true, files }, 200);
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
const deleteFileRoute = createRoute({
    method: 'delete',
    path: '/delete',
    tags: ['Storage'],
    summary: 'Delete files',
    description: 'Deletes one or more files from a bucket.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: DeleteRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Files deleted',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(deleteFileRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const { paths, bucket } = c.req.valid('json');
        const storage = createStorage(config);
        await storage.delete(paths, { bucket });
        return c.json({ success: true }, 200);
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
const listBucketsRoute = createRoute({
    method: 'get',
    path: '/buckets',
    tags: ['Storage'],
    summary: 'List buckets',
    description: 'Lists all available storage buckets.',
    responses: {
        200: {
            description: 'Bucket list retrieved',
            content: {
                'application/json': {
                    schema: ListBucketsResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(listBucketsRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const storage = createStorage(config);

    try {
        const buckets = await storage.listBuckets();
        return c.json({ success: true, buckets }, 200);
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
const createBucketRoute = createRoute({
    method: 'post',
    path: '/buckets',
    tags: ['Storage'],
    summary: 'Create a bucket',
    description: 'Creates a new storage bucket in Supabase.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: CreateBucketRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Bucket created',
            content: {
                'application/json': {
                    schema: BucketResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(createBucketRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const { name, public: isPublic, file_size_limit, allowed_mime_types } = c.req.valid('json');
        const storage = createStorage(config);
        const bucket = await storage.createBucket(name, {
            public: isPublic,
            file_size_limit,
            allowed_mime_types
        });
        return c.json({ success: true, bucket }, 200);
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
const getBucketRoute = createRoute({
    method: 'get',
    path: '/buckets/{id}',
    tags: ['Storage'],
    summary: 'Get bucket details',
    description: 'Retrieves details for a specific storage bucket.',
    request: {
        params: z.object({
            id: z.string().openapi({ example: 'my-bucket' }),
        }),
    },
    responses: {
        200: {
            description: 'Bucket details retrieved',
            content: {
                'application/json': {
                    schema: BucketResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        404: {
            description: 'Bucket not found',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(getBucketRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const id = c.req.param('id');
    const storage = createStorage(config);

    try {
        const bucket = await storage.getBucket(id);
        return c.json({ success: true, bucket }, 200);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Get bucket failed';
        // Return 404 if bucket not found
        if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
            return c.json({ success: false, error: 'Bucket not found' }, 404);
        }
        return c.json({ success: false, error: errorMessage }, 500);
    }
});

// =============================================================================
// PUT /buckets/:id - Update bucket
// =============================================================================
const updateBucketRoute = createRoute({
    method: 'put',
    path: '/buckets/{id}',
    tags: ['Storage'],
    summary: 'Update a bucket',
    description: 'Updates settings for an existing storage bucket.',
    request: {
        params: z.object({
            id: z.string(),
        }),
        body: {
            content: {
                'application/json': {
                    schema: UpdateBucketRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Bucket updated',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(updateBucketRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const id = c.req.param('id');
    const storage = createStorage(config);

    try {
        const { public: isPublic, file_size_limit, allowed_mime_types } = c.req.valid('json');
        const result = await storage.updateBucket(id, {
            public: isPublic,
            file_size_limit,
            allowed_mime_types
        });
        return c.json({ success: true, message: result.message }, 200);
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
const deleteBucketRoute = createRoute({
    method: 'delete',
    path: '/buckets/{id}',
    tags: ['Storage'],
    summary: 'Delete a bucket',
    description: 'Deletes a storage bucket. The bucket must be empty.',
    request: {
        params: z.object({
            id: z.string(),
        }),
    },
    responses: {
        200: {
            description: 'Bucket deleted',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(deleteBucketRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const id = c.req.param('id');
    const storage = createStorage(config);

    try {
        const result = await storage.deleteBucket(id);
        return c.json({ success: true, message: result.message }, 200);
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
const emptyBucketRoute = createRoute({
    method: 'post',
    path: '/buckets/{id}/empty',
    tags: ['Storage'],
    summary: 'Empty a bucket',
    description: 'Deletes all files within a storage bucket.',
    request: {
        params: z.object({
            id: z.string(),
        }),
    },
    responses: {
        200: {
            description: 'Bucket emptied',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(emptyBucketRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const id = c.req.param('id');
    const storage = createStorage(config);

    try {
        const result = await storage.emptyBucket(id);
        return c.json({ success: true, message: result.message }, 200);
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
const moveFileRoute = createRoute({
    method: 'post',
    path: '/move',
    tags: ['Storage'],
    summary: 'Move files',
    description: 'Moves a file from one path/bucket to another.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: MoveRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'File moved',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(moveFileRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const { sourceKey, destinationKey, sourceBucket, destBucket } = c.req.valid('json');

        const storage = createStorage(config);
        const result = await storage.move(sourceKey, destinationKey, { sourceBucket, destBucket });
        return c.json({ success: true, message: result.message }, 200);
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
const copyFileRoute = createRoute({
    method: 'post',
    path: '/copy',
    tags: ['Storage'],
    summary: 'Copy files',
    description: 'Copies a file from one path/bucket to another.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: MoveRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'File copied',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(copyFileRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    try {
        const { sourceKey, destinationKey, sourceBucket, destBucket } = c.req.valid('json');

        const storage = createStorage(config);
        const result = await storage.copy(sourceKey, destinationKey, { sourceBucket, destBucket });
        return c.json({ success: true, message: result.message }, 200);
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
const getSignedUrlRoute = createRoute({
    method: 'get',
    path: '/signed-url',
    tags: ['Storage'],
    summary: 'Get signed download URL',
    description: 'Generates a signed URL for temporary access to a private file.',
    request: {
        query: SignedUrlQuerySchema,
    },
    responses: {
        200: {
            description: 'Signed URL generated',
            content: {
                'application/json': {
                    schema: PresignResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid request',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
        500: {
            description: 'Internal server error',
            content: {
                'application/json': {
                    schema: StorageErrorSchema,
                },
            },
        },
    },
});

storageRoute.openapi(getSignedUrlRoute, async (c) => {
    const config = await getStorageConfig();
    if (!config) {
        return c.json({ success: false, error: 'Storage not configured' }, 400);
    }

    const { path, bucket, expiresIn: queryExpiresIn } = c.req.valid('query');
    const expiresIn = parseInt(queryExpiresIn);

    if (!path) {
        return c.json({ success: false, error: 'Path is required' }, 400);
    }

    const storage = createStorage(config);
    const targetBucket = bucket || config.bucket;

    if (!targetBucket) {
        return c.json({ success: false, error: 'Bucket is required' }, 400);
    }

    try {
        // Check if bucket is public - if so, return permanent public URL
        const bucketInfo = await storage.getBucket(targetBucket);

        if (bucketInfo.public) {
            // Public bucket: return permanent public URL (never expires)
            const publicUrl = storage.getPublicUrl(path, targetBucket);
            return c.json({ success: true, signedUrl: publicUrl, path, isPublic: true }, 200);
        }

        // Private bucket: return signed URL with expiration
        const signedUrl = await storage.createSignedUrl(path, expiresIn, bucket);
        return c.json({ success: true, signedUrl, path, isPublic: false }, 200);
    } catch (error) {
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Signed URL generation failed',
        }, 500);
    }
});

export { storageRoute };
