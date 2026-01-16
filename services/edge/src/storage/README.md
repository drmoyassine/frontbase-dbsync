# Storage Provider System

## Architecture Overview

This module implements a provider abstraction layer enabling seamless integration of multiple S3-compatible storage backends.

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (UI)                        │
│                  FileBrowser.tsx                        │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP API
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  Routes (storage.ts)                    │
│            Uses createStorageProvider()                 │
└─────────────────────┬───────────────────────────────────┘
                      │ IStorageProvider
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   Factory (index.ts)                    │
│          createStorageProvider(config)                  │
└────┬────────────────┬────────────────┬──────────────────┘
     │                │                │
     ▼                ▼                ▼
┌─────────┐    ┌───────────┐    ┌───────────┐
│Supabase │    │  AWS S3   │    │Cloudflare │
│ Storage │    │ (future)  │    │R2 (future)│
└─────────┘    └───────────┘    └───────────┘
```

---

## Files

| File | Purpose |
|------|---------|
| `types.ts` | `IStorageProvider` interface and shared types |
| `supabase.ts` | Supabase implementation |
| `index.ts` | Factory function and exports |
| `s3-generic.ts` | (Future) Generic S3 implementation |

---

## Adding a New Provider

### Step 1: Create Provider Class

```typescript
// s3-generic.ts
import { Client } from '@bradenmacdonald/s3-lite-client';
import {
    IStorageProvider,
    StorageFile,
    StorageBucket,
    UploadOptions,
    ListOptions,
    MoveOptions,
    CopyOptions,
    BucketOptions,
} from './types';

export interface S3GenericConfig {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    region?: string;
    bucket?: string;
}

export class S3GenericStorage implements IStorageProvider {
    private client: Client;
    private defaultBucket: string;

    constructor(config: S3GenericConfig) {
        this.client = new Client({
            endPoint: config.endpoint,
            accessKey: config.accessKeyId,
            secretKey: config.secretAccessKey,
            region: config.region,
        });
        this.defaultBucket = config.bucket || 'default';
    }

    // Implement all IStorageProvider methods...
    // See supabase.ts for reference implementation
}
```

### Step 2: Update Factory

```typescript
// index.ts
import { S3GenericStorage } from './s3-generic';

export function createStorageProvider(config: StorageConfig): IStorageProvider {
    switch (config.type) {
        case 'supabase':
            return new SupabaseStorage({ ... });
        
        case 'aws-s3':
        case 'cloudflare-r2':
        case 'minio':
        case 'backblaze-b2':
            return new S3GenericStorage({
                endpoint: config.endpoint!,
                accessKeyId: config.accessKeyId!,
                secretAccessKey: config.secretAccessKey!,
                region: config.region,
                bucket: config.bucket,
            });
        
        default:
            return new SupabaseStorage({ ... });
    }
}
```

### Step 3: Update StorageConfig (if needed)

```typescript
// types.ts
export interface StorageConfig {
    type: 'supabase' | 'aws-s3' | 'cloudflare-r2' | 'minio' | 'backblaze-b2';
    // Common
    bucket?: string;
    // Supabase-specific
    url?: string;
    key?: string;
    // S3-compatible
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
}
```

---

## IStorageProvider Interface

### File Operations

| Method | Signature | Description |
|--------|-----------|-------------|
| `upload` | `(path, file, options?) => Promise<{path, publicUrl?}>` | Upload file |
| `download` | `(path, bucket?) => Promise<Blob\|Buffer>` | Download file |
| `delete` | `(paths, options?) => Promise<void>` | Delete file(s) |
| `list` | `(path?, options?) => Promise<StorageFile[]>` | List files |
| `move` | `(source, dest, options?) => Promise<{message}>` | Move file |
| `copy` | `(source, dest, options?) => Promise<{message}>` | Copy file |

### URL Operations

| Method | Signature | Description |
|--------|-----------|-------------|
| `createSignedUrl` | `(path, expiresIn?, bucket?) => Promise<string>` | Temporary URL |
| `getPublicUrl` | `(path, bucket?) => string` | Public URL |

### Bucket Operations

| Method | Signature | Description |
|--------|-----------|-------------|
| `listBuckets` | `() => Promise<StorageBucket[]>` | List all buckets |
| `createBucket` | `(name, options?) => Promise<{id, name}>` | Create bucket |
| `getBucket` | `(id) => Promise<Partial<StorageBucket>>` | Get bucket info |
| `updateBucket` | `(id, options) => Promise<{message}>` | Update settings |
| `deleteBucket` | `(id) => Promise<{message}>` | Delete bucket |
| `emptyBucket` | `(id) => Promise<{message}>` | Empty bucket |

### Folder Operations (Optional)

| Method | Signature | Description |
|--------|-----------|-------------|
| `createFolder` | `(path, bucket) => Promise<void>` | Create virtual folder |
| `getFolderSize` | `(path, bucket) => Promise<number>` | Recursive size |

---

## Provider-Specific Notes

### Supabase
- Uses `@supabase/supabase-js` SDK
- Folders are virtual (`.folder` placeholders)
- Cross-bucket move = copy + delete

### AWS S3 / Generic S3
- Recommended: `@bradenmacdonald/s3-lite-client` (21kB, no deps)
- Alternative: `@litejs/s3` (dependency-free)
- Buckets may need to be pre-created

### Cloudflare R2
- S3-compatible API
- Use account ID in endpoint: `https://{accountId}.r2.cloudflarestorage.com`
- No egress fees

### MinIO
- Self-hosted S3-compatible storage
- Full S3 API compatibility

---

## Testing New Providers

1. **Unit Tests**: Test each method in isolation
2. **Integration**: Use the File Browser UI
3. **Cross-bucket ops**: Test move between buckets
4. **Large files**: Test multipart upload if supported

```typescript
// Example test
const storage = createStorageProvider({
    type: 'cloudflare-r2',
    endpoint: 'https://xxx.r2.cloudflarestorage.com',
    accessKeyId: 'xxx',
    secretAccessKey: 'xxx',
    bucket: 'test-bucket',
});

const buckets = await storage.listBuckets();
console.log(buckets); // Should return StorageBucket[]
```
