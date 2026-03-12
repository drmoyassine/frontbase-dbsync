/**
 * useDeployWizard — All state, navigation, and deploy logic for the wizard.
 *
 * Extracted from DeployEngineWizard to keep the orchestrator slim and allow
 * step components to focus on UI.
 */

import { useState, useMemo, useEffect } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
    useEdgeProviders,
    useEdgeEngines,
    useEdgeDatabases,
    useEdgeCaches,
    useEdgeQueues,
    EdgeEngine,
} from '@/hooks/useEdgeInfrastructure';
import { useToast } from '@/hooks/use-toast';
import {
    API_BASE,
    KNOWN_EDGE_PROVIDERS,
    PROVIDER_CONFIGS,
    GPU_CAPABLE_PROVIDERS,
    fetchGPUCatalog,
    deployGPUModel,
} from '../edgeConstants';
import type { CatalogModel } from '../edgeConstants';

// ============================================================================
// Types
// ============================================================================

export type WizardStep = 'provider' | 'compute-type' | 'engine-config' | 'ai-model' | 'deploying';
export type ComputeType = 'cpu' | 'gpu';
export type GPUMode = 'new' | 'existing';

// ============================================================================
// Hook
// ============================================================================

export function useDeployWizard() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { data: providers = [] } = useEdgeProviders();
    const { data: engines = [], refetch: refetchEngines } = useEdgeEngines();
    const { data: edgeDbs = [] } = useEdgeDatabases();
    const { data: edgeCaches = [] } = useEdgeCaches();
    const { data: edgeQueues = [] } = useEdgeQueues();

    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<WizardStep>('compute-type');
    const [error, setError] = useState<string | null>(null);
    const [isDeploying, setIsDeploying] = useState(false);

    // Step 1: Compute type (declared first — filteredProviders depends on it)
    const [computeType, setComputeType] = useState<ComputeType | null>(null);

    // Step 2: Provider
    const [selectedProviderId, setSelectedProviderId] = useState('');
    const validProviders = useMemo(
        () => providers.filter(p => p.is_active && KNOWN_EDGE_PROVIDERS.has(p.provider)),
        [providers]
    );

    // Filtered by compute type: GPU → only GPU-capable, CPU → all edge providers
    const filteredProviders = useMemo(
        () => computeType === 'gpu'
            ? validProviders.filter(p => GPU_CAPABLE_PROVIDERS.has(p.provider))
            : validProviders,
        [validProviders, computeType]
    );
    const selectedProvider = filteredProviders.find(p => p.id === selectedProviderId);
    const selectedProviderType = selectedProvider?.provider || 'cloudflare';


    // Step 3: Engine config
    const [engineType, setEngineType] = useState<'lite' | 'full'>('lite');
    const [workerName, setWorkerName] = useState('frontbase-edge');
    const [selectedDbId, setSelectedDbId] = useState('none');
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
        queryFn: () => fetchGPUCatalog(selectedProviderId),
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

    // Auto-select first provider (re-run when filteredProviders changes, e.g. after compute toggle)
    useEffect(() => {
        if (filteredProviders.length > 0 && !filteredProviders.find(p => p.id === selectedProviderId)) {
            setSelectedProviderId(filteredProviders[0].id);
        }
    }, [filteredProviders, selectedProviderId]);

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
            setStep('compute-type');
            setError(null);
            setComputeType(null);
            setSelectedProviderId('');
            setEngineType('lite');
            setWorkerName('frontbase-edge');
            setSelectedDbId('none');
            setSelectedCacheId('none');
            setSelectedQueueId('none');
            setGPUMode('new');
            setExistingEngineId('');
            setSelectedModel(null);
            setCatalogFilter('');
            setCatalogTypeFilter('all');
            setIsDeploying(false);
        }
    };

    // ── Navigation ───────────────────────────────────────────────────────
    // Step order: compute-type → provider → engine-config → (ai-model if GPU)
    const selectComputeAndProceed = (type: ComputeType) => {
        setComputeType(type);
        setError(null);
        setStep('provider');
    };

    const goNext = () => {
        setError(null);
        if (step === 'compute-type') {
            setStep('provider');
        } else if (step === 'provider') {
            if (!selectedProviderId) { setError('Select a provider'); return; }
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
        if (step === 'provider') setStep('compute-type');
        else if (step === 'engine-config') setStep('provider');
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
        const providerLabel = PROVIDER_CONFIGS[selectedProviderType]?.label || selectedProviderType;
        switch (step) {
            case 'compute-type': return 'Compute Type';
            case 'provider': return 'Select Provider';
            case 'engine-config': return computeType === 'gpu' && gpuMode === 'existing' ? 'Select Engine' : `${providerLabel} Engine Configuration`;
            case 'ai-model': return 'Select AI Model';
            case 'deploying': return 'Deploying...';
        }
    };

    const stepNumber = () => {
        const steps: WizardStep[] = computeType === 'gpu'
            ? ['compute-type', 'provider', 'engine-config', 'ai-model']
            : ['compute-type', 'provider', 'engine-config'];
        const idx = steps.indexOf(step);
        return idx >= 0 ? `Step ${idx + 1} of ${steps.length}` : '';
    };

    // ── Can proceed? ─────────────────────────────────────────────────────
    const canNext = () => {
        if (step === 'compute-type') return true;
        if (step === 'provider') return !!selectedProviderId;
        if (step === 'engine-config') {
            if (computeType === 'gpu' && gpuMode === 'existing') return !!existingEngineId;
            return !!workerName;
        }
        if (step === 'ai-model') return true; // model is optional — they can skip
        return false;
    };

    return {
        // Dialog
        open, handleOpenChange,

        // Navigation
        step, error, isDeploying,
        goNext, goBack, canNext, stepTitle, stepNumber,

        // Step 1: Compute
        computeType, setComputeType, selectComputeAndProceed,

        // Step 2: Provider (filtered by compute type)
        validProviders, filteredProviders, selectedProviderId, setSelectedProviderId,
        selectedProvider, selectedProviderType,

        // Step 3: Engine config
        engineType, setEngineType,
        workerName, setWorkerName,
        selectedDbId, setSelectedDbId,
        selectedCacheId, setSelectedCacheId,
        selectedQueueId, setSelectedQueueId,
        gpuMode, setGPUMode,
        existingEngineId, setExistingEngineId,
        edgeDbs, edgeCaches, edgeQueues, cfEngines,

        // Step 4: AI Model
        catalog, catalogLoading,
        filteredCatalog, catalogTypes,
        catalogFilter, setCatalogFilter,
        catalogTypeFilter, setCatalogTypeFilter,
        selectedModel, setSelectedModel,
    };
}

export type DeployWizardState = ReturnType<typeof useDeployWizard>;
