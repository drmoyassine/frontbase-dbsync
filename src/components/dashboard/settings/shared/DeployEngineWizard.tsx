/**
 * DeployEngineWizard — Unified deploy wizard with CPU / GPU flow.
 *
 * Steps:
 *   1. Provider  — select CF provider account
 *   2. Compute   — CPU vs GPU toggle cards
 *   3. Config    — Lite/Full, worker name, DB, cache, queue
 *                  (GPU adds: New vs Existing engine choice)
 *   4. AI Model  — (GPU only) model catalog picker
 *   5. Deploy    — triggers deploy (+ optional model attach + redeploy)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
    Rocket, Cpu, Layers, Loader2, AlertTriangle,
    Brain, ChevronLeft, ChevronRight, Search, Plus, Sparkles,
} from 'lucide-react';
import {
    useEdgeProviders,
    useEdgeEngines,
    useEdgeDatabases,
    useEdgeCaches,
    useEdgeQueues,
    EdgeEngine,
} from '@/hooks/useEdgeInfrastructure';
import { useToast } from '@/hooks/use-toast';
import { API_BASE } from './edgeConstants';

// ============================================================================
// Types
// ============================================================================

type WizardStep = 'provider' | 'compute-type' | 'engine-config' | 'ai-model' | 'deploying';
type ComputeType = 'cpu' | 'gpu';
type GPUMode = 'new' | 'existing';

interface CatalogModel {
    name: string;
    model_id: string;
    task_type: string;
    model_type: string;
    description: string;
    properties: string[];
    schema: any;
}

// ============================================================================
// API helpers (GPU catalog + model deploy)
// ============================================================================

async function fetchCatalog(providerId: string): Promise<{ models_by_type: Record<string, CatalogModel[]>; total: number }> {
    const res = await fetch(`${API_BASE}/api/edge-gpu/catalog?provider_id=${providerId}&provider=workers_ai`);
    if (!res.ok) throw new Error('Failed to fetch model catalog');
    return res.json();
}

async function deployGPUModel(data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/api/edge-gpu/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to deploy model');
    }
    return res.json();
}

// ============================================================================
// Type badge config
// ============================================================================

const TYPE_COLORS: Record<string, string> = {
    llm: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
    embedder: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    stt: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    tts: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
    image_gen: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
    classifier: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    vision: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300',
};

const TYPE_LABELS: Record<string, string> = {
    llm: '🔤 Text Generation',
    embedder: '📊 Embeddings',
    stt: '🎤 Speech-to-Text',
    tts: '🔊 Text-to-Speech',
    image_gen: '🖼️ Image Gen',
    classifier: '🏷️ Classifier',
    vision: '👁️ Vision',
    translator: '🌐 Translator',
    summarizer: '📝 Summarizer',
};

// ============================================================================
// Constants
// ============================================================================

const KNOWN_EDGE_PROVIDERS = new Set(['cloudflare', 'supabase', 'upstash', 'vercel', 'netlify', 'deno']);

// ============================================================================
// Component
// ============================================================================

export function DeployEngineWizard() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { data: providers = [] } = useEdgeProviders();
    const { data: engines = [], refetch: refetchEngines } = useEdgeEngines();
    const { data: edgeDbs = [] } = useEdgeDatabases();
    const { data: edgeCaches = [] } = useEdgeCaches();
    const { data: edgeQueues = [] } = useEdgeQueues();

    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<WizardStep>('provider');
    const [error, setError] = useState<string | null>(null);
    const [isDeploying, setIsDeploying] = useState(false);

    // Step 1: Provider
    const [selectedProviderId, setSelectedProviderId] = useState('');
    const validProviders = useMemo(
        () => providers.filter(p => p.is_active && KNOWN_EDGE_PROVIDERS.has(p.provider)),
        [providers]
    );
    const selectedProvider = validProviders.find(p => p.id === selectedProviderId);
    const selectedProviderType = selectedProvider?.provider || 'cloudflare';

    // Step 2: Compute type
    const [computeType, setComputeType] = useState<ComputeType>('cpu');

    // Step 3: Engine config
    const [engineType, setEngineType] = useState<'lite' | 'full'>('lite');
    const [workerName, setWorkerName] = useState('frontbase-edge');
    const [selectedDbId, setSelectedDbId] = useState('default');
    const [selectedCacheId, setSelectedCacheId] = useState('none');
    const [selectedQueueId, setSelectedQueueId] = useState('none');
    const [gpuMode, setGPUMode] = useState<GPUMode>('new');
    const [existingEngineId, setExistingEngineId] = useState('');

    // Step 4: AI Model (GPU only)
    const [catalogFilter, setCatalogFilter] = useState('');
    const [catalogTypeFilter, setCatalogTypeFilter] = useState('all');
    const [selectedModel, setSelectedModel] = useState<CatalogModel | null>(null);

    // CF engines for "existing" GPU mode
    const cfEngines = useMemo(
        () => engines.filter((e: EdgeEngine) => e.edge_provider_id),
        [engines]
    );

    // Catalog query — only when GPU + we have a provider
    const { data: catalog, isLoading: catalogLoading } = useQuery({
        queryKey: ['gpu-catalog', selectedProviderId],
        queryFn: () => fetchCatalog(selectedProviderId),
        enabled: computeType === 'gpu' && !!selectedProviderId && step === 'ai-model',
        retry: 1,
        refetchOnWindowFocus: false,
    });

    // Filter catalog
    const allCatalogModels = catalog?.models_by_type
        ? Object.values(catalog.models_by_type).flat()
        : [];
    const filteredCatalog = allCatalogModels.filter((m) => {
        const matchesSearch = !catalogFilter || m.name.toLowerCase().includes(catalogFilter.toLowerCase()) ||
            m.description.toLowerCase().includes(catalogFilter.toLowerCase());
        const matchesType = catalogTypeFilter === 'all' || m.model_type === catalogTypeFilter;
        return matchesSearch && matchesType;
    });
    const catalogTypes = [...new Set(allCatalogModels.map((m) => m.model_type))].sort();

    // Auto-select first provider
    useEffect(() => {
        if (validProviders.length > 0 && !selectedProviderId) {
            setSelectedProviderId(validProviders[0].id);
        }
    }, [validProviders, selectedProviderId]);

    // Auto-select default DB
    useEffect(() => {
        if (edgeDbs.length > 0 && selectedDbId === 'default') {
            const def = edgeDbs.find((d: any) => d.is_default);
            if (def) setSelectedDbId(def.id);
        }
    }, [edgeDbs, selectedDbId]);

    // ── Reset on close ───────────────────────────────────────────────────
    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) {
            setStep('provider');
            setError(null);
            setComputeType('cpu');
            setEngineType('lite');
            setGPUMode('new');
            setExistingEngineId('');
            setSelectedModel(null);
            setCatalogFilter('');
            setCatalogTypeFilter('all');
            setIsDeploying(false);
        }
    };

    // ── Navigation ───────────────────────────────────────────────────────
    const goNext = () => {
        setError(null);
        if (step === 'provider') {
            if (!selectedProviderId) { setError('Select a provider'); return; }
            setStep('compute-type');
        } else if (step === 'compute-type') {
            setStep('engine-config');
        } else if (step === 'engine-config') {
            if (computeType === 'gpu') {
                if (gpuMode === 'existing' && !existingEngineId) {
                    setError('Select an existing engine');
                    return;
                }
                setStep('ai-model');
            } else {
                handleDeploy();
            }
        } else if (step === 'ai-model') {
            handleDeploy();
        }
    };

    const goBack = () => {
        setError(null);
        if (step === 'compute-type') setStep('provider');
        else if (step === 'engine-config') setStep('compute-type');
        else if (step === 'ai-model') setStep('engine-config');
    };

    // ── Deploy ───────────────────────────────────────────────────────────
    const handleDeploy = async () => {
        setIsDeploying(true);
        setStep('deploying');
        setError(null);

        try {
            let targetEngineId: string | null = null;

            // ----- New Engine path (CPU or GPU-New) -------------------------
            if (computeType === 'cpu' || gpuMode === 'new') {
                const res = await fetch(`${API_BASE}/api/edge-engines/deploy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider_id: selectedProviderId,
                        worker_name: workerName,
                        adapter_type: engineType === 'full' ? 'full' : 'automations',
                        edge_db_id: selectedDbId === 'none' ? '__none__' : selectedDbId === 'default' ? undefined : selectedDbId,
                        edge_cache_id: selectedCacheId === 'none' ? '__none__' : selectedCacheId,
                        edge_queue_id: selectedQueueId === 'none' ? '__none__' : selectedQueueId,
                    }),
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.detail || data.error || 'Deploy failed');
                }
                targetEngineId = data.engine_id || null;

                // Refetch to get the new engine in the list
                const { data: refreshedEngines } = await refetchEngines();
                if (!targetEngineId && refreshedEngines) {
                    // Find the newly created engine by worker name
                    const newEngine = refreshedEngines.find(
                        (e: EdgeEngine) => e.name.toLowerCase().includes(workerName.toLowerCase())
                    );
                    if (newEngine) targetEngineId = newEngine.id;
                }
            }

            // ----- Existing Engine path (GPU-Existing) ----------------------
            if (computeType === 'gpu' && gpuMode === 'existing') {
                targetEngineId = existingEngineId;
            }

            // ----- Attach GPU model if GPU path -----------------------------
            if (computeType === 'gpu' && selectedModel && targetEngineId) {
                const modelResult = await deployGPUModel({
                    name: selectedModel.name.split('/').pop() || selectedModel.name,
                    model_type: selectedModel.model_type,
                    provider: 'workers_ai',
                    model_id: selectedModel.model_id,
                    edge_engine_id: targetEngineId,
                });

                const redeployStatus = modelResult.redeployed
                    ? 'Engine redeployed with AI binding ✓'
                    : modelResult.redeploy_error
                        ? `Model attached. Redeploy warning: ${modelResult.redeploy_error}`
                        : 'Model attached (manual redeploy may be needed)';

                toast({
                    title: '🧠 GPU Model Deployed',
                    description: `${modelResult.name} → ${modelResult.endpoint_url}\n${redeployStatus}`,
                });
            } else if (computeType === 'cpu') {
                toast({ title: '🚀 Engine Deployed', description: `${workerName} deployed successfully` });
            }

            queryClient.invalidateQueries({ queryKey: ['gpu-models'] });
            await refetchEngines();
            handleOpenChange(false);
        } catch (e: any) {
            setError(e.message);
            setStep(computeType === 'gpu' ? 'ai-model' : 'engine-config');
        } finally {
            setIsDeploying(false);
        }
    };

    // ── Step title helper ────────────────────────────────────────────────
    const stepTitle = () => {
        switch (step) {
            case 'provider': return 'Select Provider';
            case 'compute-type': return 'Compute Type';
            case 'engine-config': return computeType === 'gpu' && gpuMode === 'existing' ? 'Select Engine' : 'Engine Configuration';
            case 'ai-model': return 'Select AI Model';
            case 'deploying': return 'Deploying...';
        }
    };

    const stepNumber = () => {
        const steps: WizardStep[] = computeType === 'gpu'
            ? ['provider', 'compute-type', 'engine-config', 'ai-model']
            : ['provider', 'compute-type', 'engine-config'];
        const idx = steps.indexOf(step);
        return idx >= 0 ? `Step ${idx + 1} of ${steps.length}` : '';
    };

    // ── Can proceed? ─────────────────────────────────────────────────────
    const canNext = () => {
        if (step === 'provider') return !!selectedProviderId;
        if (step === 'compute-type') return true;
        if (step === 'engine-config') {
            if (computeType === 'gpu' && gpuMode === 'existing') return !!existingEngineId;
            return !!workerName;
        }
        if (step === 'ai-model') return true; // model is optional — they can skip
        return false;
    };

    // ── Render ───────────────────────────────────────────────────────────
    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button size="sm" disabled={validProviders.length === 0}>
                    <Rocket className="w-4 h-4 mr-2" /> Deploy Engine
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{stepTitle()}</DialogTitle>
                    <DialogDescription>
                        {step === 'deploying'
                            ? 'Please wait while your engine is being deployed...'
                            : stepNumber()
                        }
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4 min-h-[200px]">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* ─── Step: Provider ──────────────────────── */}
                    {step === 'provider' && (
                        <div className="space-y-2">
                            <Label>Provider Account</Label>
                            <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {validProviders.map(p => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name} <span className="text-xs text-muted-foreground ml-1">({p.provider})</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* ─── Step: Compute Type ─────────────────── */}
                    {step === 'compute-type' && (
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setComputeType('cpu')}
                                className={`relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all ${computeType === 'cpu'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-muted-foreground/50'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Cpu className="w-5 h-5 text-blue-500" />
                                    <span className="font-semibold text-sm">CPU</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-tight">
                                    Deploy SSR pages, workflows, automations, and API gateway — no AI inference.
                                </p>
                            </button>
                            <button
                                type="button"
                                onClick={() => setComputeType('gpu')}
                                className={`relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all ${computeType === 'gpu'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-muted-foreground/50'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Brain className="w-5 h-5 text-purple-500" />
                                    <span className="font-semibold text-sm">GPU</span>
                                    <Badge variant="secondary" className="text-[10px] h-4 py-0 bg-purple-500/10 text-purple-500">AI</Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-tight">
                                    Everything in CPU + AI model inference via Workers AI (LLMs, embeddings, vision…).
                                </p>
                            </button>
                        </div>
                    )}

                    {/* ─── Step: Engine Config ────────────────── */}
                    {step === 'engine-config' && (
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
                                            {selectedProviderType === 'supabase' ? 'Function Name' :
                                                selectedProviderType === 'vercel' || selectedProviderType === 'deno' ? 'Project Name' :
                                                    selectedProviderType === 'netlify' ? 'Site Name' :
                                                        'Worker Name'}
                                        </Label>
                                        <div className="flex gap-2 items-center">
                                            <Input value={workerName} onChange={e => setWorkerName(e.target.value)} />
                                            <span className="text-sm text-muted-foreground whitespace-nowrap">
                                                {selectedProviderType === 'cloudflare' ? '.workers.dev' :
                                                    selectedProviderType === 'supabase' ? '' :
                                                        selectedProviderType === 'vercel' ? '.vercel.app' :
                                                            selectedProviderType === 'netlify' ? '.netlify.app' :
                                                                selectedProviderType === 'deno' ? '.deno.dev' : ''}
                                            </span>
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
                    )}

                    {/* ─── Step: AI Model Catalog ─────────────── */}
                    {step === 'ai-model' && (
                        <div className="space-y-3">
                            {catalogLoading ? (
                                <div className="flex items-center gap-2 py-6 text-muted-foreground justify-center">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading model catalog...
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Search models..."
                                                value={catalogFilter}
                                                onChange={(e) => setCatalogFilter(e.target.value)}
                                                className="pl-9 h-8"
                                            />
                                        </div>
                                        <Select value={catalogTypeFilter} onValueChange={setCatalogTypeFilter}>
                                            <SelectTrigger className="w-[160px] h-8 text-xs">
                                                <SelectValue placeholder="All Types" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Types</SelectItem>
                                                {catalogTypes.map((t) => (
                                                    <SelectItem key={t} value={t}>{TYPE_LABELS[t] || t}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {catalog && (
                                        <p className="text-xs text-muted-foreground">
                                            <Sparkles className="w-3 h-3 inline mr-1" />
                                            {catalog.total} models available
                                            {selectedModel && (
                                                <span className="ml-2 text-primary font-medium">
                                                    • Selected: {selectedModel.name.split('/').pop()}
                                                </span>
                                            )}
                                        </p>
                                    )}

                                    <div className="grid grid-cols-1 gap-2 max-h-[280px] overflow-y-auto pr-1">
                                        {filteredCatalog.slice(0, 40).map((model) => {
                                            const isSelected = selectedModel?.model_id === model.model_id;
                                            return (
                                                <button
                                                    key={model.model_id}
                                                    type="button"
                                                    onClick={() => setSelectedModel(isSelected ? null : model)}
                                                    className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${isSelected
                                                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                                        : 'border-border hover:bg-muted/50'
                                                        }`}
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-medium text-sm truncate">{model.name.split('/').pop()}</div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <Badge className={`${TYPE_COLORS[model.model_type] || 'bg-gray-100 text-gray-700'} text-[10px] h-4 py-0`} variant="secondary">
                                                                {TYPE_LABELS[model.model_type] || model.model_type}
                                                            </Badge>
                                                        </div>
                                                        {model.description && (
                                                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{model.description}</p>
                                                        )}
                                                    </div>
                                                    {isSelected && (
                                                        <Badge className="bg-primary text-primary-foreground text-[10px] ml-2">Selected</Badge>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {filteredCatalog.length > 40 && (
                                        <p className="text-xs text-muted-foreground">
                                            Showing 40 of {filteredCatalog.length}. Use search to narrow results.
                                        </p>
                                    )}

                                    {!selectedModel && (
                                        <p className="text-xs text-muted-foreground italic">
                                            You can skip model selection and add one later from the engine card.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* ─── Step: Deploying ────────────────────── */}
                    {step === 'deploying' && (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">
                                {computeType === 'gpu' && gpuMode === 'existing'
                                    ? 'Attaching AI model & redeploying engine...'
                                    : `Deploying engine to ${selectedProvider?.name || selectedProviderType}...`}
                            </p>
                        </div>
                    )}
                </div>

                {/* ─── Footer: Back / Next / Deploy ───────── */}
                {step !== 'deploying' && (
                    <DialogFooter className="flex justify-between sm:justify-between">
                        <div>
                            {step !== 'provider' && (
                                <Button variant="outline" onClick={goBack} size="sm">
                                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => handleOpenChange(false)} size="sm">Cancel</Button>
                            <Button
                                onClick={goNext}
                                disabled={!canNext() || isDeploying}
                                size="sm"
                            >
                                {step === 'engine-config' && computeType === 'cpu' ? (
                                    <><Rocket className="w-4 h-4 mr-1" /> Deploy</>
                                ) : step === 'ai-model' ? (
                                    <><Rocket className="w-4 h-4 mr-1" /> {selectedModel ? 'Deploy with Model' : 'Deploy without Model'}</>
                                ) : (
                                    <>Next <ChevronRight className="w-4 h-4 ml-1" /></>
                                )}
                            </Button>
                        </div>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
