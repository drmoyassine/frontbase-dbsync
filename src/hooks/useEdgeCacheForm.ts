/**
 * useEdgeCacheForm — Form state & CRUD handlers for edge cache create/edit.
 *
 * Extracted from EdgeCachesForm.tsx for single-responsibility compliance.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEdgeCaches, EdgeCache } from '@/hooks/useEdgeInfrastructure';
import { toast } from 'sonner';
import { showTestToast, TestResult } from '@/components/dashboard/settings/shared/edgeTestToast';

const API_BASE = '';

export const CACHE_PROVIDER_OPTIONS = [
    { value: 'upstash', label: 'Upstash Redis', placeholder: 'https://xxx.upstash.io' },
    { value: 'redis', label: 'Self-Hosted Redis', placeholder: 'redis://host:6379' },
    { value: 'dragonfly', label: 'Dragonfly', placeholder: 'redis://host:6379' },
] as const;

export function useEdgeCacheForm() {
    const queryClient = useQueryClient();
    const { data: caches = [], isLoading } = useEdgeCaches();
    const [error, setError] = useState<string | null>(null);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form fields
    const [selectedProvider, setSelectedProvider] = useState<string>('upstash');
    const [formName, setFormName] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formToken, setFormToken] = useState('');
    const [formIsDefault, setFormIsDefault] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Test connection & Delete
    const [testingId, setTestingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const refetchCaches = () => queryClient.invalidateQueries({ queryKey: ['edge-caches'] });

    const resetForm = () => {
        setEditingId(null);
        setSelectedProvider('upstash');
        setFormName('');
        setFormUrl('');
        setFormToken('');
        setFormIsDefault(false);
        setError(null);
    };

    const openCreate = () => {
        resetForm();
        setDialogOpen(true);
    };

    const openEdit = (cache: EdgeCache) => {
        resetForm();
        setEditingId(cache.id);
        setSelectedProvider(cache.provider);
        setFormName(cache.name);
        setFormUrl(cache.cache_url);
        setFormIsDefault(cache.is_default);
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const payload: any = {
                name: formName,
                provider: selectedProvider,
                cache_url: formUrl,
                is_default: formIsDefault,
            };
            if (formToken) payload.cache_token = formToken;

            const url = editingId
                ? `${API_BASE}/api/edge-caches/${editingId}`
                : `${API_BASE}/api/edge-caches/`;
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            setDialogOpen(false);
            resetForm();
            refetchCaches();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/edge-caches/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            refetchCaches();
        } catch (e: any) { setError(e.message); }
        finally { setDeletingId(null); }
    };

    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/edge-caches/${id}/test`, { method: 'POST' });
            const data: TestResult = await res.json();
            const cache = caches.find(c => c.id === id);
            const label = CACHE_PROVIDER_OPTIONS.find(p => p.value === cache?.provider)?.label || 'Cache';
            showTestToast(data, label);
        } catch (e: any) {
            toast.error('Test failed', { description: e.message });
        } finally { setTestingId(null); }
    };

    const handleTestInline = async () => {
        setTestingId('inline');
        try {
            const providerLabel = CACHE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.label || 'Cache';

            if (editingId && !formToken) {
                const res = await fetch(`${API_BASE}/api/edge-caches/${editingId}/test`, { method: 'POST' });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            } else {
                const res = await fetch(`${API_BASE}/api/edge-caches/test-connection`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formName || 'Test',
                        provider: selectedProvider,
                        cache_url: formUrl,
                        cache_token: formToken || null,
                    }),
                });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            }
        } catch (e: any) {
            toast.error('Test failed', { description: e.message });
        } finally { setTestingId(null); }
    };

    return {
        // Data
        caches,
        isLoading,
        error,
        // Dialog state
        dialogOpen,
        setDialogOpen,
        editingId,
        // Form fields
        selectedProvider,
        setSelectedProvider,
        formName,
        setFormName,
        formUrl,
        setFormUrl,
        formToken,
        setFormToken,
        formIsDefault,
        setFormIsDefault,
        isSaving,
        // Actions
        openCreate,
        openEdit,
        resetForm,
        handleSave,
        handleDelete,
        handleTest,
        handleTestInline,
        // Loading states
        testingId,
        deletingId,
    };
}
