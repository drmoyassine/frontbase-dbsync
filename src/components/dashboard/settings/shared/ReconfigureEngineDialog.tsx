/**
 * ReconfigureEngineDialog
 *
 * Gear icon → dialog that lets users reassign the Edge Database, Edge Cache,
 * Edge Queue, and AI Models attached to a deployed engine.
 * For CF engines, pushes secrets via Settings API.
 * For other providers, triggers a redeploy to push new secrets.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API_BASE, fetchGPUCatalog, type CatalogModel } from './edgeConstants';
import { useQueryClient } from '@tanstack/react-query';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2, Loader2, Check, AlertTriangle, Search, X, Brain, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    useEdgeDatabases,
    useEdgeCaches,
    useEdgeQueues,
    EdgeEngine,
} from '@/hooks/useEdgeInfrastructure';



interface ReconfigureEngineDialogProps {
    engine: EdgeEngine;
}

export const ReconfigureEngineDialog: React.FC<ReconfigureEngineDialogProps> = ({ engine }) => {
    const queryClient = useQueryClient();
    const { data: edgeDbs = [] } = useEdgeDatabases();
    const { data: edgeCaches = [] } = useEdgeCaches();
    const { data: edgeQueues = [] } = useEdgeQueues();

    const [open, setOpen] = useState(false);
    const [selectedDbId, setSelectedDbId] = useState<string>(engine.edge_db_id || 'none');
    const [selectedCacheId, setSelectedCacheId] = useState<string>(engine.edge_cache_id || 'none');
    const [selectedQueueId, setSelectedQueueId] = useState<string>(engine.edge_queue_id || 'none');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);

    // ── AI Model state ────────────────────────────────────────────────
    const isCF = engine.provider === 'cloudflare';
    const [catalog, setCatalog] = useState<CatalogModel[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogSearch, setCatalogSearch] = useState('');
    const [showCatalog, setShowCatalog] = useState(false);
    // Track models to add / remove
    const [modelsToAdd, setModelsToAdd] = useState<CatalogModel[]>([]);
    const [modelsToRemove, setModelsToRemove] = useState<Set<string>>(new Set()); // IDs of existing models to remove

    const currentModels = engine.gpu_models || [];

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setSelectedDbId(engine.edge_db_id || 'none');
            setSelectedCacheId(engine.edge_cache_id || 'none');
            setSelectedQueueId(engine.edge_queue_id || 'none');
            setSaved(false);
            setError(null);
            setStatusMsg(null);
            setModelsToAdd([]);
            setModelsToRemove(new Set());
            setCatalogSearch('');
            setShowCatalog(false);

            // Fetch catalog for CF engines
            if (isCF && engine.edge_provider_id) {
                setCatalogLoading(true);
                fetchGPUCatalog(engine.edge_provider_id)
                    .then(data => {
                        const all: CatalogModel[] = [];
                        for (const models of Object.values(data.models_by_type)) {
                            all.push(...models);
                        }
                        setCatalog(all);
                    })
                    .catch(() => setCatalog([]))
                    .finally(() => setCatalogLoading(false));
            }
        }
    }, [open, engine.edge_db_id, engine.edge_cache_id, engine.edge_queue_id, engine.edge_provider_id, isCF]);

    // Filtered catalog: exclude already-attached models + models queued to add
    const filteredCatalog = useMemo(() => {
        const existingIds = new Set(currentModels.map(m => m.model_id));
        const pendingIds = new Set(modelsToAdd.map(m => m.model_id));
        return catalog.filter(m => {
            if (existingIds.has(m.model_id) || pendingIds.has(m.model_id)) return false;
            if (catalogSearch) {
                const q = catalogSearch.toLowerCase();
                return m.name.toLowerCase().includes(q) || m.model_id.toLowerCase().includes(q);
            }
            return true;
        });
    }, [catalog, currentModels, modelsToAdd, catalogSearch]);

    const addModel = useCallback((model: CatalogModel) => {
        setModelsToAdd(prev => [...prev, model]);
        setCatalogSearch('');
        setShowCatalog(false);
    }, []);

    const removeAddedModel = useCallback((modelId: string) => {
        setModelsToAdd(prev => prev.filter(m => m.model_id !== modelId));
    }, []);

    const toggleRemoveExisting = useCallback((modelId: string) => {
        setModelsToRemove(prev => {
            const next = new Set(prev);
            if (next.has(modelId)) next.delete(modelId);
            else next.add(modelId);
            return next;
        });
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setStatusMsg(null);
        try {
            // 1. Reconfigure DB/Cache/Queue bindings
            const res = await fetch(`${API_BASE}/api/edge-engines/${engine.id}/reconfigure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    edge_db_id: selectedDbId === 'none' ? null : selectedDbId,
                    edge_cache_id: selectedCacheId === 'none' ? null : selectedCacheId,
                    edge_queue_id: selectedQueueId === 'none' ? null : selectedQueueId,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Reconfigure failed');

            // 2. Remove AI models
            for (const modelId of modelsToRemove) {
                const delRes = await fetch(`${API_BASE}/api/edge-gpu/${modelId}`, { method: 'DELETE' });
                if (!delRes.ok) {
                    const err = await delRes.json().catch(() => ({}));
                    console.warn(`Failed to remove model ${modelId}:`, err.detail);
                }
            }

            // 3. Add new AI models
            for (const model of modelsToAdd) {
                const createRes = await fetch(`${API_BASE}/api/edge-gpu/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: model.name,
                        model_type: model.model_type || 'text-generation',
                        provider: 'workers_ai',
                        model_id: model.model_id,
                        edge_engine_id: engine.id,
                    }),
                });
                if (!createRes.ok) {
                    const err = await createRes.json().catch(() => ({}));
                    console.warn(`Failed to add model ${model.name}:`, err.detail);
                }
            }

            // Build status message
            const parts: string[] = [];
            if (data.settings_patched) {
                parts.push(`Bindings updated (${data.bindings_set?.length || 0} set, ${data.bindings_removed?.length || 0} removed)`);
            } else if (data.bindings_set?.length === 0 && data.bindings_removed?.length === 0) {
                parts.push('Local record updated');
            }
            if (data.cache_flushed) parts.push('Cache flushed ✓');
            if (modelsToRemove.size > 0) parts.push(`${modelsToRemove.size} model(s) removed`);
            if (modelsToAdd.length > 0) parts.push(`${modelsToAdd.length} model(s) added`);
            setStatusMsg(parts.join(' · '));

            await queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
            await queryClient.invalidateQueries({ queryKey: ['edge-inspector'] });
            setSaved(true);
            setTimeout(() => setOpen(false), 1500);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const hasBindingChanges =
        (selectedDbId !== (engine.edge_db_id || 'none')) ||
        (selectedCacheId !== (engine.edge_cache_id || 'none')) ||
        (selectedQueueId !== (engine.edge_queue_id || 'none'));

    const hasModelChanges = modelsToAdd.length > 0 || modelsToRemove.size > 0;
    const hasChanges = hasBindingChanges || hasModelChanges;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title="Reconfigure bindings">
                    <Settings2 className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Reconfigure "{engine.name}"</DialogTitle>
                    <DialogDescription>
                        Change the database, cache, queue, and AI models attached to this engine.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive" className="py-2">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="text-xs">{error}</AlertDescription>
                        </Alert>
                    )}
                    <div className="space-y-2">
                        <Label>Edge State Database</Label>
                        <Select value={selectedDbId} onValueChange={setSelectedDbId}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None (No Database)</SelectItem>
                                {edgeDbs.map((db: any) => (
                                    <SelectItem key={db.id} value={db.id}>
                                        {db.name} ({db.provider})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Edge Cache</Label>
                        <Select value={selectedCacheId} onValueChange={setSelectedCacheId}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {edgeCaches.map(cache => (
                                    <SelectItem key={cache.id} value={cache.id}>
                                        {cache.name} ({cache.provider})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Edge Queue</Label>
                        <Select value={selectedQueueId} onValueChange={setSelectedQueueId}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {edgeQueues.map(queue => (
                                    <SelectItem key={queue.id} value={queue.id}>
                                        {queue.name} ({queue.provider})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* ── AI Models (CF only) ─────────────────────── */}
                    {isCF && (
                        <div className="space-y-2">
                            <Label className="flex items-center gap-1.5">
                                <Brain className="w-3.5 h-3.5 text-purple-400" />
                                AI Models
                            </Label>

                            {/* Current models */}
                            <div className="flex flex-wrap gap-1.5">
                                {currentModels.filter(m => !modelsToRemove.has(m.id)).map(m => (
                                    <Badge
                                        key={m.id}
                                        variant="outline"
                                        className="text-[11px] h-6 gap-1 bg-purple-500/5 border-purple-500/20 text-purple-400 pr-1"
                                    >
                                        {m.name}
                                        <button
                                            onClick={() => toggleRemoveExisting(m.id)}
                                            className="ml-0.5 hover:text-red-400 transition-colors rounded-full p-0.5"
                                            title="Remove model"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                ))}
                                {modelsToAdd.map(m => (
                                    <Badge
                                        key={m.model_id}
                                        variant="outline"
                                        className="text-[11px] h-6 gap-1 bg-green-500/5 border-green-500/20 text-green-400 pr-1"
                                    >
                                        + {m.name}
                                        <button
                                            onClick={() => removeAddedModel(m.model_id)}
                                            className="ml-0.5 hover:text-red-400 transition-colors rounded-full p-0.5"
                                            title="Cancel add"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                ))}
                                {currentModels.filter(m => modelsToRemove.has(m.id)).map(m => (
                                    <Badge
                                        key={m.id}
                                        variant="outline"
                                        className="text-[11px] h-6 gap-1 bg-red-500/5 border-red-500/20 text-red-400 line-through opacity-60 pr-1"
                                    >
                                        {m.name}
                                        <button
                                            onClick={() => toggleRemoveExisting(m.id)}
                                            className="ml-0.5 hover:text-foreground transition-colors rounded-full p-0.5"
                                            title="Undo remove"
                                        >
                                            <Plus className="w-3 h-3 rotate-45" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>

                            {/* Add from catalog */}
                            {!showCatalog ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1.5"
                                    onClick={() => setShowCatalog(true)}
                                    disabled={catalogLoading}
                                >
                                    {catalogLoading ? (
                                        <><Loader2 className="w-3 h-3 animate-spin" /> Loading catalog...</>
                                    ) : (
                                        <><Plus className="w-3 h-3" /> Add Model</>
                                    )}
                                </Button>
                            ) : (
                                <div className="space-y-2 border rounded-md p-2 bg-muted/30">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                        <Input
                                            placeholder="Search Workers AI models..."
                                            value={catalogSearch}
                                            onChange={e => setCatalogSearch(e.target.value)}
                                            className="h-8 pl-8 text-xs"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="max-h-[160px] overflow-y-auto space-y-0.5">
                                        {filteredCatalog.slice(0, 30).map(m => (
                                            <button
                                                key={m.model_id}
                                                onClick={() => addModel(m)}
                                                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center justify-between"
                                            >
                                                <span className="truncate font-medium">{m.name}</span>
                                                <Badge variant="secondary" className="text-[9px] h-4 py-0 ml-2 shrink-0">
                                                    {m.model_type || 'text-generation'}
                                                </Badge>
                                            </button>
                                        ))}
                                        {filteredCatalog.length === 0 && (
                                            <p className="text-xs text-muted-foreground text-center py-2">
                                                {catalogSearch ? 'No matching models' : 'All models already attached'}
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-[10px] w-full"
                                        onClick={() => { setShowCatalog(false); setCatalogSearch(''); }}
                                    >
                                        Close
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {statusMsg && (
                        <p className="text-xs text-green-500 flex items-center gap-1.5">
                            <Check className="w-3 h-3" /> {statusMsg}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={!hasChanges || saving || saved}>
                        {saved ? (
                            <><Check className="w-4 h-4 mr-2" /> Applied</>
                        ) : saving ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Pushing Secrets...</>
                        ) : (
                            'Save & Push'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
