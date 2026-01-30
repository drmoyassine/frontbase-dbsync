/**
 * useStorageEnabled Hook
 * 
 * Detects if Supabase storage is connected and provides methods
 * to check bucket status and upload assets.
 */

import { useDashboardStore } from '@/stores/dashboard';
import { useCallback, useState } from 'react';
import api from '@/services/api-service';

interface BucketStatus {
    exists: boolean;
    error?: string;
}

interface UseStorageEnabledResult {
    /** Whether any storage provider is connected */
    isStorageEnabled: boolean;
    /** Type of connected storage (currently only 'supabase') */
    storageType: 'supabase' | null;
    /** Check if a bucket exists */
    checkBucket: (bucketName: string) => Promise<BucketStatus>;
    /** Create a bucket */
    createBucket: (bucketName: string, isPublic?: boolean) => Promise<{ success: boolean; error?: string }>;
    /** Upload a file to storage */
    uploadAsset: (file: File, path: string, bucket?: string) => Promise<{ url: string } | { error: string }>;
    /** Loading state for storage operations */
    isLoading: boolean;
}

const ASSETS_BUCKET = 'frontbase_assets';

export function useStorageEnabled(): UseStorageEnabledResult {
    const { connections } = useDashboardStore();
    const [isLoading, setIsLoading] = useState(false);

    const isStorageEnabled = connections.supabase?.connected ?? false;
    const storageType = isStorageEnabled ? 'supabase' : null;

    const checkBucket = useCallback(async (bucketName: string): Promise<BucketStatus> => {
        if (!isStorageEnabled) {
            return { exists: false, error: 'No storage connected' };
        }

        try {
            // Call Edge API to check bucket
            const response = await api.get(`/api/storage/buckets/${bucketName}`);
            console.log('[useStorageEnabled] Bucket check response:', response.data);
            return { exists: response.data.success === true };
        } catch (error: any) {
            console.log('[useStorageEnabled] Bucket check error:', error.response?.status, error.message);
            // 404 = bucket doesn't exist (expected when needing to create)
            if (error.response?.status === 404) {
                return { exists: false };
            }
            // Any other error - still report bucket doesn't exist but include error
            return { exists: false, error: error.response?.data?.error || error.message || 'Failed to check bucket' };
        }
    }, [isStorageEnabled]);

    const createBucket = useCallback(async (bucketName: string, isPublic = true): Promise<{ success: boolean; error?: string }> => {
        if (!isStorageEnabled) {
            return { success: false, error: 'No storage connected' };
        }

        setIsLoading(true);
        try {
            const response = await api.post('/api/storage/buckets', {
                name: bucketName,
                public: isPublic,
            });
            return { success: response.data.success !== false };
        } catch (error: any) {
            return { success: false, error: error.message || 'Failed to create bucket' };
        } finally {
            setIsLoading(false);
        }
    }, [isStorageEnabled]);

    const uploadAsset = useCallback(async (
        file: File,
        path: string,
        bucket: string = ASSETS_BUCKET
    ): Promise<{ url: string } | { error: string }> => {
        if (!isStorageEnabled) {
            return { error: 'No storage connected' };
        }

        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', path);
            formData.append('bucket', bucket);

            const response = await api.post('/api/storage/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (response.data.publicUrl || response.data.url) {
                return { url: response.data.publicUrl || response.data.url };
            }
            return { error: 'Upload succeeded but no URL returned' };
        } catch (error: any) {
            return { error: error.message || 'Upload failed' };
        } finally {
            setIsLoading(false);
        }
    }, [isStorageEnabled]);

    return {
        isStorageEnabled,
        storageType,
        checkBucket,
        createBucket,
        uploadAsset,
        isLoading,
    };
}

export { ASSETS_BUCKET };
