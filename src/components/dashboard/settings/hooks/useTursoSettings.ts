/**
 * useTursoSettings Hook
 * 
 * Centralized state management for Turso Edge DB configuration.
 * Mirrors the useRedisSettings pattern.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/modules/dbsync/api';
import type { TursoSettings } from '@/modules/dbsync/types';

export interface UseTursoSettingsReturn {
    // State
    tursoEnabled: boolean;
    tursoUrl: string;
    tursoToken: string;

    // Setters
    setTursoEnabled: (enabled: boolean) => void;
    setTursoUrl: (url: string) => void;
    setTursoToken: (token: string) => void;

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

export function useTursoSettings(): UseTursoSettingsReturn {
    const queryClient = useQueryClient();

    // State
    const [tursoEnabled, setTursoEnabled] = useState(false);
    const [tursoUrl, setTursoUrlState] = useState('');
    const [tursoToken, setTursoTokenState] = useState('');
    const [hasChanges, setHasChanges] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // Query
    const { data: settings, isLoading } = useQuery({
        queryKey: ['tursoSettings'],
        queryFn: () => settingsApi.getTurso().then(r => r.data),
    });

    // Sync state from server
    useEffect(() => {
        if (settings && !hasChanges) {
            setTursoEnabled(settings.turso_enabled);
            setTursoUrlState(settings.turso_url || '');
            setTursoTokenState(settings.turso_token || '');
        }
    }, [settings, hasChanges]);

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: (data: Partial<TursoSettings>) => settingsApi.updateTurso(data).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tursoSettings'] });
            setHasChanges(false);
        },
    });

    // Test mutation
    const testMutation = useMutation({
        mutationFn: (data: Partial<TursoSettings>) => settingsApi.testTurso(data).then(r => r.data),
        onSuccess: (result) => setTestResult(result),
        onError: () => setTestResult({ success: false, message: 'Connection test failed' }),
    });

    // Setters with change tracking
    const setTursoUrl = (url: string) => {
        setTursoUrlState(url);
        setHasChanges(true);
        setTestResult(null);
    };

    const setTursoToken = (token: string) => {
        setTursoTokenState(token);
        setHasChanges(true);
        setTestResult(null);
    };

    const handleSetTursoEnabled = (enabled: boolean) => {
        setTursoEnabled(enabled);
        setHasChanges(true);
    };

    const handleChange = () => {
        setHasChanges(true);
        setTestResult(null);
    };

    const save = () => {
        saveMutation.mutate({
            turso_enabled: tursoEnabled,
            turso_url: tursoUrl || null,
            turso_token: tursoToken || null,
        });
    };

    const testConnection = () => {
        testMutation.mutate({
            turso_url: tursoUrl,
            turso_token: tursoToken,
        });
    };

    return {
        // State
        tursoEnabled,
        tursoUrl,
        tursoToken,

        // Setters
        setTursoEnabled: handleSetTursoEnabled,
        setTursoUrl,
        setTursoToken,

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
