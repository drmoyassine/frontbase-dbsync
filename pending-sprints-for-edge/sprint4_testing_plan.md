# Sprint 4: Storage & Cache - Testing Plan

> **Context for New Session:** This document provides everything needed to test the Sprint 4 implementation in a separate session. Start here before testing.

## Quick Reference

| Service | Default URL |
|---------|-------------|
| Builder UI | http://localhost:5173 |
| Edge Engine | http://localhost:3002 |
| FastAPI Backend | http://localhost:8000 |

---

## Prerequisites

### 1. Environment Variables

The Edge Engine needs Supabase and Upstash credentials. These can be set via:

**Option A: Environment Variables (for testing)**
```bash
# In services/edge/.env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_STORAGE_BUCKET=uploads

UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXXXaaaa...
```

**Option B: Settings UI**
Navigate to `/settings` in the Builder and configure:
- Upstash Redis REST URL
- Upstash Redis REST Token

### 2. Supabase Storage Setup

1. Go to your Supabase dashboard → Storage
2. Create a bucket named `uploads` (or use existing)
3. Set bucket policy (public for testing is easier)

### 3. Upstash Redis Setup (Optional)

1. Create free account at https://upstash.com
2. Create a Redis database
3. Copy the REST URL and REST Token from dashboard

---

## Test Cases

### 1. Storage API - Bucket List

**Endpoint:** `GET /api/storage/buckets`

```bash
curl http://localhost:3002/api/storage/buckets
```

**Expected Response:**
```json
{
  "success": true,
  "buckets": [
    { "id": "uploads", "name": "uploads", "public": true }
  ]
}
```

**If Storage Not Configured:**
```json
{
  "success": false,
  "error": "Storage not configured"
}
```

---

### 2. Storage API - File List

**Endpoint:** `GET /api/storage/list?path=`

```bash
curl "http://localhost:3002/api/storage/list"
curl "http://localhost:3002/api/storage/list?path=avatars"
```

**Expected Response:**
```json
{
  "success": true,
  "files": [
    { "name": "image.png", "id": "123", "size": 12345 }
  ]
}
```

---

### 3. Storage API - File Upload

**Endpoint:** `POST /api/storage/upload`

```bash
curl -X POST http://localhost:3002/api/storage/upload \
  -F "file=@test-image.png" \
  -F "path=uploads/test-image.png"
```

**Expected Response:**
```json
{
  "success": true,
  "path": "uploads/test-image.png",
  "publicUrl": "https://xxx.supabase.co/storage/v1/object/public/uploads/test-image.png"
}
```

---

### 4. Storage API - Presigned Upload URL

**Endpoint:** `POST /api/storage/presign`

```bash
curl -X POST http://localhost:3002/api/storage/presign \
  -H "Content-Type: application/json" \
  -d '{"path": "uploads/new-file.pdf"}'
```

**Expected Response:**
```json
{
  "success": true,
  "signedUrl": "https://xxx.supabase.co/storage/v1/upload/sign/...",
  "path": "uploads/new-file.pdf"
}
```

---

### 5. Storage API - Delete File

**Endpoint:** `DELETE /api/storage/delete`

```bash
curl -X DELETE http://localhost:3002/api/storage/delete \
  -H "Content-Type: application/json" \
  -d '{"paths": ["uploads/test-image.png"]}'
```

**Expected Response:**
```json
{
  "success": true
}
```

---

### 6. Cache API - Test Connection

**Endpoint:** `GET /api/cache/test`

```bash
curl http://localhost:3002/api/cache/test
```

**Expected (Redis Configured):**
```json
{
  "success": true,
  "message": "Redis connection successful"
}
```

**Expected (Redis Not Configured):**
```json
{
  "success": false,
  "message": "Redis not configured"
}
```

---

### 7. Cache API - Stats

**Endpoint:** `GET /api/cache/stats`

```bash
curl http://localhost:3002/api/cache/stats
```

**Expected Response:**
```json
{
  "success": true,
  "configured": true,
  "connected": true,
  "message": "Redis connection successful"
}
```

---

### 8. Builder UI - Settings Page

1. Navigate to `http://localhost:5173/settings`
2. Verify new fields exist:
   - **Upstash Redis REST URL** (placeholder: `https://xxx.upstash.io`)
   - **Upstash Redis REST Token** (password field)
3. Enter Upstash credentials
4. Click "Test Connection" → Should show success
5. Click "Save Changes"

---

### 9. Builder UI - Storage File Browser

1. Navigate to `http://localhost:5173/storage`
2. Verify Supabase connection status badge
3. Click on a bucket → Should list files
4. Click "Upload" → Select a file → Should upload
5. Click file menu (⋮) → "Copy URL" → Should copy signed URL
6. Click file menu (⋮) → "Delete" → Should delete file

---

## Troubleshooting

### "Storage not configured" Error

**Cause:** Missing Supabase credentials.

**Fix:**
1. Check `services/edge/.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
2. Restart Edge Engine: `npm run dev` in `services/edge/`

### "Redis not configured" Error

**Cause:** Missing Upstash credentials.

**Fix:**
1. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `.env`
2. Or configure via Settings UI

### File Browser Shows Empty

**Cause:** No files in bucket or wrong bucket name.

**Fix:**
1. Upload a file via Supabase dashboard first
2. Check bucket name in environment or API response

### CORS Errors

**Cause:** Builder running on different port than Edge.

**Fix:** Edge CORS is configured for `localhost:5173` and `localhost:8000`. Ensure Builder runs on port 5173.

---

## Files Modified in Sprint 4

| File | Purpose |
|------|---------|
| `services/edge/src/storage/supabase.ts` | Supabase Storage client class |
| `services/edge/src/cache/redis.ts` | Upstash Redis caching utilities |
| `services/edge/src/routes/storage.ts` | Storage API routes |
| `services/edge/src/routes/cache.ts` | Cache API routes |
| `services/edge/src/index.ts` | Route registration |
| `services/edge/package.json` | Dependencies added |
| `src/modules/dbsync/types/index.ts` | Added `redis_token` field |
| `src/modules/dbsync/pages/Settings.tsx` | Upstash REST fields |
| `src/components/dashboard/FileBrowser.tsx` | File browser component |
| `src/components/dashboard/StoragePanel.tsx` | Integrated file browser |

---

## Next Steps After Testing

1. **If all tests pass:** Mark Sprint 4 as verified in `progress.md`
2. **If issues found:** Document in this file and fix in next session
3. **Move to Sprint 5:** Automation Engine + Deploy
