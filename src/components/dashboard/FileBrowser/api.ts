// FileBrowser API Functions — all scoped by storageProviderId

import api from '@/services/api-service';
import { Bucket, StorageFile } from './types';

// ── Lazy size computation (non-blocking) ──────────────────────────────
export async function computeSize(
    providerId: string,
    bucket: string,
    path: string = '',
): Promise<number> {
    const params = new URLSearchParams();
    params.set('provider_id', providerId);
    params.set('bucket', bucket);
    if (path) params.set('path', path);
    const res = await api.get(`/api/storage/compute-size?${params.toString()}`);
    return res.data.size ?? 0;
}

export async function createBucket(
    providerId: string,
    name: string,
    isPublic: boolean,
    fileSizeLimit?: number,
    allowedMimeTypes?: string[]
) {
    const res = await api.post(`/api/storage/buckets?provider_id=${providerId}`, {
        name,
        public: isPublic,
        file_size_limit: fileSizeLimit,
        allowed_mime_types: allowedMimeTypes,
    });
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to create bucket');
    return data.bucket;
}

export async function updateBucket(
    providerId: string,
    id: string,
    isPublic: boolean,
    fileSizeLimit?: number,
    allowedMimeTypes?: string[]
) {
    const res = await api.put(`/api/storage/buckets/${id}?provider_id=${providerId}`, {
        public: isPublic,
        file_size_limit: fileSizeLimit,
        allowed_mime_types: allowedMimeTypes,
    });
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to update bucket');
    return data;
}

export async function deleteBucket(providerId: string, id: string) {
    const res = await api.delete(`/api/storage/buckets/${id}?provider_id=${providerId}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to delete bucket');
}

export async function emptyBucket(providerId: string, id: string) {
    const res = await api.post(`/api/storage/buckets/${id}/empty?provider_id=${providerId}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to empty bucket');
}

export interface FetchBucketsResult {
    buckets: Bucket[];
    permissionWarning?: string;
}

export async function fetchBuckets(providerId: string): Promise<FetchBucketsResult> {
    const res = await api.get(`/api/storage/buckets?provider_id=${providerId}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to fetch buckets');
    return {
        buckets: data.buckets,
        permissionWarning: data.permission_warning,
    };
}

export async function fetchFiles(
    providerId: string,
    bucket: string,
    path?: string,
    page: number = 0,
    limit: number = 10,
    search?: string
): Promise<StorageFile[]> {
    const params = new URLSearchParams();
    params.set('provider_id', providerId);
    params.set('bucket', bucket);
    if (path) params.set('path', path);
    params.set('limit', limit.toString());
    params.set('offset', (page * limit).toString());
    if (search) params.set('search', search);

    const res = await api.get(`/api/storage/list?${params.toString()}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to fetch files');
    return data.files;
}

export async function deleteFile(providerId: string, paths: string[], bucket?: string): Promise<void> {
    const res = await api.delete('/api/storage/delete', {
        data: { paths, bucket, provider_id: providerId },
    });
    const data = res.data;
    if (!data.success) {
        throw new Error(data.error || 'Failed to delete');
    }
}

export async function getSignedUrl(providerId: string, path: string, bucket: string): Promise<string> {
    const params = new URLSearchParams();
    params.set('provider_id', providerId);
    params.set('path', path);
    params.set('bucket', bucket);

    const res = await api.get(`/api/storage/signed-url?${params.toString()}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to get URL');
    return data.signedUrl;
}

export async function getPublicUrl(providerId: string, path: string, bucket: string): Promise<string> {
    const params = new URLSearchParams();
    params.set('provider_id', providerId);
    params.set('path', path);
    params.set('bucket', bucket);

    const res = await api.get(`/api/storage/public-url?${params.toString()}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to get URL');
    return data.publicUrl;
}

export async function uploadFile(
    providerId: string,
    file: File,
    path?: string,
    bucket?: string
): Promise<{ path: string; publicUrl: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('provider_id', providerId);
    if (path) formData.append('path', path);
    if (bucket) formData.append('bucket', bucket);

    const res = await api.post('/api/storage/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });

    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to upload');
    return { path: data.path, publicUrl: data.publicUrl };
}

export async function createFolder(providerId: string, folderPath: string, bucket: string): Promise<void> {
    const res = await api.post('/api/storage/create-folder', { folderPath, bucket, provider_id: providerId });
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to create folder');
}

export async function moveFile(
    providerId: string,
    sourceKey: string,
    destinationKey: string,
    options?: { sourceBucket?: string; destBucket?: string }
): Promise<void> {
    const res = await api.post('/api/storage/move', {
        sourceKey,
        destinationKey,
        sourceBucket: options?.sourceBucket,
        destBucket: options?.destBucket,
        provider_id: providerId,
    });
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to move/rename');
}
