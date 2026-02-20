/**
 * useEmailSettings Hook
 * 
 * State management for Email Provider configuration.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/modules/dbsync/api';
import { EmailProviderSettings } from '@/modules/dbsync/types';

export interface UseEmailSettingsReturn {
    // State
    provider: 'smtp' | 'resend' | 'mailgun';
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPassword: string;
    smtpSecure: boolean;
    fromEmail: string;
    fromName: string;

    // Setters
    setProvider: (provider: 'smtp' | 'resend' | 'mailgun') => void;
    setSmtpHost: (host: string) => void;
    setSmtpPort: (port: number) => void;
    setSmtpUser: (user: string) => void;
    setSmtpPassword: (password: string) => void;
    setSmtpSecure: (secure: boolean) => void;
    setFromEmail: (email: string) => void;
    setFromName: (name: string) => void;

    // Status
    isLoading: boolean;
    hasChanges: boolean;

    // Actions
    handleChange: () => void;
    save: () => void;

    // Mutation states
    isSaving: boolean;
    saveSuccess: boolean;
}

export function useEmailSettings(): UseEmailSettingsReturn {
    const queryClient = useQueryClient();

    // State
    const [provider, setProvider] = useState<'smtp' | 'resend' | 'mailgun'>('smtp');
    const [smtpHost, setSmtpHost] = useState('');
    const [smtpPort, setSmtpPort] = useState(587);
    const [smtpUser, setSmtpUser] = useState('');
    const [smtpPassword, setSmtpPassword] = useState('');
    const [smtpSecure, setSmtpSecure] = useState(true);
    const [fromEmail, setFromEmail] = useState('');
    const [fromName, setFromName] = useState('');

    const [hasChanges, setHasChanges] = useState(false);

    // Query
    const { data: settings, isLoading } = useQuery({
        queryKey: ['emailSettings'],
        queryFn: () => settingsApi.getEmail().then(r => r.data),
    });

    // Sync state from server
    useEffect(() => {
        if (settings && !hasChanges) {
            setProvider(settings.provider || 'smtp');
            setSmtpHost(settings.smtp_host || '');
            setSmtpPort(settings.smtp_port || 587);
            setSmtpUser(settings.smtp_user || '');
            setSmtpPassword(settings.smtp_password || '');
            setSmtpSecure(settings.smtp_secure !== false);
            setFromEmail(settings.from_email || '');
            setFromName(settings.from_name || '');
        }
    }, [settings, hasChanges]);

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: (data: EmailProviderSettings) => settingsApi.updateEmail(data).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['emailSettings'] });
            setHasChanges(false);
        },
    });

    // Setters
    const updateState = (updater: Function) => {
        updater();
        setHasChanges(true);
    };

    const handleChange = () => setHasChanges(true);

    const save = () => {
        saveMutation.mutate({
            provider,
            smtp_host: smtpHost,
            smtp_port: smtpPort,
            smtp_user: smtpUser,
            smtp_password: smtpPassword,
            smtp_secure: smtpSecure,
            from_email: fromEmail,
            from_name: fromName,
        });
    };

    return {
        provider,
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPassword,
        smtpSecure,
        fromEmail,
        fromName,

        setProvider: (v) => updateState(() => setProvider(v)),
        setSmtpHost: (v) => updateState(() => setSmtpHost(v)),
        setSmtpPort: (v) => updateState(() => setSmtpPort(v)),
        setSmtpUser: (v) => updateState(() => setSmtpUser(v)),
        setSmtpPassword: (v) => updateState(() => setSmtpPassword(v)),
        setSmtpSecure: (v) => updateState(() => setSmtpSecure(v)),
        setFromEmail: (v) => updateState(() => setFromEmail(v)),
        setFromName: (v) => updateState(() => setFromName(v)),

        isLoading,
        hasChanges,

        handleChange,
        save,

        isSaving: saveMutation.isPending,
        saveSuccess: saveMutation.isSuccess && !hasChanges,
    };
}
