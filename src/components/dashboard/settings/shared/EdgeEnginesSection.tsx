import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cloud, Server, Rocket, ExternalLink, Loader2, AlertTriangle, Cpu, Layers, Search, Trash2, Power, RefreshCw, CheckSquare } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
    useEdgeEngines,
    useEdgeProviders,
    useEdgeDatabases,
    useEdgeCaches,
    edgeInfrastructureApi,
    EdgeEngine,
} from '@/hooks/useEdgeInfrastructure';
import { API_BASE, PROVIDER_ICONS } from './edgeConstants';
import { DeleteEngineDialog } from './DeleteEngineDialog';
import { ReconfigureEngineDialog } from './ReconfigureEngineDialog';
import { EdgeInspectorDialog } from './EdgeInspectorDialog';
import { BulkDeleteDialog } from './BulkDeleteDialog';

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
    const { data: edgeCaches = [] } = useEdgeCaches();
    const [selectedDbId, setSelectedDbId] = useState<string>('default');
    const [selectedCacheId, setSelectedCacheId] = useState<string>('none');
    const [engineType, setEngineType] = useState<'lite' | 'full'>('lite');

    // ── Search, filters, selection ───────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [filterProvider, setFilterProvider] = useState<string>('all');
    const [filterBundle, setFilterBundle] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    // ── Filtered engines ────────────────────────────────────────────────
    const filteredEngines = useMemo(() => {
        return engines.filter(e => {
            // Search
            if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            // Provider
            if (filterProvider !== 'all' && e.provider !== filterProvider) return false;
            // Bundle
            if (filterBundle !== 'all') {
                const isLite = e.adapter_type === 'automations' || e.adapter_type === 'edge';
                if (filterBundle === 'lite' && !isLite) return false;
                if (filterBundle === 'full' && isLite) return false;
            }
            // Status
            if (filterStatus === 'active' && !e.is_active) return false;
            if (filterStatus === 'inactive' && e.is_active) return false;
            return true;
        });
    }, [engines, searchQuery, filterProvider, filterBundle, filterStatus]);

    // Distinct providers for filter dropdown
    const providerOptions = useMemo(
        () => [...new Set(engines.map(e => e.provider).filter(Boolean))],
        [engines]
    );

    const selectableEngines = filteredEngines.filter(e => !e.is_system);
    const allSelected = selectableEngines.length > 0 && selectableEngines.every(e => selectedIds.has(e.id));

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(selectableEngines.map(e => e.id)));
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

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

    // Cache is optional — no auto-select. User explicitly picks one if needed.

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
                    adapter_type: engineType === 'full' ? 'full' : 'automations',
                    edge_db_id: selectedDbId === 'none' ? '__none__' : selectedDbId === 'default' ? undefined : selectedDbId,
                    edge_cache_id: selectedCacheId === 'none' ? '__none__' : selectedCacheId,
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

    // ── Bulk Action Handlers ─────────────────────────────────────────────
    const handleBulkDelete = async (deleteRemote: boolean) => {
        setBulkLoading(true);
        try {
            const result = await edgeInfrastructureApi.batchDelete([...selectedIds], deleteRemote);
            if (result.failed.length > 0) {
                setError(`${result.success.length} deleted, ${result.failed.length} failed: ${result.failed.map(f => f.error).join(', ')}`);
            }
            setSelectedIds(new Set());
            await refetchEngines();
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
                alert(`${result.success.length} reachable, ${result.failed.length} unreachable:\n${result.failed.map(f => `${f.id}: ${f.error}`).join('\n')}`);
            }
            await refetchEngines();
        } catch (e: any) { alert(e.message); } finally { setBulkLoading(false); }
    };

    // ── Relative time helper ──────────────────────────────────────────────
    const timeAgo = (iso: string | null | undefined): string => {
        if (!iso) return 'Never';
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
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
                                <Label>Engine Type</Label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setEngineType('lite')}
                                        className={`relative flex flex-col items-start gap-1.5 rounded-lg border-2 p-3 text-left transition-all ${engineType === 'lite'
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-muted-foreground/50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Cpu className="w-4 h-4 text-blue-500" />
                                            <span className="font-medium text-sm">Lite</span>
                                            <Badge variant="secondary" className="text-[10px] h-4 py-0 bg-blue-500/10 text-blue-500">~880 KB</Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-tight">
                                            Automations, webhooks, workflows, LiquidJS templates, API gateway. No page rendering.
                                        </p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEngineType('full')}
                                        className={`relative flex flex-col items-start gap-1.5 rounded-lg border-2 p-3 text-left transition-all ${engineType === 'full'
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-muted-foreground/50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Layers className="w-4 h-4 text-purple-500" />
                                            <span className="font-medium text-sm">Full</span>
                                            <Badge variant="secondary" className="text-[10px] h-4 py-0 bg-purple-500/10 text-purple-500">~2.2 MB</Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-tight">
                                            Everything in Lite + SSR pages, React rendering, component library, data routes.
                                        </p>
                                    </button>
                                </div>
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
                                        <SelectItem value="none">None (No Database)</SelectItem>
                                        <SelectItem value="default">Use System Default</SelectItem>
                                        {edgeDbs.map(db => (
                                            <SelectItem key={db.id} value={db.id}>{db.name} ({db.provider})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">The runtime needs a fast database for global state cache.</p>
                            </div>

                            <div className="space-y-2">
                                <Label>Edge Cache</Label>
                                <Select value={selectedCacheId} onValueChange={setSelectedCacheId}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {edgeCaches.map(cache => (
                                            <SelectItem key={cache.id} value={cache.id}>{cache.name} ({cache.provider})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Optional caching layer (Upstash, Redis) for faster page loads.</p>
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
                    <>
                        {/* ── Search & Filter Toolbar ─────────────────── */}
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <Input
                                    placeholder="Search engines..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="h-8 pl-8 text-xs"
                                />
                            </div>
                            <Select value={filterProvider} onValueChange={setFilterProvider}>
                                <SelectTrigger className="h-8 w-[130px] text-xs">
                                    <SelectValue placeholder="Provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Providers</SelectItem>
                                    {providerOptions.map(p => (
                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={filterBundle} onValueChange={setFilterBundle}>
                                <SelectTrigger className="h-8 w-[110px] text-xs">
                                    <SelectValue placeholder="Bundle" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Bundles</SelectItem>
                                    <SelectItem value="lite">Lite</SelectItem>
                                    <SelectItem value="full">Full</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger className="h-8 w-[110px] text-xs">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* ── Bulk Action Bar ─────────────────────────── */}
                        <div className="flex items-center gap-2 mb-3">
                            <Checkbox
                                id="select-all-engines"
                                checked={allSelected}
                                onCheckedChange={toggleSelectAll}
                                disabled={selectableEngines.length === 0}
                            />
                            <label htmlFor="select-all-engines" className="text-xs text-muted-foreground cursor-pointer">
                                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                            </label>
                            {selectedIds.size > 0 && (
                                <div className="flex items-center gap-1.5 ml-auto">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1.5"
                                        onClick={handleBulkSyncCheck}
                                        disabled={bulkLoading}
                                    >
                                        <RefreshCw className="w-3 h-3" /> Sync Check
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1.5"
                                        onClick={() => handleBulkToggle(true)}
                                        disabled={bulkLoading}
                                    >
                                        <Power className="w-3 h-3" /> Enable
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1.5"
                                        onClick={() => handleBulkToggle(false)}
                                        disabled={bulkLoading}
                                    >
                                        <Power className="w-3 h-3" /> Disable
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        className="h-7 text-xs gap-1.5"
                                        onClick={() => setBulkDeleteOpen(true)}
                                        disabled={bulkLoading}
                                    >
                                        <Trash2 className="w-3 h-3" /> Delete
                                    </Button>
                                </div>
                            )}
                        </div>

                        {filteredEngines.length === 0 ? (
                            <div className="text-center p-6 text-sm text-muted-foreground">No engines match your filters.</div>
                        ) : (
                            <div className="space-y-3">
                                {filteredEngines.map(engine => {
                                    const Icon = PROVIDER_ICONS[engine.provider] || Server;
                                    const providerName = providers.find(p => p.id === engine.edge_provider_id)?.name || engine.provider;
                                    const isSelected = selectedIds.has(engine.id);
                                    return (
                                        <div key={engine.id} className={`flex items-center justify-between p-4 border rounded-lg bg-card hover:border-border transition-colors group ${isSelected ? 'ring-1 ring-primary border-primary' : ''}`}>
                                            <div className="flex items-start gap-3">
                                                {/* Checkbox */}
                                                {!engine.is_system && (
                                                    <Checkbox
                                                        checked={isSelected}
                                                        onCheckedChange={() => toggleSelect(engine.id)}
                                                        className="mt-1"
                                                    />
                                                )}
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
                                                        {engine.adapter_type && (
                                                            <Badge variant="outline" className={`text-[10px] h-5 py-0 ${engine.adapter_type === 'full'
                                                                ? 'bg-purple-500/5 border-purple-500/20 text-purple-400'
                                                                : 'bg-blue-500/5 border-blue-500/20 text-blue-400'
                                                                }`}>
                                                                {engine.adapter_type === 'full' ? 'Full' : 'Lite'}
                                                            </Badge>
                                                        )}
                                                        {engine.sync_status === 'synced' && (
                                                            <Badge variant="outline" className="text-[10px] h-5 py-0 bg-green-500/5 border-green-500/20 text-green-400">✓ Synced</Badge>
                                                        )}
                                                        {engine.sync_status === 'stale' && (
                                                            <Badge variant="outline" className="text-[10px] h-5 py-0 bg-amber-500/5 border-amber-500/20 text-amber-400">⚠ Stale</Badge>
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
                                                        {engine.last_deployed_at && (
                                                            <span className="text-[10px]">Deployed {timeAgo(engine.last_deployed_at)}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                                        <Badge variant="outline" className={`text-[10px] h-5 py-0 ${engine.edge_db_name
                                                            ? 'bg-blue-500/5 border-blue-500/20 text-blue-400'
                                                            : 'bg-muted/50 border-border text-muted-foreground'
                                                            }`}>
                                                            DB: {engine.edge_db_name || 'None'}
                                                        </Badge>
                                                        <Badge variant="outline" className={`text-[10px] h-5 py-0 ${engine.edge_cache_name
                                                            ? 'bg-amber-500/5 border-amber-500/20 text-amber-400'
                                                            : 'bg-muted/50 border-border text-muted-foreground'
                                                            }`}>
                                                            Cache: {engine.edge_cache_name || 'None'}
                                                        </Badge>
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
                                                    <>
                                                        <EdgeInspectorDialog engine={engine} providerId={engine.edge_provider_id || ''} />
                                                        <ReconfigureEngineDialog engine={engine} />
                                                        <DeleteEngineDialog
                                                            engine={engine}
                                                            onDelete={handleDelete}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </CardContent>

            <BulkDeleteDialog
                open={bulkDeleteOpen}
                onOpenChange={setBulkDeleteOpen}
                selectedCount={selectedIds.size}
                onConfirm={handleBulkDelete}
            />
        </Card >
    );
}
