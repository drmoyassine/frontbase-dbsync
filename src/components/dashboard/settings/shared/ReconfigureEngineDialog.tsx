/**
 * ReconfigureEngineDialog
 *
 * Gear icon → dialog that lets users reassign the Edge Database and Edge Cache
 * attached to a deployed engine. Pushes secrets to Cloudflare and flushes target cache.
 */

import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2, Loader2, Check, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    useEdgeDatabases,
    useEdgeCaches,
    EdgeEngine,
} from '@/hooks/useEdgeInfrastructure';

const API_BASE = `http://localhost:${import.meta.env.VITE_API_PORT || 8000}`;

interface ReconfigureEngineDialogProps {
    engine: EdgeEngine;
}

export const ReconfigureEngineDialog: React.FC<ReconfigureEngineDialogProps> = ({ engine }) => {
    const queryClient = useQueryClient();
    const { data: edgeDbs = [] } = useEdgeDatabases();
    const { data: edgeCaches = [] } = useEdgeCaches();

    const [open, setOpen] = useState(false);
    const [selectedDbId, setSelectedDbId] = useState<string>(engine.edge_db_id || 'none');
    const [selectedCacheId, setSelectedCacheId] = useState<string>(engine.edge_cache_id || 'none');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setSelectedDbId(engine.edge_db_id || 'none');
            setSelectedCacheId(engine.edge_cache_id || 'none');
            setSaved(false);
            setError(null);
            setStatusMsg(null);
        }
    }, [open, engine.edge_db_id, engine.edge_cache_id]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setStatusMsg(null);
        try {
            const res = await fetch(`${API_BASE}/api/edge-engines/${engine.id}/reconfigure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    edge_db_id: selectedDbId === 'none' ? null : selectedDbId,
                    edge_cache_id: selectedCacheId === 'none' ? null : selectedCacheId,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Reconfigure failed');

            // Build status message
            const parts: string[] = [];
            if (data.settings_patched) {
                parts.push(`Bindings updated (${data.bindings_set?.length || 0} set, ${data.bindings_removed?.length || 0} removed)`);
            } else if (data.bindings_set?.length === 0 && data.bindings_removed?.length === 0) {
                parts.push('Local record updated (no remote push — non-Cloudflare engine)');
            }
            if (data.cache_flushed) {
                parts.push('Cache flushed ✓');
            }
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

    const hasChanges =
        (selectedDbId !== (engine.edge_db_id || 'none')) ||
        (selectedCacheId !== (engine.edge_cache_id || 'none'));

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title="Reconfigure bindings">
                    <Settings2 className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>Reconfigure "{engine.name}"</DialogTitle>
                    <DialogDescription>
                        Change the database and cache attached to this engine. Secrets will be pushed to the remote Worker and its cache will be flushed.
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
