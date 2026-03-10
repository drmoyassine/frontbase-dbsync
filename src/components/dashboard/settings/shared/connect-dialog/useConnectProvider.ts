/**
 * useConnectProvider — State and core logic for the ConnectProviderDialog.
 *
 * Extracted from ConnectProviderDialog to keep the orchestrator slim.
 * Provider-specific discovery/save logic is delegated to discovery components.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { edgeInfrastructureApi, useEdgeProviders } from '@/hooks/useEdgeInfrastructure';
import { API_BASE, PROVIDER_CONFIGS } from '../edgeConstants';

// ============================================================================
// Types
// ============================================================================

export interface DiscoveryResult {
    projects?: { ref: string; name: string; region: string; status: string }[];
    neon_orgs?: { id: string; name: string }[];
    neon_projects?: { id: string; name: string; region: string }[];
    db_name?: string;
}

export interface TestResult {
    success: boolean;
    detail: string;
    db_name?: string;
    projects?: DiscoveryResult['projects'];
    neon_orgs?: DiscoveryResult['neon_orgs'];
    neon_projects?: DiscoveryResult['neon_projects'];
}

export interface ConnectProviderState {
    // Data
    providers: any[];
    refetch: () => void;

    // Provider
    providerType: string;
    effectiveProvider: string;
    currentConfig: (typeof PROVIDER_CONFIGS)[keyof typeof PROVIDER_CONFIGS];
    visibleProviders: [string, (typeof PROVIDER_CONFIGS)[keyof typeof PROVIDER_CONFIGS]][];
    handleProviderChange: (value: string) => void;

    // Form
    name: string;
    setName: (name: string) => void;
    credFields: Record<string, string>;
    setCredFields: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    requiredFieldsFilled: boolean;

    // Connection test
    isTesting: boolean;
    testResult: TestResult | null;
    handleTestConnection: () => Promise<TestResult | null>;

    // Save
    isConnecting: boolean;
    setIsConnecting: React.Dispatch<React.SetStateAction<boolean>>;
    error: string | null;
    setError: (error: string | null) => void;
    handleGenericSave: (extraCreds?: Record<string, string>) => Promise<string>;

    // Reset
    resetForm: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useConnectProvider(
    lockedProvider?: string,
    open?: boolean,
) {
    const { data: providers = [], refetch } = useEdgeProviders();

    // Form state
    const [providerType, setProviderType] = useState(lockedProvider || 'cloudflare');
    const [credFields, setCredFields] = useState<Record<string, string>>({});
    const [name, setName] = useState(PROVIDER_CONFIGS[lockedProvider || 'cloudflare']?.defaultName || '');
    const [isConnecting, setIsConnecting] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const effectiveProvider = lockedProvider || providerType;
    const currentConfig = PROVIDER_CONFIGS[effectiveProvider] || PROVIDER_CONFIGS.cloudflare;
    const requiredFieldsFilled = currentConfig.fields.filter(f => f.required).every(f => credFields[f.key]);

    // Determine which providers to show in dropdown
    const visibleProviders = useMemo(() => Object.entries(PROVIDER_CONFIGS), []);

    // Reset form when the dialog opens
    useEffect(() => {
        if (open) {
            setCredFields({});
            setTestResult(null);
            setError(null);
            const cfg = PROVIDER_CONFIGS[lockedProvider || providerType];
            if (cfg) setName(cfg.defaultName);
            if (lockedProvider) setProviderType(lockedProvider);
        }
    }, [open, lockedProvider]);

    const resetForm = useCallback(() => {
        setCredFields({});
        setTestResult(null);
        setError(null);
        setName(PROVIDER_CONFIGS[lockedProvider || 'cloudflare']?.defaultName || '');
        setProviderType(lockedProvider || 'cloudflare');
    }, [lockedProvider]);

    const handleProviderChange = useCallback((value: string) => {
        setProviderType(value);
        setCredFields({});
        setTestResult(null);
        setError(null);
        const cfg = PROVIDER_CONFIGS[value];
        if (cfg) setName(cfg.defaultName);
    }, []);

    // Returns the TestResult so the caller can process discovery data synchronously
    const handleTestConnection = useCallback(async (): Promise<TestResult | null> => {
        setIsTesting(true);
        setTestResult(null);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/edge-providers/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: effectiveProvider, credentials: credFields }),
            });
            const data: TestResult = await res.json();
            setTestResult(data);

            // Auto-name on success (generic — no provider-specific logic here)
            if (data.success && data.detail && effectiveProvider !== 'supabase' && effectiveProvider !== 'neon' && effectiveProvider !== 'turso') {
                const detailName = data.detail.replace(/^Connected (as |to (project: )?)?/, '').replace(/— .*/, '').trim();
                if (detailName) setName(`${currentConfig.label}: ${detailName}`);
            }

            return data;
        } catch (e: any) {
            const failed: TestResult = { success: false, detail: e.message || 'Connection failed' };
            setTestResult(failed);
            return failed;
        } finally {
            setIsTesting(false);
        }
    }, [effectiveProvider, credFields, currentConfig.label]);

    // Generic save — creates a standard provider. Returns the new account ID.
    const handleGenericSave = useCallback(async (extraCreds?: Record<string, string>): Promise<string> => {
        const finalCreds = extraCreds ? { ...credFields, ...extraCreds } : credFields;
        const newProvider = await edgeInfrastructureApi.createProvider({
            name,
            provider: effectiveProvider,
            provider_credentials: finalCreds,
            is_active: true,
        });

        // Cloudflare: auto-detect account_id
        if (effectiveProvider === 'cloudflare') {
            try {
                const res = await fetch(`${API_BASE}/api/cloudflare/connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider_id: newProvider.id }),
                });
                const data = await res.json();
                if (data.success && data.account_name) {
                    await edgeInfrastructureApi.updateProvider({
                        id: newProvider.id,
                        data: { name: `Cloudflare: ${data.account_name}` },
                    });
                }
            } catch { /* non-fatal */ }
        }

        return newProvider.id;
    }, [name, effectiveProvider, credFields]);

    return {
        providers, refetch,
        providerType, effectiveProvider, currentConfig, visibleProviders,
        handleProviderChange,
        name, setName,
        credFields, setCredFields,
        requiredFieldsFilled,
        isTesting, testResult,
        handleTestConnection,
        isConnecting, setIsConnecting,
        error, setError,
        handleGenericSave,
        resetForm,
    } satisfies ConnectProviderState;
}
