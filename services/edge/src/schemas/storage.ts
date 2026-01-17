import { z } from '@hono/zod-openapi';

export const StorageErrorSchema = z.object({
    success: z.literal(false),
    error: z.string().openapi({ example: 'Error message' }),
    details: z.any().optional(),
}).openapi('StorageError');

export const PresignRequestSchema = z.object({
    path: z.string().openapi({ example: 'uploads/file.png' }),
}).openapi('PresignRequest');

export const PresignResponseSchema = z.object({
    success: z.literal(true),
    signedUrl: z.string(),
    path: z.string(),
}).openapi('PresignResponse');

export const CreateFolderRequestSchema = z.object({
    folderPath: z.string().openapi({ example: 'images' }),
    bucket: z.string().openapi({ example: 'uploads' }),
}).openapi('CreateFolderRequest');

export const CreateFolderResponseSchema = z.object({
    success: z.literal(true),
    folderPath: z.string(),
    message: z.string(),
}).openapi('CreateFolderResponse');

export const UploadRequestSchema = z.object({
    file: z.instanceof(File).openapi({ type: 'string', format: 'binary' }),
    path: z.string().optional(),
    bucket: z.string().optional(),
}).openapi('UploadRequest');

export const UploadResponseSchema = z.object({
    success: z.literal(true),
    path: z.string(),
    publicUrl: z.string(),
}).openapi('UploadResponse');

export const ListFilesQuerySchema = z.object({
    bucket: z.string().optional(),
    path: z.string().optional(),
    limit: z.string().optional().default('100'),
    offset: z.string().optional().default('0'),
    search: z.string().optional(),
}).openapi('ListFilesQuery');

export const ListFilesResponseSchema = z.object({
    success: z.literal(true),
    files: z.array(z.object({
        name: z.string(),
        id: z.string(),
        size: z.number(),
        updated_at: z.string().optional(),
        mimetype: z.string().optional(),
        isFolder: z.boolean(),
        metadata: z.any().optional(),
    })),
}).openapi('ListFilesResponse');

export const DeleteRequestSchema = z.object({
    paths: z.union([z.string(), z.array(z.string())]),
    bucket: z.string().optional(),
}).openapi('DeleteRequest');

export const BucketSchema = z.object({
    id: z.string(),
    name: z.string(),
    public: z.boolean().optional(),
    created_at: z.string().optional(),
    provider: z.string().optional(),
    size: z.number().optional(),
    file_size_limit: z.number().optional(),
    allowed_mime_types: z.array(z.string()).optional(),
}).openapi('Bucket');

export const BucketResponseSchema = z.object({
    success: z.literal(true),
    bucket: BucketSchema,
}).openapi('BucketResponse');

export const ListBucketsResponseSchema = z.object({
    success: z.literal(true),
    buckets: z.array(BucketSchema),
}).openapi('ListBucketsResponse');

export const CreateBucketRequestSchema = z.object({
    name: z.string().openapi({ example: 'new-bucket' }),
    public: z.boolean().optional(),
    file_size_limit: z.number().optional(),
    allowed_mime_types: z.array(z.string()).optional(),
}).openapi('CreateBucketRequest');

export const UpdateBucketRequestSchema = z.object({
    public: z.boolean(),
    file_size_limit: z.number().optional(),
    allowed_mime_types: z.array(z.string()).optional(),
}).openapi('UpdateBucketRequest');

export const MoveRequestSchema = z.object({
    sourceKey: z.string(),
    destinationKey: z.string(),
    sourceBucket: z.string().optional(),
    destBucket: z.string().optional(),
}).openapi('MoveRequest');

export const SignedUrlQuerySchema = z.object({
    path: z.string(),
    bucket: z.string().optional(),
    expiresIn: z.string().optional().default('3600'),
}).openapi('SignedUrlQuery');

export const SuccessResponseSchema = z.object({
    success: z.literal(true),
    message: z.string().optional(),
}).openapi('SuccessResponse');
