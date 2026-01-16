// Storage Provider Types and Interfaces

export interface StorageFile {
    name: string;
    id: string;
    size: number;
    updated_at?: string;
    mimetype?: string;
    isFolder: boolean;
    metadata?: Record<string, any>;
}

export interface StorageBucket {
    id: string;
    name: string;
    public: boolean;
    created_at: string;
    provider: string;
    size: number;
    file_size_limit?: number;
    allowed_mime_types?: string[];
}

export interface UploadOptions {
    contentType?: string;
    upsert?: boolean;
    bucket?: string;
}

export interface ListOptions {
    limit?: number;
    offset?: number;
    sortBy?: { column: string; order: 'asc' | 'desc' };
    search?: string;
}

export interface MoveOptions {
    sourceBucket?: string;
    destBucket?: string;
}

export interface CopyOptions {
    sourceBucket?: string;
    destBucket?: string;
}

export interface BucketOptions {
    public?: boolean;
    file_size_limit?: number;
    allowed_mime_types?: string[];
}

export interface StorageConfig {
    type: 'supabase' | 'aws-s3' | 'cloudflare-r2' | 'minio' | 'backblaze-b2';
    url?: string;
    key?: string;
    bucket?: string;
    // S3-compatible options
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
}

/**
 * IStorageProvider: Common interface for all storage providers.
 * 
 * This abstraction enables seamless integration of multiple S3-compatible
 * storage providers (Supabase, AWS S3, Cloudflare R2, MinIO, etc.) without
 * requiring changes to the frontend or route handlers.
 */
export interface IStorageProvider {
    // =========================================================================
    // File Operations
    // =========================================================================

    /**
     * Upload a file to storage.
     */
    upload(
        path: string,
        file: File | Blob | Buffer | ArrayBuffer,
        options?: UploadOptions
    ): Promise<{ path: string; publicUrl?: string }>;

    /**
     * Download a file from storage.
     */
    download(path: string, bucket?: string): Promise<Blob | Buffer>;

    /**
     * Delete one or more files from storage.
     */
    delete(paths: string | string[], options?: { bucket?: string }): Promise<void>;

    /**
     * List files in a path.
     */
    list(path?: string, options?: ListOptions & { bucket?: string }): Promise<StorageFile[] | any[]>;

    /**
     * Move a file to a new location.
     */
    move(
        source: string,
        destination: string,
        options?: MoveOptions
    ): Promise<{ message: string } | void>;

    /**
     * Copy a file to a new location.
     */
    copy(
        source: string,
        destination: string,
        options?: CopyOptions
    ): Promise<{ message: string } | void>;

    /**
     * Create a signed URL for temporary access.
     */
    createSignedUrl(path: string, expiresIn?: number, bucket?: string): Promise<string>;

    /**
     * Get the public URL for a file (if bucket is public).
     */
    getPublicUrl(path: string, bucket?: string): string;

    // =========================================================================
    // Bucket Operations
    // =========================================================================

    /**
     * List all buckets.
     */
    listBuckets(): Promise<StorageBucket[] | any[]>;

    /**
     * Create a new bucket.
     */
    createBucket(
        name: string,
        options?: BucketOptions
    ): Promise<{ id: string; name: string }>;

    /**
     * Get a bucket by ID.
     * Returns partial bucket info (implementation-specific fields may vary).
     */
    getBucket(id: string): Promise<Partial<StorageBucket> & { id: string; name: string }>;

    /**
     * Update bucket settings.
     */
    updateBucket(
        id: string,
        options: BucketOptions
    ): Promise<{ message: string } | void>;

    /**
     * Delete a bucket.
     */
    deleteBucket(id: string): Promise<{ message: string } | void>;

    /**
     * Empty a bucket (delete all files but keep bucket).
     */
    emptyBucket(id: string): Promise<{ message: string } | void>;

    // =========================================================================
    // Folder Operations (Optional)
    // =========================================================================

    /**
     * Create a virtual folder (via placeholder file).
     */
    createFolder?(folderPath: string, bucket: string): Promise<void>;

    /**
     * Get total size of a folder recursively.
     */
    getFolderSize?(folderPath: string, bucket: string): Promise<number>;
}
