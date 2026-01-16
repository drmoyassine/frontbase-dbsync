# Sprint 4: Storage & Cache

## Overview

Integrate Supabase Storage for file handling and Upstash Redis for caching/queues. This enables file uploads in the Builder and improves API performance through caching.

**Estimated Effort:** 2-3 days

---

## Existing Codebase Analysis

> **Note:** The following functionality already exists and should be leveraged/enhanced rather than rebuilt.

### Storage UI (`/storage` route)

**File:** `src/components/dashboard/StoragePanel.tsx`

**Current State:**
- ✅ Route exists at `/storage` in Dashboard
- ✅ Shows Supabase connection status (via `useDashboardStore`)
- ✅ "Storage Enabled" / "Storage Not Configured" badge
- ✅ Placeholder for "Create Bucket" button
- ⚠️ **Missing:** Actual bucket CRUD operations
- ⚠️ **Missing:** File upload/download functionality
- ⚠️ **Missing:** File browser UI

### Redis Configuration (`/settings` route in DBSync)

**File:** `src/modules/dbsync/pages/Settings.tsx`

**Current State:**
- ✅ Full Redis configuration UI
- ✅ Redis URL input with validation
- ✅ "Test Connection" button with success/error feedback
- ✅ "Enable Redis Caching" toggle
- ✅ TTL settings (Data Cache TTL, Count Cache TTL)
- ✅ Save Settings with loading state

### Redis API Endpoints

**File:** `src/modules/dbsync/api/settings.ts`

```typescript
// Existing API calls
settingsApi.getRedis()       // GET /settings/redis
settingsApi.updateRedis(data) // PUT /settings/redis
settingsApi.testRedis(data)   // POST /settings/redis/test
```

### Redis Types

**File:** `src/modules/dbsync/types/index.ts`

```typescript
interface RedisSettings {
  redis_url: string | null;
  redis_enabled: boolean;
  cache_ttl_data: number;
  cache_ttl_count: number;
}

interface RedisTestResult {
  success: boolean;
  message: string;
}
```

### What's Missing (Sprint 4 Focus)

| Area | Missing | Priority |
|------|---------|----------|
| **Storage** | Backend API for Supabase Storage (upload, download, list buckets) | High |
| **Storage** | File browser UI in StoragePanel | High |
| **Storage** | Presigned URL generation for direct uploads | Medium |
| **Redis** | Edge Engine (Hono) caching middleware | High |
| **Redis** | Upstash Redis integration in Edge | High |
| **Redis** | Move Redis config to unified settings (not just DBSync) | Medium |

---

## Architecture

```mermaid
┌─────────────────────────────────────────────────────────────────────┐
│                     STORAGE & CACHE FLOW                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Builder UI ──► Hono Edge ──► Supabase Storage / Upstash Redis      │
│       │              │                   │                          │
│       ▼              ▼                   ▼                          │
│  File Upload    Storage API         Storage Bucket                  │
│  (presigned)    /api/storage        (Supabase)                      │
│       │              │                                               │
│       ▼              ▼                                               │
│  Direct PUT     Cache Middleware                                     │
│  to Supabase    (Redis)                                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Supabase Storage Integration

> **Important:** Supabase Storage uses the **JavaScript client library** (`@supabase/supabase-js`), NOT SQL functions. 
> The `supabase_setup.sql` file does not contain any storage-related functions - storage is handled entirely via the JS SDK.

### Why JS Client?

- Supabase Storage is a **separate service** from PostgreSQL
- Storage operations (upload, download, list) use **REST API**, not SQL
- The JS client provides type-safe methods for all storage operations
- Presigned URLs require the JS client's `createSignedUploadUrl()` method

### Edge Compatibility

✅ **`@supabase/supabase-js` is fully edge-compatible:**
- Uses standard `fetch` API (no Node.js dependencies)
- Works on Cloudflare Workers, Vercel Edge, Deno Deploy
- Cloudflare has native Supabase integration in dashboard

### Future: Multi-Provider Support

> **Post-MVP:** For future multi-provider support (AWS S3, Cloudflare R2, MinIO), consider adding `s3-lite-client`:
>
> ```bash
> npm install s3-lite-client
> ```
>
> | Provider | MVP (Supabase) | Future (s3-lite) |
> |----------|----------------|------------------|
> | Supabase Storage | ✅ `@supabase/supabase-js` | ✅ |
> | Cloudflare R2 | ❌ | ✅ |
> | AWS S3 | ❌ | ✅ |
> | MinIO (self-hosted) | ❌ | ✅ |
>
> This allows a unified storage API that works with any S3-compatible provider.

### Setup

1. Create a storage bucket in Supabase dashboard (or via JS client)
2. Configure bucket policies (public/private) in Supabase dashboard
3. Add environment variables

### Implementation

```typescript
// services/actions/src/storage/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export class SupabaseStorage {
  private bucket = 'uploads';

  async upload(path: string, file: File): Promise<string> {
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .upload(path, file);
    
    if (error) throw error;
    return this.getPublicUrl(data.path);
  }

  async getSignedUploadUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUploadUrl(path);
    
    if (error) throw error;
    return data.signedUrl;
  }

  getPublicUrl(path: string): string {
    const { data } = supabase.storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }
}
```

---

## Upstash Redis Integration

### Setup

1. Create Upstash Redis database
2. Get REST URL and token
3. Add environment variables

### Implementation

```typescript
// services/actions/src/cache/redis.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Caching helper
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = 60
): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached) return cached;

  const result = await fn();
  await redis.setex(key, ttl, result);
  return result;
}

