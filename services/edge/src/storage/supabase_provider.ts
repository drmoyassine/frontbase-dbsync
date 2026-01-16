/**
 * Supabase Storage Service
 * 
 * Edge-compatible storage operations using @supabase/supabase-js.
 * Credentials are fetched from the database (configured via Settings UI).
 * 
 * Implements IStorageProvider for seamless integration with other S3-compatible
 * storage providers (AWS S3, Cloudflare R2, MinIO, etc.).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IStorageProvider, StorageFile, StorageBucket, UploadOptions, BucketOptions } from './types';

export interface SupabaseStorageConfig {
  url: string;
  key: string;
  bucket?: string;
}

// Keep legacy interface for backward compatibility
export interface StorageConfig {
  supabaseUrl: string;
  supabaseKey: string;
  bucket?: string;
}

export class SupabaseStorage implements IStorageProvider {
  private client: SupabaseClient;
  private bucket: string;

  constructor(config: StorageConfig | SupabaseStorageConfig) {
    // Support both old and new config formats
    const url = (config as any).supabaseUrl || (config as any).url;
    const key = (config as any).supabaseKey || (config as any).key;
    this.client = createClient(url, key);
    this.bucket = config.bucket || 'uploads';
    console.log('[SUPABASE.TS] Class instance created');
  }

  /**
   * Upload a file to Supabase Storage
   */
  async upload(
    path: string,
    file: File | Blob | ArrayBuffer,
    options?: { contentType?: string; upsert?: boolean; bucket?: string }
  ): Promise<{ path: string; publicUrl: string }> {
    const targetBucket = options?.bucket || this.bucket;
    const { data, error } = await this.client.storage
      .from(targetBucket)
      .upload(path, file, {
        contentType: options?.contentType,
        upsert: options?.upsert ?? false,
      });

    if (error) {
      const err = error as any;
      let msg = error.message;

      // Handle the case where message is literally "{}" or empty (Supabase bug)
      if (!msg || msg === '{}') {
        // Check originalError which contains the actual HTTP Response
        if (err.originalError && typeof err.originalError.status === 'number') {
          const status = err.originalError.status;
          const statusText = err.originalError.statusText || '';

          // Map common HTTP status codes to user-friendly messages
          const statusMessages: Record<number, string> = {
            400: 'Bad request - the file may already exist or be invalid',
            401: 'Authentication failed - please check your credentials',
            403: 'Permission denied - you do not have access to this bucket',
            404: 'Bucket or path not found',
            409: 'The resource already exists',
            413: 'File too large',
            429: 'Too many requests - please try again later',
          };

          msg = statusMessages[status] || `Upload failed: ${status} ${statusText}`.trim();
        } else {
          // Try alternative properties
          msg = err.error_description || err.error || err.code || err.statusText || 'Unknown upload error';
        }
      }

      throw new Error(msg);
    }

    return {
      path: data.path,
      publicUrl: this.getPublicUrl(data.path),
    };
  }

  /**
   * Download a file from Supabase Storage
   */
  async download(path: string, bucket?: string): Promise<Blob> {
    const targetBucket = bucket || this.bucket;
    const { data, error } = await this.client.storage
      .from(targetBucket)
      .download(path);

    if (error) {
      throw new Error(`Storage download failed: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete a file or folder (recursively) from Supabase Storage
   */
  async delete(paths: string | string[], options?: { bucket?: string }): Promise<void> {
    const pathArray = Array.isArray(paths) ? paths : [paths];
    const targetBucket = options?.bucket || this.bucket;

    let allPathsToDelete: string[] = [];

    for (const path of pathArray) {
      // Get all descendants (recursive)
      const descendants = await this.listAllDescendants(targetBucket, path);
      allPathsToDelete.push(...descendants);
      allPathsToDelete.push(path); // The item itself
    }

    // De-duplicate paths
    allPathsToDelete = [...new Set(allPathsToDelete)];

    if (allPathsToDelete.length === 0) return;

    // Delete in chunks of 50 to avoid limits
    const chunkSize = 50;
    for (let i = 0; i < allPathsToDelete.length; i += chunkSize) {
      const chunk = allPathsToDelete.slice(i, i + chunkSize);
      const { error } = await this.client.storage
        .from(targetBucket)
        .remove(chunk);

      if (error) {
        console.error('Supabase delete error details:', JSON.stringify(error, null, 2));
        const err = error as any;
        const msg = err.message || err.error_description || err.error || JSON.stringify(error);
        throw new Error(`Storage delete failed: ${msg}`);
      }
    }
  }

  /**
   * Recursively list all files under a path
   */
  private async listAllDescendants(bucket: string, prefix: string): Promise<string[]> {
    const { data, error } = await this.client.storage.from(bucket).list(prefix);
    if (error || !data) return [];

    let paths: string[] = [];

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      paths.push(fullPath);

      // If it looks like a folder (no metadata often implies folder in Supabase list, 
      // but we should check if we can list it)
      if (!item.metadata) {
        const children = await this.listAllDescendants(bucket, fullPath);
        paths.push(...children);
      }
    }

    return paths;
  }

  /**
   * Calculate total size of a folder recursively
   */
  async getFolderSize(bucket: string, prefix: string): Promise<number> {
    const { data, error } = await this.client.storage.from(bucket).list(prefix);
    if (error || !data) return 0;

    let totalSize = 0;
    const folderPromises: Promise<number>[] = [];

    for (const item of data) {
      if (item.name === '.folder') continue;

      if (item.metadata) {
        // It's a file
        totalSize += item.metadata.size || 0;
      } else {
        // It's a folder - recurse
        const folderPath = prefix ? `${prefix}/${item.name}` : item.name;
        folderPromises.push(this.getFolderSize(bucket, folderPath));
      }
    }

    const subFolderSizes = await Promise.all(folderPromises);
    return totalSize + subFolderSizes.reduce((a, b) => a + b, 0);
  }

  /**
   * List files in a directory
   */
  async list(
    path?: string,
    options?: { limit?: number; offset?: number; bucket?: string; search?: string }
  ): Promise<StorageFile[]> {
    const targetBucket = options?.bucket || this.bucket;
    const { data, error } = await this.client.storage
      .from(targetBucket)
      .list(path || '', {
        limit: options?.limit || 100,
        offset: options?.offset || 0,
        search: options?.search,
      });

    if (error) {
      throw new Error(`Storage list failed: ${error.message}`);
    }

    // Process items and calculate folder sizes
    const items = data.filter((file) => file.name !== '.folder');

    return Promise.all(
      items.map(async (file) => {
        const isFolder = !file.metadata;
        let size = file.metadata?.size || 0;

        if (isFolder) {
          const fullPath = path ? `${path}/${file.name}` : file.name;
          size = await this.getFolderSize(targetBucket, fullPath);
        }

        return {
          name: file.name,
          id: file.id || file.name,
          size: size,
          updated_at: file.updated_at || file.last_accessed_at || file.created_at,
          mimetype: file.metadata?.mimetype,
          metadata: file.metadata,
          isFolder: isFolder,
        };
      })
    );
  }

  /**
   * Create a virtual folder (via placeholder file)
   */
  async createFolder(folderPath: string, bucket: string): Promise<void> {
    const placeholder = new Blob([''], { type: 'application/x-directory' });
    const targetBucket = bucket || this.bucket;
    await this.upload(`${folderPath}/.folder`, placeholder, { bucket: targetBucket });
  }

  /**
   * Generate a signed URL for direct upload (presigned)
   */
  async createSignedUploadUrl(path: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(path);

    if (error) {
      throw new Error(`Signed upload URL failed: ${error.message}`);
    }

    return data.signedUrl;
  }

  /**
   * Generate a signed URL for temporary download access
   */
  async createSignedUrl(path: string, expiresIn: number = 3600, bucket?: string): Promise<string> {
    const targetBucket = bucket || this.bucket;
    const { data, error } = await this.client.storage
      .from(targetBucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      throw new Error(`Signed URL failed: ${error.message}`);
    }

    return data.signedUrl;
  }

  /**
   * Get public URL for a file (bucket must be public)
   */
  getPublicUrl(path: string, bucket?: string): string {
    const targetBucket = bucket || this.bucket;
    const { data } = this.client.storage
      .from(targetBucket)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  /**
   * List all buckets with metadata and calculated total size
   */
  async listBuckets(): Promise<StorageBucket[]> {
    const { data, error } = await this.client.storage.listBuckets();

    if (error) {
      throw new Error(`List buckets failed: ${error.message}`);
    }

    // Calculate sizes for all buckets in parallel
    return Promise.all(data.map(async (bucket) => {
      const size = await this.getFolderSize(bucket.name, '');
      return {
        id: bucket.id,
        name: bucket.name,
        public: bucket.public,
        created_at: bucket.created_at,
        provider: 'Supabase',
        size: size
      };
    }));
  }

  /**
   * Create a new bucket
   */
  async createBucket(
    name: string,
    options?: { public?: boolean; file_size_limit?: number; allowed_mime_types?: string[] }
  ): Promise<{ id: string; name: string }> {
    const { data, error } = await this.client.storage.createBucket(name, {
      public: options?.public ?? false,
      fileSizeLimit: options?.file_size_limit,
      allowedMimeTypes: options?.allowed_mime_types,
    });

    if (error) {
      throw new Error(`Create bucket failed: ${error.message}`);
    }

    return { id: data.name, name: data.name };
  }

  /**
   * Get a bucket
   */
  async getBucket(id: string): Promise<{ id: string; name: string; public: boolean }> {
    const { data, error } = await this.client.storage.getBucket(id);

    if (error) {
      throw new Error(`Get bucket failed: ${error.message}`);
    }

    return {
      id: data.id,
      name: data.name,
      public: data.public,
    };
  }

  /**
   * Update a bucket
   */
  async updateBucket(
    id: string,
    options: { public: boolean; file_size_limit?: number; allowed_mime_types?: string[] }
  ): Promise<{ message: string }> {
    const { data, error } = await this.client.storage.updateBucket(id, {
      public: options.public,
      fileSizeLimit: options.file_size_limit,
      allowedMimeTypes: options.allowed_mime_types,
    });

    if (error) {
      throw new Error(`Update bucket failed: ${error.message}`);
    }

    return { message: data.message };
  }

  /**
   * Delete a bucket
   */
  async deleteBucket(id: string): Promise<{ message: string }> {
    const { data, error } = await this.client.storage.deleteBucket(id);

    if (error) {
      console.error('Supabase deleteBucket error details:', JSON.stringify(error, null, 2));
      const errorStr = JSON.stringify(error);
      const err = error as any;

      let msg = err.message || err.error_description || err.error;

      // Specific handling for the known StorageUnknownError which usually means non-empty bucket
      if (!msg) {
        if (err.name === 'StorageUnknownError' || errorStr.includes('StorageUnknownError')) {
          msg = 'StorageUnknownError: Bucket likely not empty. Please empty it first.';
        } else {
          msg = errorStr;
        }
      }

      throw new Error(`Delete bucket failed: ${msg}`);
    }

    return { message: data.message };
  }

  /**
   * Empty a bucket
   */
  async emptyBucket(id: string): Promise<{ message: string }> {
    const { data, error } = await this.client.storage.emptyBucket(id);

    if (error) {
      console.error('Supabase emptyBucket error:', JSON.stringify(error, null, 2));
      const err = error as any;
      let msg = err.message || err.error_description || err.error;

      if (!msg && err.name) {
        msg = err.name;
        if (err.name === 'StorageUnknownError') {
          msg += '. Potential causes: Network issue or permission error.';
        }
      } else if (!msg) {
        msg = JSON.stringify(error);
      }
      throw new Error(`Empty bucket failed: ${msg}`);
    }

    return { message: data.message };
  }

  /**
   * Move a file (supports cross-bucket by Copy + Delete)
   */
  async move(sourceKey: string, destinationKey: string, options?: { sourceBucket?: string, destBucket?: string }): Promise<{ message: string }> {
    const sBucket = options?.sourceBucket || this.bucket;
    const dBucket = options?.destBucket || sBucket;

    if (sBucket === dBucket) {
      // Same bucket, optimized move
      const { data, error } = await this.client.storage
        .from(sBucket)
        .move(sourceKey, destinationKey);

      if (error) {
        throw new Error(`Move file failed: ${error.message}`);
      }
      return { message: data.message };
    } else {
      // Cross bucket: Copy then Delete
      await this.copy(sourceKey, destinationKey, { sourceBucket: sBucket, destBucket: dBucket });
      await this.delete(sourceKey, { bucket: sBucket });
      return { message: 'Successfully moved across buckets' };
    }
  }

  /**
   * Copy a file
   */
  async copy(sourceKey: string, destinationKey: string, options?: { sourceBucket?: string, destBucket?: string }): Promise<{ message: string }> {
    const sBucket = options?.sourceBucket || this.bucket;
    const dBucket = options?.destBucket || sBucket;

    const { data, error } = await this.client.storage
      .from(sBucket)
      .copy(sourceKey, destinationKey, { destinationBucket: dBucket });

    if (error) {
      throw new Error(`Copy file failed: ${error.message}`);
    }

    return { message: 'Successfully copied' };
  }
}

// Factory function to create storage instance from config
export function createStorage(config: StorageConfig): SupabaseStorage {
  return new SupabaseStorage(config);
}
