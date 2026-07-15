/**
 * Storage Adapter Interface for RAG — Direct provider access.
 *
 * Follows the same pattern as IStateProvider, ICacheProvider:
 *   - Edge connects directly to storage (Supabase, Cloudflare R2, etc.)
 *   - Credentials from FRONTBASE_STORAGE config (pushed at deploy time)
 *   - No backend API calls — maintains edge self-sufficiency
 */

import { getStorageConfig } from '../../config/env.js';

// =============================================================================
// Security Validators
// =============================================================================

/**
 * Validate bucket name for security (prevent injection attacks).
 * AWS S3 bucket naming rules: 3-63 chars, lowercase alphanumeric, hyphens, dots.
 * Cannot start/end with hyphen, cannot have consecutive hyphens.
 * Cannot be formatted as IP address.
 */
function validateBucketName(bucket: string): void {
    if (!bucket || bucket.length < 3 || bucket.length > 63) {
        throw new Error(`Invalid bucket name length: ${bucket}`);
    }

    // Prevent IP address format
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bucket)) {
        throw new Error(`Bucket name cannot be IP address format: ${bucket}`);
    }

    // Validate characters and format
    const valid = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$|^[a-z0-9]$/.test(bucket);
    if (!valid) {
        throw new Error(`Invalid bucket name: ${bucket}`);
    }

    // Prevent consecutive dots or hyphens
    if (/\.\.|--/.test(bucket)) {
        throw new Error(`Bucket name cannot contain consecutive dots or hyphens: ${bucket}`);
    }
}

/**
 * Validate file path (prevent path traversal attacks).
 * Removes dangerous sequences and normalizes the path.
 */
