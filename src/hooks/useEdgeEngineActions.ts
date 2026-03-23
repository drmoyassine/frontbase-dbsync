/**
 * useEdgeEngineActions — Handler functions for EdgeEnginesSection.
 * 
 * Extracted from EdgeEnginesSection.tsx for single-responsibility compliance.
 * Contains toggle, delete, bulk operations, AI model delete, and time formatting.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    edgeInfrastructureApi,
    EdgeEngine,
} from '@/hooks/useEdgeInfrastructure';
import { API_BASE } from '@/components/dashboard/settings/shared/edgeConstants';
import { toast } from 'sonner';

interface UseEdgeEngineActionsParams {
    providers: any[];
    refetchEngines: () => Promise<any>;
}

export function useEdgeEngineActions({ providers, refetchEngines }: UseEdgeEngineActionsParams) {
    const queryClient = useQueryClient();
    const [error, setError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [redeployingId, setRedeployingId] = useState<string | null>(null);
    const [deletingAIId, setDeletingAIId] = useState<string | null>(null);

    // ── Selection ────────────────────────────────────────────────────────

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = (selectableEngines: EdgeEngine[]) => {
        const allSelected = selectableEngines.length > 0 && selectableEngines.every(e => selectedIds.has(e.id));
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(selectableEngines.map(e => e.id)));
        }
    };

    // ── Single Engine Actions ────────────────────────────────────────────

    const handleToggle = async (engine: EdgeEngine) => {
        try {
            await edgeInfrastructureApi.updateEngine({
                id: engine.id,
                data: { is_active: !engine.is_active }
            });
            await refetchEngines();
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleDelete = async (engine: EdgeEngine, alsoDeleteRemote: boolean) => {
        try {
            await edgeInfrastructureApi.deleteEngine(engine.id, alsoDeleteRemote);
            await refetchEngines();
            // Invalidate resource queries so target counts refresh
            queryClient.invalidateQueries({ queryKey: ['edge-databases'] });
            queryClient.invalidateQueries({ queryKey: ['edge-caches'] });
            queryClient.invalidateQueries({ queryKey: ['edge-queues'] });
        } catch (e: any) {
            alert(e.message);
        }
    };

    // ── Bulk Actions ────────────────────────────────────────────────────

    const handleBulkDelete = async (deleteRemote: boolean) => {
        setBulkLoading(true);
        try {
            const result = await edgeInfrastructureApi.batchDelete([...selectedIds], deleteRemote);
            if (result.failed.length > 0) {
                setError(`${result.success.length} deleted, ${result.failed.length} failed: ${result.failed.map((f: any) => f.error).join(', ')}`);
            }
            setSelectedIds(new Set());
            await refetchEngines();
            // Invalidate resource queries so target counts refresh
            queryClient.invalidateQueries({ queryKey: ['edge-databases'] });
            queryClient.invalidateQueries({ queryKey: ['edge-caches'] });
            queryClient.invalidateQueries({ queryKey: ['edge-queues'] });
        } catch (e: any) { setError(e.message); } finally { setBulkLoading(false); }
    };

    const handleBulkToggle = async (activate: boolean) => {
        setBulkLoading(true);
        try {
            await edgeInfrastructureApi.batchToggle([...selectedIds], activate);
            setSelectedIds(new Set());
            await refetchEngines();
        } catch (e: any) { alert(e.message); } finally { setBulkLoading(false); }
    };

    const handleBulkSyncCheck = async () => {
        setBulkLoading(true);
        try {
            const result = await edgeInfrastructureApi.batchSyncCheck([...selectedIds]);
            if (result.failed.length > 0) {
                alert(`${result.success.length} reachable, ${result.failed.length} unreachable:\n${result.failed.map((f: any) => `${f.id}: ${f.error}`).join('\n')}`);
            }
            await refetchEngines();
        } catch (e: any) { alert(e.message); } finally { setBulkLoading(false); }
    };

    // ── AI Model Delete ────────────────────────────────────────────────

    const handleAIDelete = async (modelId: string) => {
        setDeletingAIId(modelId);
        try {
            const res = await fetch(`${API_BASE}/api/edge-gpu/${modelId}`, { method: 'DELETE' });
            const result = await res.json();
            if (!res.ok) throw new Error(result.detail || 'Delete failed');
            const redeployMsg = result.redeployed ? ' · Engine redeployed ✓' : '';
            toast.success('AI Model Removed', { description: `Deleted${redeployMsg}` });
            queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
            await refetchEngines();
        } catch (err: any) {
            toast.error('Delete Failed', { description: err.message });
        } finally {
            setDeletingAIId(null);
        }
    };

    return {
        // State
        error, setError,
        selectedIds, setSelectedIds,
        bulkLoading,
        bulkDeleteOpen, setBulkDeleteOpen,
        redeployingId, setRedeployingId,
        deletingAIId,

        // Selection
        toggleSelect,
        toggleSelectAll,

        // Actions
        handleToggle,
        handleDelete,
        handleBulkDelete,
        handleBulkToggle,
        handleBulkSyncCheck,
        handleAIDelete,
    };
}


// ── Utilities ──────────────────────────────────────────────────────────

export function timeAgo(iso: string | null | undefined): string {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