// Queue helper
export async function enqueue(queue: string, data: unknown): Promise<void> {
  await redis.lpush(queue, JSON.stringify(data));
}

export async function dequeue<T>(queue: string): Promise<T | null> {
  const item = await redis.rpop(queue);
  return item ? JSON.parse(item as string) : null;
}
```

---

## Implementation Phases

### Phase 1: Supabase Storage (3 hours)

- [ ] Create `services/actions/src/storage/supabase.ts`
- [ ] Implement upload, download, delete methods
- [ ] Add presigned URL generation
- [ ] Create Hono routes in `src/routes/storage.ts`

### Phase 2: Upstash Redis (2 hours)

- [ ] Install `@upstash/redis`
- [ ] Create `services/actions/src/cache/redis.ts`
- [ ] Implement caching helper functions
- [ ] Add queue support for async operations

### Phase 3: API Integration (2 hours)

- [ ] Create `/api/storage/upload` endpoint
- [ ] Create `/api/storage/presign` endpoint
- [ ] Add caching middleware for expensive API calls
- [ ] Test with Builder UI

### Phase 4: Documentation (1 hour)

- [ ] Document environment variables
- [ ] Add Supabase bucket setup guide
- [ ] Add Upstash Redis setup guide

---

## Configuration (UI-Based)

> **Note:** Credentials are configured via the **Settings UI**, not environment variables. This follows the existing pattern used for Supabase datasource setup.

### Supabase Storage

Already configured when setting up Supabase datasource in the UI. No additional setup needed - storage uses the same credentials.

### Redis/Upstash (Existing UI)

**Location:** `/settings` → Redis Cache Configuration (already exists in `Settings.tsx`)

| Setting | Type | Description |
|---------|------|-------------|
| Redis URL | Input | Upstash REST URL (e.g., `https://xxx.upstash.io`) |
| Enable Redis | Toggle | Turn caching on/off |
| Data Cache TTL | Number | How long to cache record data (seconds) |
| Count Cache TTL | Number | How long to cache counts (seconds) |

### What Needs to Change

The existing Redis UI uses traditional Redis URL format. For **Upstash REST API**, we may need to update the UI to accept:

| Current | Upstash REST |
|---------|--------------|
| `redis://host:port` | `https://xxx.upstash.io` |
| Password in URL | Separate REST Token field |

**Sprint 4 Task:** Update Settings UI to support Upstash REST format (URL + Token).

---

## Acceptance Criteria

- [ ] Can upload files to Supabase Storage via API
- [ ] Can generate presigned URLs for direct client uploads
- [ ] Redis caching reduces repeated API calls
- [ ] Queue operations work for async tasks
- [ ] Works in both Docker and edge deployment

---

## Testing Plan

1. Upload a file via `/api/storage/upload`
2. Get presigned URL via `/api/storage/presign`
3. Upload directly to Supabase using presigned URL
4. Verify file appears in Supabase dashboard
5. Test caching by calling same API twice, verify cache hit