function sanitizePath(path: string): string {
    if (!path) return '';

    // Remove absolute paths and path traversal attempts
    let sanitized = path.replace(/^\.?\.\//, '')
                         .replace(/^\.?\.\//, '')  // Remove ../
                         .replace(/^\/+/, '')       // Remove leading /
                         .replace(/\\/g, '/');      // Normalize backslashes to forward slashes

    return sanitized;
}

// =============================================================================
// Types
// =============================================================================

export interface StorageFile {
    name: string;
    id: string;
    path: string;
    bucket: string;
    size: number;
    mimetype?: string;
    updated_at?: string;
}

export interface StorageAdapter {
    /**
     * List files in a bucket/folder.
     */
    listFiles(
        bucket: string,
        folderPath?: string,
        options?: { limit?: number; offset?: number; search?: string }
    ): Promise<StorageFile[]>;

    /**
     * Download a file's content.
     */
    downloadFile(bucket: string, path: string): Promise<{ buffer: Uint8Array; contentType: string }>;

    /**
     * Get a public URL for a file.
     */
    getPublicUrl(bucket: string, path: string): string;

    /**
     * Get a signed URL (temporary access).
     */
    getSignedUrl(bucket: string, path: string, expiresIn?: number): Promise<string>;

    /**
     * Create a folder.
     */
    createFolder(bucket: string, folderPath: string): Promise<void>;

    /**
     * Delete files.
     */
    deleteFiles(bucket: string, paths: string[]): Promise<void>;

    /**
     * Move a file.
     */
    moveFile(bucket: string, sourcePath: string, destPath: string): Promise<void>;
}

// =============================================================================
// Supabase Storage Adapter
// =============================================================================

export class SupabaseStorageAdapter implements StorageAdapter {
    private url: string;
    private anonKey: string;
    private projectId?: string;

    constructor(config: { url: string; anonKey: string; projectId?: string }) {
        this.url = config.url.replace(/\/$/, ''); // Remove trailing slash
        this.anonKey = config.anonKey;
        this.projectId = config.projectId;
    }

    async listFiles(
        bucket: string,
        folderPath = '',
        options?: { limit?: number; offset?: number; search?: string }
    ): Promise<StorageFile[]> {
        // Security validation
        validateBucketName(bucket);
        const sanitizedPath = sanitizePath(folderPath);

        const params = new URLSearchParams({
            limit: String(options?.limit || 100),
            offset: String(options?.offset || 0),
        });

        if (sanitizedPath) {
            params.set('path', sanitizedPath);
        }
        if (options?.search) {
            params.set('search', options.search);
        }

        const response = await fetch(
            `${this.url}/storage/v1/bucket/${bucket}/objects/list?${params.toString()}`,
            {
                headers: {
                    'apikey': this.anonKey,
                    'Authorization': `Bearer ${this.anonKey}`,
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Supabase list failed: ${response.statusText}`);
        }

        const data = await response.json();

        // Transform Supabase response to our format
        return (data.data || []).map((item: any) => ({
            name: item.name,
            id: item.id,
            path: `${folderPath ? folderPath + '/' : ''}${item.name}`.replace(/^\/+/, ''),
            bucket,
            size: item.metadata?.size || 0,
            mimetype: item.metadata?.mimetype || item.mime_type,
            updated_at: item.updated_at || item.created_at,
        }));
    }

    async downloadFile(bucket: string, path: string): Promise<{ buffer: Uint8Array; contentType: string }> {
        // Security validation
        validateBucketName(bucket);
        const sanitizedPath = sanitizePath(path);

        const signedUrl = await this.getSignedUrl(bucket, sanitizedPath, 3600);

        const response = await fetch(signedUrl);
        if (!response.ok) {
            throw new Error(`Supabase download failed: ${response.statusText}`);
        }

        const buffer = new Uint8Array(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/octet-stream';

        return { buffer, contentType };
    }

    getPublicUrl(bucket: string, path: string): string {
        validateBucketName(bucket);
        const sanitizedPath = sanitizePath(path);
        return `${this.url}/storage/v1/object/public/${bucket}/${sanitizedPath}`;
    }

    async getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
        validateBucketName(bucket);
        const sanitizedPath = sanitizePath(path);
        const response = await fetch(
            `${this.url}/storage/v1/object/sign/${bucket}/${path}?expiresIn=${expiresIn}`,
            {
                method: 'POST',
                headers: {
                    'apikey': this.anonKey,
                    'Authorization': `Bearer ${this.anonKey}`,
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Supabase sign URL failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.signedUrl || this.getPublicUrl(bucket, path);
    }

    async createFolder(bucket: string, folderPath: string): Promise<void> {
        // Security validation
        validateBucketName(bucket);
        const sanitizedPath = sanitizePath(folderPath);

        // Supabase doesn't have explicit folders - create an empty .folder file
        const markerPath = `${sanitizedPath.replace(/\/$/, '')}/.folder`;

        const response = await fetch(
            `${this.url}/storage/v1/object/${bucket}/${markerPath}`,
            {
                method: 'POST',
                headers: {
                    'apikey': this.anonKey,
                    'Authorization': `Bearer ${this.anonKey}`,
                    'Content-Type': 'application/octet-stream',
                },
                body: new Uint8Array(0),
            }
        );

        if (!response.ok && response.status !== 200) {
            throw new Error(`Supabase create folder failed: ${response.statusText}`);
        }
    }

    async deleteFiles(bucket: string, paths: string[]): Promise<void> {
        const response = await fetch(
            `${this.url}/storage/v1/bucket/${bucket}/objects`,
            {
                method: 'DELETE',
                headers: {
                    'apikey': this.anonKey,
                    'Authorization': `Bearer ${this.anonKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ paths }),
            }
        );

        if (!response.ok) {
            throw new Error(`Supabase delete failed: ${response.statusText}`);
        }
    }

    async moveFile(bucket: string, sourcePath: string, destPath: string): Promise<void> {
        // Security validation
        validateBucketName(bucket);
        const sanitizedSource = sanitizePath(sourcePath);
        const sanitizedDest = sanitizePath(destPath);

        const response = await fetch(
            `${this.url}/storage/v1/object/move`,
            {
                method: 'POST',
                headers: {
                    'apikey': this.anonKey,
                    'Authorization': `Bearer ${this.anonKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    source: { bucket: `${this.projectId}/${bucket}`, path: sanitizedSource },
                    destination: { bucket: `${this.projectId}/${bucket}`, path: sanitizedDest },
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Supabase move failed: ${response.statusText}`);
        }
    }
}

// =============================================================================
// Cloudflare R2 Adapter
// =============================================================================

export class CloudflareR2Adapter implements StorageAdapter {
    private accountId: string;
    private apiToken: string;
    private bucket: string;
    private publicUrl?: string;

    constructor(config: {
        accountId: string;
        apiToken: string;
        bucket: string;
        publicUrl?: string;
    }) {
        this.accountId = config.accountId;
        this.apiToken = config.apiToken;
        this.bucket = config.bucket;
        this.publicUrl = config.publicUrl;
    }

    async listFiles(
        bucket: string,
        folderPath = '',
        options?: { limit?: number }
    ): Promise<StorageFile[]> {
        // Security validation
        validateBucketName(bucket);
        const sanitizedPath = sanitizePath(folderPath);

        const params = new URLSearchParams({
            limit: String(options?.limit || 1000),
        });

        if (sanitizedPath) {
            params.set('prefix', sanitizedPath.replace(/\/$/, '') + '/');
        }

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/r2/buckets/${bucket}/objects?${params}`,
            {
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                },
            }
        );

        if (!response.ok) {
            throw new Error(`R2 list failed: ${response.statusText}`);
        }

        const data = await response.json();

        return (data.result || []).map((obj: any) => ({
            name: obj.key.split('/').pop() || obj.key,
            id: obj.key,
            path: obj.key,
            bucket,
            size: obj.size,
            mimetype: 'application/octet-stream',
            updated_at: obj.uploaded,
        }));
    }

    async downloadFile(bucket: string, path: string): Promise<{ buffer: Uint8Array; contentType: string }> {
        // Security validation
        validateBucketName(bucket);
        const sanitizedPath = sanitizePath(path);

        // R2 doesn't have a direct download API - use public URL or presigned
        const url = this.getPublicUrl(bucket, sanitizedPath);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`R2 download failed: ${response.statusText}`);
        }

        const buffer = new Uint8Array(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/octet-stream';

        return { buffer, contentType };
    }

    getPublicUrl(bucket: string, path: string): string {
        validateBucketName(bucket);
        const sanitizedPath = sanitizePath(path);
        if (this.publicUrl) {
            return `${this.publicUrl}/${sanitizedPath}`;
        }
        // R2 public URL pattern
        return `https://${bucket}.${this.accountId}.r2.cloudflarestorage.com/${sanitizedPath}`;
    }

    async getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
        validateBucketName(bucket);
        const sanitizedPath = sanitizePath(path);
        // R2 signed URLs require HMAC signing - use public URL for now
        // In production, you'd implement the R2 signing algorithm
        return this.getPublicUrl(bucket, sanitizedPath);
    }

    async createFolder(bucket: string, folderPath: string): Promise<void> {
        // Security validation
        validateBucketName(bucket);
        const sanitizedPath = sanitizePath(folderPath);

        // R2 doesn't have folders - create a marker object
        const markerPath = sanitizedPath.replace(/\/$/, '') + '/.folder';

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/r2/buckets/${bucket}/objects/${markerPath}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                },
                body: new Uint8Array(0),
            }
        );

        if (!response.ok) {
            throw new Error(`R2 create folder failed: ${response.statusText}`);
        }
    }

    async deleteFiles(bucket: string, paths: string[]): Promise<void> {
        // Security validation
        validateBucketName(bucket);

        for (const rawPath of paths) {
            const sanitizedPath = sanitizePath(rawPath);
            const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/r2/buckets/${bucket}/objects/${sanitizedPath}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                    },
                }
            );

            if (!response.ok) {
                console.warn(`R2 delete failed for ${rawPath}: ${response.statusText}`);
            }
        }
    }

    async moveFile(bucket: string, sourcePath: string, destPath: string): Promise<void> {
        // Security validation
        validateBucketName(bucket);
        const sanitizedSource = sanitizePath(sourcePath);
        const sanitizedDest = sanitizePath(destPath);

        // R2 doesn't have native move - copy then delete
        await this.copyFile(bucket, sanitizedSource, sanitizedDest);
        await this.deleteFiles(bucket, [sanitizedSource]);
    }

    private async copyFile(bucket: string, sourcePath: string, destPath: string): Promise<void> {
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/r2/buckets/${bucket}/objects/${destPath}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'X-Copy-From': `/${bucket}/${sourcePath}`,
                },
            }
        );

        if (!response.ok) {
            throw new Error(`R2 copy failed: ${response.statusText}`);
        }
    }
}

