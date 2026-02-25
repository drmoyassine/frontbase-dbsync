import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cloud, Server, Globe, Rocket, Plus, Trash2, Check, ExternalLink, Loader2, AlertTriangle, Shield } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
    useEdgeProviders,
    useEdgeEngines,
    edgeInfrastructureApi,
    EdgeProviderAccount,
    EdgeEngine
} from '@/hooks/useEdgeInfrastructure';

const API_BASE = '';

const PROVIDER_ICONS: Record<string, React.FC<any>> = {
    cloudflare: Cloud,
    docker: Server,
    vercel: Globe,
    flyio: Rocket,
};

// ============================================================================
// Edge Providers Section
// ============================================================================

function EdgeProvidersSection() {
    const { data: providers = [], isLoading, refetch } = useEdgeProviders();
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);

    // Form state
    const [providerType, setProviderType] = useState('cloudflare');
    const [apiToken, setApiToken] = useState('');
    const [name, setName] = useState('Cloudflare Account');

    const handleConnect = async () => {
        setIsConnecting(true);
        setError(null);
        try {
            // 1. Create the Provider in the DB
            const newProvider = await edgeInfrastructureApi.createProvider({
                name,
                provider: providerType,
                provider_credentials: { api_token: apiToken },
                is_active: true,
            });

            // 2. Validate token and fetch details via Cloudflare verify endpoint
            const res = await fetch(`${API_BASE}/api/cloudflare/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider_id: newProvider.id }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                // Cleanup invalid provider
                await edgeInfrastructureApi.deleteProvider(newProvider.id);
                throw new Error(data.detail || data.error || 'Invalid API Token');
            }

            // Successfully connected! Update name to include account name if possible
            if (data.account_name) {
                await edgeInfrastructureApi.updateProvider({
                    id: newProvider.id,
                    data: { name: `Cloudflare: ${data.account_name}` }
                });
            }

            await refetch();
            setOpen(false);
            setApiToken('');
            return data.workers; // Returning workers in case we want to show them
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await edgeInfrastructureApi.deleteProvider(id);
            await refetch();
        } catch (e: any) {
            alert(e.message);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle>Edge Providers</CardTitle>
                    <CardDescription>Accounts connected to deploy edge infrastructure.</CardDescription>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Connect Provider</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Connect Edge Provider</DialogTitle>
                            <DialogDescription>Authorize Frontbase to deploy workers on your behalf.</DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                            <div className="space-y-2">
                                <Label>Provider</Label>
                                <Select value={providerType} onValueChange={setProviderType}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cloudflare">Cloudflare Workers</SelectItem>
                                        <SelectItem value="vercel" disabled>Vercel Edge (Coming Soon)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Display Name</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Prod Account" />
                            </div>

                            <div className="space-y-2">
                                <Label>API Token</Label>
                                <div className="space-y-1">
                                    <Input
                                        type="password"
                                        value={apiToken}
                                        onChange={e => setApiToken(e.target.value)}
                                        placeholder="Cloudflare API Token"
                                    />
                                    <p className="text-xs text-muted-foreground flex items-center mt-1">
                                        <Shield className="w-3 h-3 mr-1" />
                                        Requires "Workers Scripts: Edit" and "Account Settings: Read"
                                    </p>
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button onClick={handleConnect} disabled={!apiToken || isConnecting}>
                                {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
                                Authenticate Token
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : providers.length === 0 ? (
                    <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                        <Cloud className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                        <h3 className="text-sm font-medium">No Providers Connected</h3>
                        <p className="text-sm text-muted-foreground mt-1">Connect an account to start deploying.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {providers.map(p => {
                            const Icon = PROVIDER_ICONS[p.provider] || Server;
                            return (
                                <div key={p.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:border-primary/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-medium text-sm">{p.name}</h4>
                                                {p.is_active && <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Connected</Badge>}
                                            </div>
                                            <p className="text-xs text-muted-foreground capitalize mt-0.5">{p.provider}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {p.provider === 'cloudflare' && p.is_active && (
                                            <ImportCloudflareWorkers providerId={p.id} />
                                        )}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Remove Provider?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will remove the credentials from Frontbase. Existing deployed Edge Engines will continue to run, but Frontbase won't be able to update them.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDelete(p.id)} className="bg-destructive hover:bg-destructive/90">
                                                        Remove
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
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

// ============================================================================
// Import Existing Workers
// ============================================================================

function ImportCloudflareWorkers({ providerId }: { providerId: string }) {
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


// ============================================================================
// Edge Engines Section
// ============================================================================

function EdgeEnginesSection() {
    const { data: engines = [], isLoading: loadingEngines, refetch: refetchEngines } = useEdgeEngines();
    const { data: providers = [] } = useEdgeProviders();
    const [open, setOpen] = useState(false);

    // Filter to only connected CF providers
    const validProviders = providers.filter(p => p.is_active && p.provider === 'cloudflare');

    const [isDeploying, setIsDeploying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form
    const [selectedProviderId, setSelectedProviderId] = useState<string>('');
    const [workerName, setWorkerName] = useState('frontbase-edge');
    const [edgeDbs, setEdgeDbs] = useState<any[]>([]);
    const [selectedDbId, setSelectedDbId] = useState<string>('default');

    React.useEffect(() => {
        if (validProviders.length > 0 && !selectedProviderId) {
            setSelectedProviderId(validProviders[0].id);
        }
        // Fetch Edge DBs
        fetch(`${API_BASE}/api/edge-databases/`).then(r => r.json()).then(data => {
            setEdgeDbs(data);
            const def = data.find((d: any) => d.is_default);
            if (def) setSelectedDbId(def.id);
        }).catch(() => { });
    }, [validProviders, selectedProviderId]);

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

// ============================================================================
// Delete Engine Dialog (with remote teardown option)
// ============================================================================

function DeleteEngineDialog({ engine, onDelete }: { engine: EdgeEngine; onDelete: (engine: EdgeEngine, alsoDeleteRemote: boolean) => void }) {
    const [open, setOpen] = useState(false);
    const [deleteRemote, setDeleteRemote] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const isCloudflare = engine.provider === 'cloudflare' || engine.name.toLowerCase().includes('cloudflare');
    const engineDisplayName = engine.name;
    const confirmValid = !deleteRemote || confirmText === engineDisplayName;

    const handleConfirmDelete = async () => {
        setIsDeleting(true);
        try {
            await onDelete(engine, deleteRemote);
            setOpen(false);
        } finally {
            setIsDeleting(false);
            setDeleteRemote(false);
            setConfirmText('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setDeleteRemote(false); setConfirmText(''); } }}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="w-4 h-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Delete Edge Engine?</DialogTitle>
                    <DialogDescription>
                        This removes <span className="font-medium text-foreground">{engineDisplayName}</span> from Frontbase routing.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {isCloudflare && (
                        <div className="rounded-lg border p-4 space-y-3">
                            <div className="flex items-start space-x-3">
                                <Checkbox
                                    id={`delete-remote-${engine.id}`}
                                    checked={deleteRemote}
                                    onCheckedChange={(v) => { setDeleteRemote(!!v); setConfirmText(''); }}
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <label htmlFor={`delete-remote-${engine.id}`} className="text-sm font-medium leading-none cursor-pointer">
                                        Also delete the Worker from Cloudflare
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        Permanently removes the <code className="bg-muted px-1 rounded text-[11px]">{engineDisplayName}</code> script from your account.
                                    </p>
                                </div>
                            </div>

                            {deleteRemote && (
                                <div className="space-y-2 pt-1 pl-7">
                                    <Alert variant="destructive" className="py-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription className="text-xs">
                                            This is <strong>irreversible</strong>. The Worker and all its data will be permanently deleted from Cloudflare.
                                        </AlertDescription>
                                    </Alert>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">
                                            Type <span className="font-mono text-foreground font-medium">{engineDisplayName}</span> to confirm:
                                        </Label>
                                        <Input
                                            value={confirmText}
                                            onChange={(e) => setConfirmText(e.target.value)}
                                            placeholder={engineDisplayName}
                                            className="h-8 text-sm font-mono"
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {!isCloudflare && (
                        <p className="text-sm text-muted-foreground">
                            The engine will be removed from Frontbase. You may need to manually clean up the deployment on your provider's dashboard.
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirmDelete}
                        disabled={!confirmValid || isDeleting}
                    >
                        {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        {deleteRemote ? 'Delete Everywhere' : 'Remove from Frontbase'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const Info = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
);

export const EdgeEnginesPanel: React.FC<{ withCard?: boolean }> = ({ withCard = false }) => {
    return (
        <div className="space-y-6">
            <EdgeProvidersSection />
            <EdgeEnginesSection />
        </div>
    );
};
