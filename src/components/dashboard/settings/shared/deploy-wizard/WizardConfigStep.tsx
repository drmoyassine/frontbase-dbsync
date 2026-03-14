/**
 * WizardConfigStep — Step 3: Engine configuration form.
 *
 * Handles both CPU and GPU flows, including:
 * - GPU: New vs Existing toggle + engine picker
 * - Engine type (Lite / Full)
 * - Resource name (provider-aware label from PROVIDER_RESOURCE_LABELS)
 * - Edge DB / Cache / Queue selectors with "Connect New" option
 *
 * This is the main customization point for per-provider features.
 */

import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Cpu, Layers, Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROVIDER_RESOURCE_LABELS, PROVIDER_CONFIGS } from '../edgeConstants';
import { ConnectProviderDialog } from '../ConnectProviderDialog';
import type { DeployWizardState } from './useDeployWizard';

const CONNECT_NEW_VALUE = '__connect_new__';

export function WizardConfigStep({
    computeType,
    engineType, setEngineType,
    workerName, setWorkerName,
    selectedProviderType,
    selectedDbId, setSelectedDbId,
    selectedCacheId, setSelectedCacheId,
    selectedQueueId, setSelectedQueueId,
    edgeDbs, edgeCaches, edgeQueues,
}: DeployWizardState) {
    const queryClient = useQueryClient();

    // Connect New dialog state — tracks which resource type is being connected
    const [connectOpen, setConnectOpen] = useState(false);
    const [connectingFor, setConnectingFor] = useState<'database' | 'cache' | 'queue' | null>(null);

    // Filtered providers for Connect New dialog based on capability
    const connectAllowedProviders = useMemo(() => {
        if (!connectingFor) return [];
        return Object.entries(PROVIDER_CONFIGS)
            .filter(([, config]) => config.capabilities.includes(connectingFor))
            .map(([key]) => key);
    }, [connectingFor]);

    const handleConnectNew = (type: 'database' | 'cache' | 'queue') => {
        setConnectingFor(type);
        setConnectOpen(true);
    };

    // Filter out local/system resources — cloud engines can't reach localhost
    const cloudDbs = edgeDbs.filter((db: any) => !db.is_system);
    const cloudCaches = edgeCaches.filter((c: any) => !c.is_system);
    const cloudQueues = edgeQueues.filter((q: any) => !q.is_system);

    // System default label — only show if default is a non-local resource
    const defaultDb = cloudDbs.find((db: any) => db.is_default);
    const defaultDbLabel = defaultDb ? `System Default (${defaultDb.name})` : null;

    return (
        <div className="space-y-4">
            {/* Engine Type */}
            <div className="space-y-2">
                <Label>Engine Type</Label>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => setEngineType('lite')}
                        className={`flex flex-col items-start gap-1.5 rounded-lg border-2 p-3 text-left transition-all ${engineType === 'lite'
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
                        onClick={() => { if (selectedProviderType !== 'supabase') setEngineType('full'); }}
                        className={`flex flex-col items-start gap-1.5 rounded-lg border-2 p-3 text-left transition-all ${
                            selectedProviderType === 'supabase'
                                ? 'border-border opacity-60 cursor-not-allowed'
                                : engineType === 'full'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-muted-foreground/50'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-purple-500" />
                            <span className="font-medium text-sm">Full</span>
                            <Badge variant="secondary" className="text-[10px] h-4 py-0 bg-purple-500/10 text-purple-500">~2.2 MB</Badge>
                            {selectedProviderType === 'supabase' && (
                                <Badge variant="outline" className="text-[10px] h-4 py-0 border-amber-500/50 text-amber-500">Soon</Badge>
                            )}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                            Everything in Lite + SSR pages, React rendering, component library, data routes.
                        </p>
                    </button>
                </div>
            </div>

            {/* Resource Name — provider-aware label */}
            <div className="space-y-2">
                <Label>
                    {PROVIDER_RESOURCE_LABELS[selectedProviderType]?.inputLabel || 'Worker Name'}
                </Label>
                <div className="flex gap-2 items-center">
                    <Input value={workerName} onChange={e => setWorkerName(e.target.value)} />
                    {PROVIDER_RESOURCE_LABELS[selectedProviderType]?.urlSuffix && (
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {PROVIDER_RESOURCE_LABELS[selectedProviderType].urlSuffix}
                        </span>
                    )}
                </div>
            </div>

            {/* Edge Database */}
            <div className="space-y-2">
                <Label>Edge Database</Label>
                <Select value={selectedDbId} onValueChange={v => {
                    if (v === CONNECT_NEW_VALUE) { handleConnectNew('database'); return; }
                    setSelectedDbId(v);
                }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {defaultDbLabel && <SelectItem value="default">{defaultDbLabel}</SelectItem>}
                        {cloudDbs.map((db: any) => (
                            <SelectItem key={db.id} value={db.id}>{db.name} ({db.provider})</SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={CONNECT_NEW_VALUE} className="text-primary">
                            <span className="flex items-center gap-1.5"><Plus className="w-3 h-3" /> Connect New Database</span>
                        </SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Persistent edge database for published pages and state.</p>
            </div>

            {/* Edge Cache */}
            <div className="space-y-2">
                <Label>Edge Cache</Label>
                <Select value={selectedCacheId} onValueChange={v => {
                    if (v === CONNECT_NEW_VALUE) { handleConnectNew('cache'); return; }
                    setSelectedCacheId(v);
                }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {cloudCaches.map(cache => (
                            <SelectItem key={cache.id} value={cache.id}>{cache.name} ({cache.provider})</SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={CONNECT_NEW_VALUE} className="text-primary">
                            <span className="flex items-center gap-1.5"><Plus className="w-3 h-3" /> Connect New Cache</span>
                        </SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Optional caching layer (Upstash, Redis) for faster page loads.</p>
            </div>

            {/* Edge Queue */}
            <div className="space-y-2">
                <Label>Edge Queue</Label>
                <Select value={selectedQueueId} onValueChange={v => {
                    if (v === CONNECT_NEW_VALUE) { handleConnectNew('queue'); return; }
                    setSelectedQueueId(v);
                }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {cloudQueues.map(queue => (
                            <SelectItem key={queue.id} value={queue.id}>{queue.name} ({queue.provider})</SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={CONNECT_NEW_VALUE} className="text-primary">
                            <span className="flex items-center gap-1.5"><Plus className="w-3 h-3" /> Connect New Queue</span>
                        </SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Optional message queue (QStash) for durable workflow execution.</p>
            </div>

            {/* Connect Provider dialog — filtered by resource capability */}
            <ConnectProviderDialog
                open={connectOpen}
                onOpenChange={setConnectOpen}
                allowedProviders={connectAllowedProviders}
                onConnected={async (accountId) => {
                    // Auto-register edge resources from the newly connected account
                    // so they appear in the wizard dropdown immediately.
                    try {
                        if (connectingFor === 'database') {
                            const disc = await fetch(`/api/edge-providers/discover-by-account/${accountId}`).then(r => r.json());
                            const dbs = disc?.resources?.filter((r: any) => r.type === 'turso_db') || [];
                            for (const db of dbs) {
                                await fetch(`/api/edge-databases/`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        name: db.name || 'Database',
                                        provider: 'turso',
                                        db_url: db.db_url,
                                        db_token: db.token,
                                        provider_account_id: accountId,
                                        is_default: false,
                                    }),
                                });
                            }
                        }
                        // TODO: similar for cache/queue when those providers support discovery
                    } catch (e) {
                        console.warn('[Wizard] Auto-register edge resource failed:', e);
                    }

                    // Invalidate queries so new entries appear
                    const queryKeyMap = { database: 'edge-databases', cache: 'edge-caches', queue: 'edge-queues' };
                    if (connectingFor) queryClient.invalidateQueries({ queryKey: [queryKeyMap[connectingFor]] });
                    queryClient.invalidateQueries({ queryKey: ['edge-providers'] });
                    setConnectOpen(false);
                    setConnectingFor(null);
                }}
            />
        </div>
    );
}
