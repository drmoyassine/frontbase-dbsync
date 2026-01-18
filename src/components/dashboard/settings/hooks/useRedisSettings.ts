/**
 * useRedisSettings Hook
 * 
 * Centralized state management for Redis cache configuration.
 * Used by both Dashboard SettingsPanel and dbsync Module Settings.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, RedisSettings } from '@/modules/dbsync/api';

export interface UseRedisSettingsReturn {
    // State
    redisUrl: string;
    redisToken: string;
    redisType: 'upstash' | 'self-hosted';
    redisEnabled: boolean;
    cacheTtlData: number;
    cacheTtlCount: number;

    // Setters
    setRedisUrl: (url: string) => void;
    setRedisToken: (token: string) => void;
    setRedisType: (type: 'upstash' | 'self-hosted') => void;
    setRedisEnabled: (enabled: boolean) => void;
    setCacheTtlData: (ttl: number) => void;
    setCacheTtlCount: (ttl: number) => void;

    // Status
    isLoading: boolean;
    hasChanges: boolean;
    testResult: { success: boolean; message: string } | null;

    // Actions
    handleChange: () => void;
    save: () => void;
    testConnection: () => void;

    // Mutation states
    isSaving: boolean;
    isTesting: boolean;
    saveSuccess: boolean;
}

export function useRedisSettings(): UseRedisSettingsReturn {
    const queryClient = useQueryClient();

    // State
    const [redisUrl, setRedisUrl] = useState('');
    const [redisToken, setRedisToken] = useState('');
    const [redisType, setRedisType] = useState<'upstash' | 'self-hosted'>('upstash');
    const [redisEnabled, setRedisEnabled] = useState(false);
    const [cacheTtlData, setCacheTtlData] = useState(60);
    const [cacheTtlCount, setCacheTtlCount] = useState(300);
    const [hasChanges, setHasChanges] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // Query
    const { data: settings, isLoading } = useQuery({
        queryKey: ['redisSettings'],
        queryFn: () => settingsApi.getRedis().then(r => r.data),
    });

    // Sync state from server
    useEffect(() => {
        if (settings) {
            setRedisUrl(settings.redis_url || '');
            setRedisToken(settings.redis_token || '');
            setRedisType(settings.redis_type || 'upstash');
            setRedisEnabled(settings.redis_enabled);
            setCacheTtlData(settings.cache_ttl_data);
            setCacheTtlCount(settings.cache_ttl_count);
        }
    }, [settings]);

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: (data: Partial<RedisSettings>) => settingsApi.updateRedis(data).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['redisSettings'] });
            setHasChanges(false);
        },
    });

    // Test mutation
    const testMutation = useMutation({
        mutationFn: (data: Partial<RedisSettings>) => settingsApi.testRedis(data).then(r => r.data),
        onSuccess: (result) => setTestResult(result),
        onError: () => setTestResult({ success: false, message: 'Connection test failed' }),
    });

    // Handlers
    const handleChange = () => {
        setHasChanges(true);
        setTestResult(null);
    };

    const save = () => {
        saveMutation.mutate({
            redis_url: redisUrl || null,
            redis_token: redisToken || null,
            redis_type: redisType,
            redis_enabled: redisEnabled,
            cache_ttl_data: cacheTtlData,
            cache_ttl_count: cacheTtlCount,
        });
    };

    const testConnection = () => {
        testMutation.mutate({
            redis_url: redisUrl,
            redis_token: redisToken,
            redis_type: redisType,
        });
    };

    return {
        // State
        redisUrl,
        redisToken,
        redisType,
        redisEnabled,
        cacheTtlData,
        cacheTtlCount,

        // Setters
        setRedisUrl,
        setRedisToken,
        setRedisType,
        setRedisEnabled,
        setCacheTtlData,
        setCacheTtlCount,

        // Status
        isLoading,
        hasChanges,
        testResult,

        // Actions
        handleChange,
        save,
        testConnection,

        // Mutation states
        isSaving: saveMutation.isPending,
        isTesting: testMutation.isPending,
        saveSuccess: saveMutation.isSuccess && !hasChanges,
    };
}
