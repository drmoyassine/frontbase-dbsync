/**
 * ReconfigureEngineDialog
 *
 * Gear icon → dialog that lets users reassign the Edge Database and Edge Cache
 * attached to a deployed engine WITHOUT redeploying.
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
import { Settings2, Loader2, Check } from 'lucide-react';
import {
    useEdgeDatabases,
    useEdgeCaches,
    edgeInfrastructureApi,
    EdgeEngine,
} from '@/hooks/useEdgeInfrastructure';

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

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setSelectedDbId(engine.edge_db_id || 'none');
            setSelectedCacheId(engine.edge_cache_id || 'none');
            setSaved(false);
        }
    }, [open, engine.edge_db_id, engine.edge_cache_id]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await edgeInfrastructureApi.updateEngine({
                id: engine.id,
                data: {
                    edge_db_id: selectedDbId === 'none' ? null : selectedDbId,
                    edge_cache_id: selectedCacheId === 'none' ? null : selectedCacheId,
                } as any,
            });
            await queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
            setSaved(true);
            setTimeout(() => setOpen(false), 600);
        } catch (e: any) {
            alert(e.message);
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
                        Change the database and cache attached to this engine without redeploying.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
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
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={!hasChanges || saving || saved}>
                        {saved ? (
                            <><Check className="w-4 h-4 mr-2" /> Saved</>
                        ) : saving ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                        ) : (
                            'Save Changes'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