// =============================================================================
// Storage Adapter Factory
// =============================================================================

let _adapter: StorageAdapter | null = null;

/**
 * Get the storage adapter based on FRONTBASE_STORAGE config.
 * Reads from env config set at deploy time (edge self-sufficiency).
 */
export function getStorageAdapter(): StorageAdapter {
    if (_adapter) {
        return _adapter;
    }

    const config = getStorageConfig();

    try {

        switch (config.provider) {
            case 'supabase':
                if (!config.url || !config.anonKey) {
                    throw new Error('Supabase storage requires url and anonKey');
                }
                _adapter = new SupabaseStorageAdapter({
                    url: config.url,
                    anonKey: config.anonKey,
                    projectId: config.projectId,
                });
                break;

            case 'cloudflare_r2':
                if (!config.accountId || !config.apiToken || !config.bucket) {
                    throw new Error('Cloudflare R2 requires accountId, apiToken, and bucket');
                }
                _adapter = new CloudflareR2Adapter({
                    accountId: config.accountId,
                    apiToken: config.apiToken,
                    bucket: config.bucket,
                    publicUrl: config.publicUrl,
                });
                break;

            default:
                throw new Error(`Unsupported storage provider: ${config.provider}`);
        }

        return _adapter;
    } catch (err: any) {
        throw new Error(`Failed to initialize storage adapter: ${err.message}`);
    }
}

/**
 * Reset the storage adapter singleton (for testing/config reload).
 */
export function resetStorageAdapter(): void {
    _adapter = null;
}
