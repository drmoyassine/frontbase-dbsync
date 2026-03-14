import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cloud, Server, Loader2, Search, Trash2, Power, RefreshCw, Upload, Cpu, Brain } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    useEdgeEngines,
    useEdgeProviders,
    edgeInfrastructureApi,
    EdgeEngine,
} from '@/hooks/useEdgeInfrastructure';
import { useEdgeEngineActions, timeAgo } from '@/hooks/useEdgeEngineActions';
import { PROVIDER_ICONS } from './edgeConstants';
import { DeleteEngineDialog } from './DeleteEngineDialog';
import { ReconfigureEngineDialog } from './ReconfigureEngineDialog';
import { EdgeInspectorDialog } from './EdgeInspectorDialog';
import { BulkDeleteDialog } from './BulkDeleteDialog';
import { DeployEngineWizard } from './DeployEngineWizard';
import { FetchEnginesDialog } from './FetchEnginesDialog';
import { AITestDialog } from './AITestDialog';
import { EdgeEndpointDialog } from './EdgeEndpointDialog';
import { toast } from 'sonner';


const Info = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
);

export function EdgeEnginesSection() {
    const { data: engines = [], isLoading: loadingEngines, refetch: refetchEngines } = useEdgeEngines();
    const { data: providers = [] } = useEdgeProviders();

    // Memoize to avoid new array ref on every render (AGENTS.md: no unstable deps in useEffect)
    const validProviders = useMemo(
        () => providers.filter(p => p.is_active && p.provider === 'cloudflare'),
        [providers]
    );

    const {
        error, setError,
        selectedIds, setSelectedIds,
        bulkLoading,
        bulkDeleteOpen, setBulkDeleteOpen,
        redeployingId, setRedeployingId,
        deletingAIId,
        toggleSelect,
        toggleSelectAll: toggleSelectAllFn,
        handleToggle,
        handleDelete,
        handleBulkDelete,
        handleBulkToggle,
        handleBulkSyncCheck,
        handleAIDelete,
    } = useEdgeEngineActions({ providers, refetchEngines });

    // ── Search & filter state (stays in component — drives render) ───────
    const [searchQuery, setSearchQuery] = useState('');
    const [filterProvider, setFilterProvider] = useState<string>('all');
    const [filterBundle, setFilterBundle] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');

    const filteredEngines = useMemo(() => {
        return engines.filter(e => {
            if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (filterProvider !== 'all' && e.provider !== filterProvider) return false;
            if (filterBundle !== 'all') {
                const isLite = e.adapter_type === 'automations' || e.adapter_type === 'edge';
                if (filterBundle === 'lite' && !isLite) return false;
                if (filterBundle === 'full' && isLite) return false;
            }
            if (filterStatus === 'active' && !e.is_active) return false;
            if (filterStatus === 'inactive' && e.is_active) return false;
            return true;
        });
    }, [engines, searchQuery, filterProvider, filterBundle, filterStatus]);

    const providerOptions = useMemo(
        () => [...new Set(engines.map(e => e.provider).filter(Boolean))],
        [engines]
    );

    const selectableEngines = filteredEngines.filter(e => !e.is_system);
    const allSelected = selectableEngines.length > 0 && selectableEngines.every(e => selectedIds.has(e.id));
    const toggleSelectAll = () => toggleSelectAllFn(selectableEngines);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle>Edge Engines</CardTitle>
                    <CardDescription>Deploys of the Unified Runtime Engine across your providers.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <FetchEnginesDialog />
                    <DeployEngineWizard />
                </div>
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
                                    const providerName = providers.find(p => p.id === engine.edge_provider_id)?.name || engine.provider;
                                    const isSelected = selectedIds.has(engine.id);
                                    const engineUrl = engine.url?.startsWith('http') ? engine.url : `https://${engine.url}`;
                                    return (
                                        <div key={engine.id} className={`flex items-start justify-between p-4 border rounded-lg bg-card hover:border-border transition-colors ${isSelected ? 'ring-1 ring-primary border-primary' : ''}`}>
                                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                                {/* Checkbox spacer for alignment */}
                                                {!engine.is_system ? (
                                                    <Checkbox
                                                        checked={isSelected}
                                                        onCheckedChange={() => toggleSelect(engine.id)}
                                                        className="mt-1"
                                                    />
                                                ) : (
                                                    <div className="w-4 shrink-0" />
                                                )}
                                                <div className="space-y-4 flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="font-medium text-sm">{engine.name}</h4>
                                                        {!engine.is_active && (
                                                            <Badge variant="secondary" className="text-[10px] h-5 py-0 bg-muted text-muted-foreground">Paused</Badge>
                                                        )}
                                                        {engine.adapter_type && (
                                                            <EdgeEndpointDialog engineName={engine.name} engineUrl={engine.url} engineId={engine.id} trigger={
                                                                <button className="inline-flex items-center no-underline" title="Edge Endpoint Details">
                                                                    <Badge variant="outline" className="text-[10px] h-5 py-0 cursor-pointer hover:opacity-80 transition-opacity bg-blue-500/5 border-blue-500/20 text-blue-400">
                                                                        <Cpu className="w-3 h-3 mr-1" />
                                                                        {engine.adapter_type === 'full' ? 'Full' : 'Lite'} Bundle
                                                                    </Badge>
                                                                </button>
                                                            } />
                                                        )}
                                                        {engine.gpu_models && engine.gpu_models.length > 0 && (
                                                            <AITestDialog gpuModels={engine.gpu_models} trigger={
                                                                <button className="inline-flex items-center no-underline" title="AI Endpoint Details">
                                                                    <Badge variant="outline" className="text-[10px] h-5 py-0 cursor-pointer hover:opacity-80 transition-opacity bg-purple-500/5 border-purple-500/20 text-purple-400">
                                                                        <Brain className="w-3 h-3 mr-1" />
                                                                        {engine.gpu_models.length === 1
                                                                            ? engine.gpu_models[0].name
                                                                            : `${engine.gpu_models.length} AI Models`
                                                                        }
                                                                    </Badge>
                                                                </button>
                                                            } />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-sm text-muted-foreground font-medium">Bindings:</span>
                                                        <Badge variant="outline" className="text-[10px] h-5 py-0 bg-muted/50 border-border text-muted-foreground">
                                                            DB: {engine.edge_db_name || 'None'}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-[10px] h-5 py-0 bg-muted/50 border-border text-muted-foreground">
                                                            Cache: {engine.edge_cache_name || 'None'}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-[10px] h-5 py-0 bg-muted/50 border-border text-muted-foreground">
                                                            Queue: {engine.edge_queue_name || 'None'}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right column: status + actions */}
                                            <div className="flex flex-col items-end gap-2 shrink-0 ml-4">
                                                {/* Status row: synced/stale/outdated + deployed time */}
                                                <div className="flex items-center gap-1.5 text-[10px]">
                                                    {engine.sync_status === 'synced' && (
                                                        <Badge variant="outline" className="text-[10px] h-5 py-0 bg-green-500/5 border-green-500/20 text-green-400">✓ Synced</Badge>
                                                    )}
                                                    {engine.sync_status === 'stale' && !engine.is_outdated && (
                                                        <Badge variant="outline" className="text-[10px] h-5 py-0 bg-amber-500/5 border-amber-500/20 text-amber-400">⚠ Stale</Badge>
                                                    )}
                                                    {engine.is_outdated && (
                                                        <Badge variant="outline" className="text-[10px] h-5 py-0 bg-orange-500/5 border-orange-500/20 text-orange-400 animate-pulse">⚠ Outdated</Badge>
                                                    )}
                                                    {engine.last_deployed_at && (
                                                        <span className="text-muted-foreground whitespace-nowrap">Deployed {timeAgo(engine.last_deployed_at)}</span>
                                                    )}
                                                </div>
                                                {/* Actions */}
                                                <div className="flex items-center gap-1.5">
                                                    {/* Engine actions */}
                                                    <div className="flex items-center space-x-2 mr-1">
                                                        <Switch
                                                            title={engine.is_active ? "Pause Engine" : "Activate Engine"}
                                                            id={`active-${engine.id}`}
                                                            checked={engine.is_active}
                                                            onCheckedChange={() => handleToggle(engine)}
                                                        />

                                                        {!engine.is_system && (
                                                            <>
                                                                <EdgeInspectorDialog engine={engine} providerId={engine.edge_provider_id || ''} />
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    title="Redeploy with latest code"
                                                                    disabled={redeployingId === engine.id}
                                                                    onClick={async () => {
                                                                        setRedeployingId(engine.id);
                                                                        try {
                                                                            await edgeInfrastructureApi.redeployEngine(engine.id);
                                                                            await refetchEngines();
                                                                        } catch (e: any) {
                                                                            setError(e.message);
                                                                        } finally {
                                                                            setRedeployingId(null);
                                                                        }
                                                                    }}
                                                                >
                                                                    {redeployingId === engine.id
                                                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                                                        : <Upload className={`h-4 w-4 ${engine.is_outdated ? 'text-orange-400' : 'text-muted-foreground'}`} />
                                                                    }
                                                                </Button>
                                                                <ReconfigureEngineDialog engine={engine} />
                                                                <DeleteEngineDialog
                                                                    engine={engine}
                                                                    onDelete={handleDelete}
                                                                />
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                        }
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
