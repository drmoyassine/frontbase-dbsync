/**
 * WizardConfigStep — Step 3: Engine configuration form.
 *
 * Handles both CPU and GPU flows, including:
 * - GPU: New vs Existing toggle + engine picker
 * - Engine type (Lite / Full)
 * - Resource name (provider-aware label from PROVIDER_RESOURCE_LABELS)
 * - Edge DB / Cache / Queue selectors
 *
 * This is the main customization point for per-provider features.
 */

import { Cpu, Layers, Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROVIDER_RESOURCE_LABELS } from '../edgeConstants';
import type { EdgeEngine } from '@/hooks/useEdgeInfrastructure';
import type { DeployWizardState } from './useDeployWizard';

export function WizardConfigStep({
    computeType,
    gpuMode, setGPUMode,
    existingEngineId, setExistingEngineId,
    cfEngines,
    engineType, setEngineType,
    workerName, setWorkerName,
    selectedProviderType,
    selectedDbId, setSelectedDbId,
    selectedCacheId, setSelectedCacheId,
    selectedQueueId, setSelectedQueueId,
    edgeDbs, edgeCaches, edgeQueues,
}: DeployWizardState) {
    return (
        <div className="space-y-4">
            {/* GPU: New vs Existing toggle */}
            {computeType === 'gpu' && (
                <div className="space-y-2">
                    <Label>Engine</Label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setGPUMode('new')}
                            className={`rounded-md border-2 p-2.5 text-left text-sm transition-all ${gpuMode === 'new'
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-muted-foreground/50'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <Plus className="w-4 h-4" />
                                <span className="font-medium">New Engine</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Deploy a new edge engine</p>
                        </button>
                        <button
                            type="button"
                            onClick={() => setGPUMode('existing')}
                            className={`rounded-md border-2 p-2.5 text-left text-sm transition-all ${gpuMode === 'existing'
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-muted-foreground/50'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4" />
                                <span className="font-medium">Existing Engine</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Attach model to a deployed engine</p>
                        </button>
                    </div>
                </div>
            )}

            {/* GPU Existing: engine picker */}
            {computeType === 'gpu' && gpuMode === 'existing' ? (
                <div className="space-y-2">
                    <Label>Select Engine</Label>
                    <Select value={existingEngineId} onValueChange={setExistingEngineId}>
                        <SelectTrigger><SelectValue placeholder="Choose a deployed engine..." /></SelectTrigger>
                        <SelectContent>
                            {cfEngines.map((engine: EdgeEngine) => (
                                <SelectItem key={engine.id} value={engine.id}>
                                    {engine.name}
                                    <span className="text-xs text-muted-foreground ml-2">
                                        {engine.url.replace(/^https?:\/\//, '')}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {cfEngines.length === 0 && (
                        <p className="text-xs text-destructive">No deployed engines found. Use "New Engine" instead.</p>
                    )}
                </div>
            ) : (
                /* CPU or GPU-New: full config form */
                <>
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
                                onClick={() => setEngineType('full')}
                                className={`flex flex-col items-start gap-1.5 rounded-lg border-2 p-3 text-left transition-all ${engineType === 'full'
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

                    {/* DB + Cache + Queue */}
                    <div className="space-y-2">
                        <Label>Edge State Database</Label>
                        <Select value={selectedDbId} onValueChange={setSelectedDbId}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None (No Database)</SelectItem>
                                <SelectItem value="default">Use System Default</SelectItem>
                                {edgeDbs.map((db: any) => (
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

                    <div className="space-y-2">
                        <Label>Edge Queue</Label>
                        <Select value={selectedQueueId} onValueChange={setSelectedQueueId}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {edgeQueues.map(queue => (
                                    <SelectItem key={queue.id} value={queue.id}>{queue.name} ({queue.provider})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Optional message queue (QStash) for durable workflow execution.</p>
                    </div>
                </>
            )}
        </div>
    );
}
