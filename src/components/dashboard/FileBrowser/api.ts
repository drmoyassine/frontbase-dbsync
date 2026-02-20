// FileBrowser API Functions

import api from '@/services/api-service';
import { Bucket, StorageFile } from './types';

export async function createBucket(
    name: string,
    isPublic: boolean,
    fileSizeLimit?: number,
    allowedMimeTypes?: string[]
) {
    const res = await api.post('/api/storage/buckets', {
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
    id: string,
    isPublic: boolean,
    fileSizeLimit?: number,
    allowedMimeTypes?: string[]
) {
    const res = await api.put(`/api/storage/buckets/${id}`, {
        public: isPublic,
        file_size_limit: fileSizeLimit,
        allowed_mime_types: allowedMimeTypes,
    });
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to update bucket');
    return data;
}

export async function deleteBucket(id: string) {
    const res = await api.delete(`/api/storage/buckets/${id}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to delete bucket');
}

export async function emptyBucket(id: string) {
    const res = await api.post(`/api/storage/buckets/${id}/empty`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to empty bucket');
}

export async function fetchBuckets(): Promise<Bucket[]> {
    const res = await api.get('/api/storage/buckets');
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to fetch buckets');
    return data.buckets;
}

export async function fetchFiles(
    bucket: string,
    path?: string,
    page: number = 0,
    limit: number = 10,
    search?: string
): Promise<StorageFile[]> {
    const params = new URLSearchParams();
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

export async function deleteFile(paths: string[], bucket?: string): Promise<void> {
    const res = await api.delete('/api/storage/delete', {
        data: { paths, bucket },
    });
    const data = res.data;
    if (!data.success) {
        throw new Error(data.error || 'Failed to delete');
    }
}

export async function getSignedUrl(path: string, bucket: string): Promise<string> {
    const params = new URLSearchParams();
    params.set('path', path);
    params.set('bucket', bucket);

    const res = await api.get(`/api/storage/signed-url?${params.toString()}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to get URL');
    return data.signedUrl;
}

export async function uploadFile(
    file: File,
    path?: string,
    bucket?: string
): Promise<{ path: string; publicUrl: string }> {
    const formData = new FormData();
    formData.append('file', file);
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

export async function createFolder(folderPath: string, bucket: string): Promise<void> {
    const res = await api.post('/api/storage/create-folder', { folderPath, bucket });
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to create folder');
}

export async function moveFile(
    sourceKey: string,
    destinationKey: string,
    options?: { sourceBucket?: string; destBucket?: string }
): Promise<void> {
    const res = await api.post('/api/storage/move', {
        sourceKey,
        destinationKey,
        sourceBucket: options?.sourceBucket,
        destBucket: options?.destBucket,
    });
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to move/rename');
}
