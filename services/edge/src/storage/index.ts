// Storage Provider Factory
// Provides a unified interface for all storage providers

import { SupabaseStorage, SupabaseStorageConfig, StorageConfig as LegacyConfig } from './supabase_provider';
import { IStorageProvider, StorageConfig } from './types';

/**
 * Creates a storage provider instance based on the configuration type.
 * 
 * This factory abstracts provider implementation details, allowing routes
 * to work with any S3-compatible storage provider via the IStorageProvider interface.
 * 
 * @example
 * ```typescript
 * const storage = createStorageProvider({ type: 'supabase', url: '...', key: '...' });
 * const buckets = await storage.listBuckets();
 * ```
 */
export function createStorageProvider(config: StorageConfig): IStorageProvider {
    switch (config.type) {
        case 'supabase':
        default:
            return new SupabaseStorage({
                url: config.url!,
                key: config.key!,
                bucket: config.bucket,
            });

        // Future S3-compatible providers:
        // case 'aws-s3':
        // case 'cloudflare-r2':
        // case 'minio':
        // case 'backblaze-b2':
        //     return new S3GenericStorage(config);
    }
}

// Re-export for convenience
export { SupabaseStorage } from './supabase_provider';
export type { IStorageProvider, StorageConfig } from './types';


