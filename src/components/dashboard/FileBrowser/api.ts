// FileBrowser API Functions

import { EDGE_API } from './constants';
import { Bucket, StorageFile } from './types';

export async function createBucket(
    name: string,
    isPublic: boolean,
    fileSizeLimit?: number,
    allowedMimeTypes?: string[]
) {
    const res = await fetch(`${EDGE_API}/api/storage/buckets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            public: isPublic,
            file_size_limit: fileSizeLimit,
            allowed_mime_types: allowedMimeTypes,
        }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to create bucket');
    return data.bucket;
}

export async function updateBucket(
    id: string,
    isPublic: boolean,
    fileSizeLimit?: number,
    allowedMimeTypes?: string[]
) {
    const res = await fetch(`${EDGE_API}/api/storage/buckets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            public: isPublic,
            file_size_limit: fileSizeLimit,
            allowed_mime_types: allowedMimeTypes,
        }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to update bucket');
    return data;
}

export async function deleteBucket(id: string) {
    const res = await fetch(`${EDGE_API}/api/storage/buckets/${id}`, {
        method: 'DELETE',
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to delete bucket');
}

export async function emptyBucket(id: string) {
    const res = await fetch(`${EDGE_API}/api/storage/buckets/${id}/empty`, {
        method: 'POST',
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to empty bucket');
}

export async function fetchBuckets(): Promise<Bucket[]> {
    const res = await fetch(`${EDGE_API}/api/storage/buckets`);
    const data = await res.json();
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

    const url = `${EDGE_API}/api/storage/list?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch files');
    return data.files;
}

export async function deleteFile(paths: string[], bucket?: string): Promise<void> {
    const res = await fetch(`${EDGE_API}/api/storage/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, bucket }),
    });
    const data = await res.json();
    if (!data.success) {
        throw new Error(data.error || 'Failed to delete');
    }
}

export async function getSignedUrl(path: string, bucket: string): Promise<string> {
    const params = new URLSearchParams();
    params.set('path', path);
    params.set('bucket', bucket);

    const res = await fetch(`${EDGE_API}/api/storage/signed-url?${params.toString()}`);
    const data = await res.json();
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

    const res = await fetch(`${EDGE_API}/api/storage/upload`, {
        method: 'POST',
        body: formData,
    });

    // Handle non-JSON responses (like 413 Payload Too Large)
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
        const text = await res.text();
        throw new Error(text || `Upload failed with status ${res.status}`);
    }

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to upload');
    return { path: data.path, publicUrl: data.publicUrl };
}

export async function createFolder(folderPath: string, bucket: string): Promise<void> {
    const res = await fetch(`${EDGE_API}/api/storage/create-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath, bucket }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to create folder');
}

export async function moveFile(
    sourceKey: string,
    destinationKey: string,
    options?: { sourceBucket?: string; destBucket?: string }
): Promise<void> {
    const res = await fetch(`${EDGE_API}/api/storage/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sourceKey,
            destinationKey,
            sourceBucket: options?.sourceBucket,
            destBucket: options?.destBucket,
        }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to move/rename');
}
