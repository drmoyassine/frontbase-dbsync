import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cloud, Server, Rocket, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
    useEdgeEngines,
    useEdgeProviders,
    useEdgeDatabases,
    edgeInfrastructureApi,
    EdgeEngine,
} from '@/hooks/useEdgeInfrastructure';
import { API_BASE, PROVIDER_ICONS } from './edgeConstants';
import { DeleteEngineDialog } from './DeleteEngineDialog';

const Info = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
);

export function EdgeEnginesSection() {
    const { data: engines = [], isLoading: loadingEngines, refetch: refetchEngines } = useEdgeEngines();
    const { data: providers = [] } = useEdgeProviders();
    const [open, setOpen] = useState(false);

    // Memoize to avoid new array ref on every render (AGENTS.md: no unstable deps in useEffect)
    const validProviders = useMemo(
        () => providers.filter(p => p.is_active && p.provider === 'cloudflare'),
        [providers]
    );

    const [isDeploying, setIsDeploying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form
    const [selectedProviderId, setSelectedProviderId] = useState<string>('');
    const [workerName, setWorkerName] = useState('frontbase-edge');
    const { data: edgeDbs = [] } = useEdgeDatabases();
    const [selectedDbId, setSelectedDbId] = useState<string>('default');

    // Auto-select first provider when list loads
    React.useEffect(() => {
        if (validProviders.length > 0 && !selectedProviderId) {
            setSelectedProviderId(validProviders[0].id);
        }
    }, [validProviders, selectedProviderId]);

    // Auto-select default DB when data loads from cache
    React.useEffect(() => {
        if (edgeDbs.length > 0 && selectedDbId === 'default') {
            const def = edgeDbs.find((d: any) => d.is_default);
            if (def) setSelectedDbId(def.id);
        }
    }, [edgeDbs, selectedDbId]);

    const handleDeploy = async () => {
        setIsDeploying(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/cloudflare/deploy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider_id: selectedProviderId,
                    worker_name: workerName,
                    edge_db_id: selectedDbId === 'default' ? undefined : selectedDbId,
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.detail || data.error || 'Deploy failed');
            }
            await refetchEngines();
            setOpen(false);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsDeploying(false);
        }
    };

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
            const isCf = engine.provider === 'cloudflare' || engine.name.toLowerCase().includes('cloudflare');

            // If user opted to also delete from Cloudflare, call teardown first
            if (alsoDeleteRemote && isCf) {
                const workerName = engine.name.replace(/^(Cloudflare|CF):\s*/i, '').trim() || engine.name;

                const fallbackProviderId = providers.find(p => p.is_active && p.provider === 'cloudflare')?.id;
                const teardownProviderId = engine.edge_provider_id || fallbackProviderId;

                if (!teardownProviderId) {
                    throw new Error("No connected Cloudflare Provider account found to perform remote teardown. Please connect an account first.");
                }

                const res = await fetch(`${API_BASE}/api/cloudflare/teardown`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider_id: teardownProviderId,
                        worker_name: workerName,
                    }),
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.detail || data.error || 'Remote teardown failed');
                }
            }
            await edgeInfrastructureApi.deleteEngine(engine.id);
            await refetchEngines();
        } catch (e: any) {
            alert(e.message);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle>Edge Engines</CardTitle>
                    <CardDescription>Deploys of the Unified Runtime Engine across your providers.</CardDescription>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" disabled={validProviders.length === 0}>
                            <Rocket className="w-4 h-4 mr-2" /> Deploy Engine
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Deploy Edge Engine</DialogTitle>
                            <DialogDescription>Deploys the SSR and Workflow runtime to Cloudflare.</DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-2">
                                <Label>Select Provider Account</Label>
                                <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {validProviders.map(p => (
                                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Worker Name</Label>
                                <div className="flex gap-2 items-center">
                                    <Input value={workerName} onChange={e => setWorkerName(e.target.value)} />
                                    <span className="text-sm text-muted-foreground whitespace-nowrap">.workers.dev</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Edge State Database</Label>
                                <Select value={selectedDbId} onValueChange={setSelectedDbId}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="default">Use System Default</SelectItem>
                                        {edgeDbs.map(db => (
                                            <SelectItem key={db.id} value={db.id}>{db.name} ({db.provider})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">The runtime needs a fast database for global state cache.</p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button onClick={handleDeploy} disabled={!selectedProviderId || !workerName || isDeploying}>
                                {isDeploying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
                                Deploy Engine
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {validProviders.length === 0 && engines.length === 0 && (
                    <Alert className="mb-6 bg-blue-500/10 text-blue-500 border-none">
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                            Connect an Edge Provider above to start deploying Edge Engines.
                        </AlertDescription>
                    </Alert>
                )}

                {loadingEngines ? (
                    <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : engines.length === 0 ? (
                    <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                        <Server className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                        <h3 className="text-sm font-medium">No Engines Deployed</h3>
                        <p className="text-sm text-muted-foreground mt-1">Deploy an engine to handle active traffic.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {engines.map(engine => {
                            const Icon = PROVIDER_ICONS[engine.provider] || Server;
                            const providerName = providers.find(p => p.id === engine.edge_provider_id)?.name || engine.provider;
                            return (
                                <div key={engine.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:border-border transition-colors group">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                                            <Icon className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-medium text-sm">{engine.name}</h4>
                                                {engine.is_active ? (
                                                    <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20 text-[10px] h-5 py-0">Active Route</Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="text-[10px] h-5 py-0 bg-muted text-muted-foreground">Paused</Badge>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                                <div className="flex items-center gap-1">
                                                    <Cloud className="w-3 h-3" />
                                                    <span>{providerName}</span>
                                                </div>
                                                <a href={engine.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors">
                                                    <ExternalLink className="w-3 h-3" />
                                                    {engine.url.replace(/^https?:\/\//, '')}
                                                </a>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="flex items-center space-x-2 mr-2">
                                            <Switch
                                                id={`active-${engine.id}`}
                                                checked={engine.is_active}
                                                onCheckedChange={() => handleToggle(engine)}
                                                disabled={engine.is_system}
                                            />
                                        </div>

                                        {!engine.is_system && (
                                            <DeleteEngineDialog
                                                engine={engine}
                                                onDelete={handleDelete}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
