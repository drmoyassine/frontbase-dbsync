import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Cloud, Loader2, Plus, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useEdgeEngines, edgeInfrastructureApi } from '@/hooks/useEdgeInfrastructure';
import { API_BASE } from './edgeConstants';

export function ImportCloudflareWorkers({ providerId }: { providerId: string }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [workers, setWorkers] = useState<any[]>([]);
    const [defaultDbId, setDefaultDbId] = useState<string | undefined>();
    const [error, setError] = useState<string | null>(null);
    const [importingId, setImportingId] = useState<string | null>(null);
    const { refetch } = useEdgeEngines();

    const fetchWorkers = async () => {
        setLoading(true);
        setError(null);
        try {
            // Also fetch default DB in case we want to attach it silently
            const dbRes = await fetch(`${API_BASE}/api/edge-databases/`).catch(() => null);
            if (dbRes && dbRes.ok) {
                const dbs = await dbRes.json();
                const def = dbs.find((d: any) => d.is_default);
                if (def) setDefaultDbId(def.id);
            }

            const res = await fetch(`${API_BASE}/api/cloudflare/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider_id: providerId }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.detail || data.error || 'Failed to fetch workers');
            setWorkers(data.workers || []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async (worker: any) => {
        setImportingId(worker.name);
        try {
            await edgeInfrastructureApi.createEngine({
                name: `Cloudflare: ${worker.name}`,
                provider: 'cloudflare',
                edge_provider_id: providerId,
                adapter_type: 'edge',
                url: worker.url,
                edge_db_id: defaultDbId || undefined,
                engine_config: { worker_name: worker.name },
                is_active: true,
            });
            await refetch();
            setOpen(false);
        } catch (e: any) {
            setError(e.message || 'Import failed');
        } finally {
            setImportingId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) fetchWorkers(); }}>
            <DialogTrigger asChild>
                <Button variant="secondary" size="sm" className="h-8">
                    <Cloud className="w-4 h-4 mr-2 text-muted-foreground" />
                    Fetch Engines
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Import Cloudflare Workers</DialogTitle>
                    <DialogDescription>Select an existing Worker to map as a Frontbase Edge Engine.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    {error && (
                        <Alert variant="destructive" className="py-2 px-3">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="text-sm">{error}</AlertDescription>
                        </Alert>
                    )}
                    {loading ? (
                        <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : workers.length === 0 ? (
                        <p className="text-sm text-center text-muted-foreground py-4">No workers found on this account.</p>
                    ) : (
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                            {workers.map(w => (
                                <div key={w.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-lg bg-card">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium text-sm truncate">{w.name}</div>
                                        <div className="text-xs text-muted-foreground truncate">{w.url}</div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleImport(w)}
                                        disabled={importingId === w.name}
                                        className="shrink-0"
                                    >
                                        {importingId === w.name ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                                        Import
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
