/**
 * EdgeGPUForm — Edge GPU model management UI.
 *
 * Two sections matching the Edge Compute pattern:
 *  1. Model Catalog  — browse & deploy from CF Workers AI catalog
 *  2. Active Models  — list deployed models with test/delete
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
    Brain,
    Cpu,
    Trash2,
    Zap,
    Loader2,
    Copy,
    ExternalLink,
    Plus,
    Search,
    Sparkles,
} from 'lucide-react';

const API_BASE = '';

// ============================================================================
// Types
// ============================================================================

interface GPUModel {
    id: string;
    name: string;
    slug: string;
    model_type: string;
    provider: string;
    model_id: string;
    endpoint_url: string | null;
    provider_config: Record<string, any> | null;
    edge_engine_id: string;
    engine_name: string | null;
    is_active: boolean;
    schema: { input: Record<string, string>; output: Record<string, string> } | null;
    created_at: string;
    updated_at: string;
}

interface CatalogModel {
    name: string;
    model_id: string;
    task_type: string;
    model_type: string;
    description: string;
    properties: string[];
    schema: any;
}

interface EdgeEngine {
    id: string;
    name: string;
    url: string;
    edge_provider_id: string | null;
}

// ============================================================================
// API helpers
// ============================================================================

async function fetchGPUModels(): Promise<GPUModel[]> {
    const res = await fetch(`${API_BASE}/api/edge-gpu/`);
    if (!res.ok) throw new Error('Failed to fetch GPU models');
    return res.json();
}

async function fetchCatalog(providerId: string): Promise<{ models_by_type: Record<string, CatalogModel[]>; total: number }> {
    const res = await fetch(`${API_BASE}/api/edge-gpu/catalog?provider_id=${providerId}&provider=workers_ai`);
    if (!res.ok) throw new Error('Failed to fetch model catalog');
    return res.json();
}

async function fetchEngines(): Promise<EdgeEngine[]> {
    const res = await fetch(`${API_BASE}/api/edge-engines/`);
    if (!res.ok) throw new Error('Failed to fetch engines');
    return res.json();
}

async function fetchProviders(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/edge-providers/`);
    if (!res.ok) throw new Error('Failed to fetch providers');
    return res.json();
}

async function deployModel(data: any): Promise<GPUModel> {
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

async function deleteModel(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/edge-gpu/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete model');
}

async function testModel(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/edge-gpu/${id}/test`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to test model');
    return res.json();
}

// ============================================================================
// Type badge colors
// ============================================================================

const TYPE_COLORS: Record<string, string> = {
    llm: 'bg-purple-100 text-purple-700',
    embedder: 'bg-blue-100 text-blue-700',
    stt: 'bg-green-100 text-green-700',
    tts: 'bg-teal-100 text-teal-700',
    image_gen: 'bg-pink-100 text-pink-700',
    classifier: 'bg-orange-100 text-orange-700',
    vision: 'bg-yellow-100 text-yellow-700',
    translator: 'bg-indigo-100 text-indigo-700',
    summarizer: 'bg-cyan-100 text-cyan-700',
};

const TYPE_LABELS: Record<string, string> = {
    llm: '🔤 LLM',
    embedder: '📊 Embedder',
    stt: '🎤 Speech-to-Text',
    tts: '🔊 Text-to-Speech',
    image_gen: '🖼️ Image Gen',
    classifier: '🏷️ Classifier',
    vision: '👁️ Vision',
    translator: '🌐 Translator',
    summarizer: '📝 Summarizer',
};

// ============================================================================
// Component
// ============================================================================

export const EdgeGPUForm: React.FC<{ withCard?: boolean }> = ({ withCard }) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [deployDialogOpen, setDeployDialogOpen] = useState(false);
    const [selectedCatalogModel, setSelectedCatalogModel] = useState<CatalogModel | null>(null);
    const [selectedEngineId, setSelectedEngineId] = useState('');
    const [catalogFilter, setCatalogFilter] = useState('');
    const [catalogTypeFilter, setCatalogTypeFilter] = useState('all');
    const [testingId, setTestingId] = useState<string | null>(null);

    // Queries
    const { data: gpuModels = [], isLoading: modelsLoading } = useQuery({
        queryKey: ['gpu-models'],
        queryFn: fetchGPUModels,
    });

    const { data: engines = [] } = useQuery({
        queryKey: ['edge-engines'],
        queryFn: fetchEngines,
    });

    const { data: providers = [] } = useQuery({
        queryKey: ['edge-providers'],
        queryFn: fetchProviders,
    });

    // Find first CF provider for catalog fetching
    const cfProvider = providers.find((p: any) => p.provider === 'cloudflare');

    const { data: catalog, isLoading: catalogLoading } = useQuery({
        queryKey: ['gpu-catalog', cfProvider?.id],
        queryFn: () => fetchCatalog(cfProvider.id),
        enabled: !!cfProvider?.id,
    });

    // Mutations
    const deployMut = useMutation({
        mutationFn: deployModel,
        onSuccess: (model) => {
            queryClient.invalidateQueries({ queryKey: ['gpu-models'] });
            toast({ title: 'Model Deployed', description: `${model.name} is ready at ${model.endpoint_url}` });
            setDeployDialogOpen(false);
            setSelectedCatalogModel(null);
        },
        onError: (err: any) => {
            toast({ title: 'Deploy Failed', description: err.message, variant: 'destructive' });
        },
    });

    const deleteMut = useMutation({
        mutationFn: deleteModel,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gpu-models'] });
            toast({ title: 'Model Removed' });
        },
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

    // Get unique model types from catalog
    const catalogTypes = [...new Set(allCatalogModels.map((m) => m.model_type))].sort();

    const handleDeploy = (catalogModel: CatalogModel) => {
        setSelectedCatalogModel(catalogModel);
        setDeployDialogOpen(true);
    };

    const handleConfirmDeploy = () => {
        if (!selectedCatalogModel || !selectedEngineId) return;
        deployMut.mutate({
            name: selectedCatalogModel.name.split('/').pop() || selectedCatalogModel.name,
            model_type: selectedCatalogModel.model_type,
            provider: 'workers_ai',
            model_id: selectedCatalogModel.model_id,
            edge_engine_id: selectedEngineId,
        });
    };

    const handleTest = async (model: GPUModel) => {
        setTestingId(model.id);
        try {
            const result = await testModel(model.id);

            // Parse response intelligently by model type
            let displayText = '';
            if (result.success) {
                const out = result.sample_output;
                // CF Workers AI text generation → choices[].message.content or result.response
                if (out?.choices?.[0]?.message?.content) {
                    displayText = out.choices[0].message.content;
                } else if (out?.choices?.[0]?.text) {
                    displayText = out.choices[0].text;
                } else if (out?.response) {
                    displayText = out.response;
                } else if (out?.result?.response) {
                    displayText = out.result.response;
                    // Embeddings → show shape
                } else if (out?.data?.[0]?.embedding || Array.isArray(out?.[0])) {
                    const vec = out?.data?.[0]?.embedding || out[0];
                    displayText = `Embedding: ${vec.length} dimensions`;
                    // Fallback
                } else {
                    displayText = JSON.stringify(out).slice(0, 120);
                }
            }

            toast({
                title: result.success ? '✅ Inference OK' : '❌ Inference Failed',
                description: result.success
                    ? `${result.latency_ms}ms — "${displayText.slice(0, 150)}"`
                    : result.message,
                variant: result.success ? 'default' : 'destructive',
            });
        } catch (err: any) {
            toast({ title: 'Test Failed', description: err.message, variant: 'destructive' });
        } finally {
            setTestingId(null);
        }
    };

    const copyEndpoint = (url: string) => {
        navigator.clipboard.writeText(url);
        toast({ title: 'Copied', description: 'Endpoint URL copied to clipboard' });
    };

    // CF engines only (have a CF provider)
    const cfEngines = engines.filter((e: any) => e.edge_provider_id);

    const content = (
        <div className="space-y-8">
            {/* ============================================================ */}
            {/* Active GPU Models */}
            {/* ============================================================ */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5" />
                        Active GPU Models
                    </CardTitle>
                    <CardDescription>
                        Deployed AI inference endpoints on your edge engines
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {modelsLoading ? (
                        <div className="flex items-center gap-2 py-4 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading models...
                        </div>
                    ) : gpuModels.length === 0 ? (
                        <p className="text-muted-foreground py-4">
                            No GPU models deployed yet. Browse the catalog below to deploy your first model.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {gpuModels.map((model) => (
                                <div
                                    key={model.id}
                                    className="flex items-center justify-between p-4 rounded-lg border"
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <Cpu className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{model.name}</span>
                                                <Badge className={TYPE_COLORS[model.model_type] || 'bg-gray-100 text-gray-700'} variant="secondary">
                                                    {TYPE_LABELS[model.model_type] || model.model_type}
                                                </Badge>
                                                {model.engine_name && (
                                                    <Badge variant="outline">{model.engine_name}</Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                                <code className="bg-muted px-1.5 py-0.5 rounded">{model.model_id}</code>
                                            </div>
                                            {model.endpoint_url && (
                                                <div className="flex items-center gap-1 mt-1">
                                                    <code className="text-xs text-blue-600">{model.endpoint_url}</code>
                                                    <Button
                                                        variant="ghost" size="sm" className="h-5 w-5 p-0"
                                                        onClick={() => copyEndpoint(model.endpoint_url!)}
                                                    >
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}
                                            {model.schema && (
                                                <details className="mt-2">
                                                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                                        I/O Schema
                                                    </summary>
                                                    <pre className="text-xs mt-1 bg-muted p-2 rounded overflow-x-auto">
                                                        {JSON.stringify(model.schema, null, 2)}
                                                    </pre>
                                                </details>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <Button
                                            variant="outline" size="sm"
                                            onClick={() => handleTest(model)}
                                            disabled={testingId === model.id}
                                        >
                                            {testingId === model.id
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : <Zap className="h-4 w-4" />
                                            }
                                            Test
                                        </Button>
                                        <Button
                                            variant="ghost" size="sm"
                                            onClick={() => deleteMut.mutate(model.id)}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* Model Catalog */}
            {/* ============================================================ */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        Model Catalog
                        {catalog && (
                            <Badge variant="secondary">{catalog.total} models</Badge>
                        )}
                    </CardTitle>
                    <CardDescription>
                        Browse available AI models from Cloudflare Workers AI. Click "Deploy" to add to an engine.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!cfProvider ? (
                        <p className="text-muted-foreground py-4">
                            Connect a Cloudflare provider in the Edge Compute tab to browse the AI model catalog.
                        </p>
                    ) : catalogLoading ? (
                        <div className="flex items-center gap-2 py-4 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading catalog from Cloudflare Workers AI...
                        </div>
                    ) : (
                        <>
                            {/* Filters */}
                            <div className="flex items-center gap-3 mb-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search models..."
                                        value={catalogFilter}
                                        onChange={(e) => setCatalogFilter(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>
                                <Select value={catalogTypeFilter} onValueChange={setCatalogTypeFilter}>
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="All Types" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Types</SelectItem>
                                        {catalogTypes.map((t) => (
                                            <SelectItem key={t} value={t}>
                                                {TYPE_LABELS[t] || t}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Model grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto">
                                {filteredCatalog.slice(0, 50).map((model) => (
                                    <div
                                        key={model.model_id}
                                        className="p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-sm truncate">
                                                    {model.name.split('/').pop()}
                                                </div>
                                                <Badge className={`${TYPE_COLORS[model.model_type] || 'bg-gray-100 text-gray-700'} mt-1`} variant="secondary">
                                                    {TYPE_LABELS[model.model_type] || model.model_type}
                                                </Badge>
                                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                    {model.description || model.model_id}
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleDeploy(model)}
                                                className="flex-shrink-0"
                                            >
                                                <Plus className="h-3 w-3 mr-1" />
                                                Deploy
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {filteredCatalog.length > 50 && (
                                <p className="text-xs text-muted-foreground mt-2">
                                    Showing 50 of {filteredCatalog.length} models. Use search to narrow results.
                                </p>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* Deploy Dialog */}
            {/* ============================================================ */}
            <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Deploy GPU Model</DialogTitle>
                        <DialogDescription>
                            Deploy <strong>{selectedCatalogModel?.name.split('/').pop()}</strong> to an Edge Engine.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedCatalogModel && (
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium">Model</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <code className="bg-muted px-2 py-1 rounded text-sm">{selectedCatalogModel.model_id}</code>
                                    <Badge className={TYPE_COLORS[selectedCatalogModel.model_type] || ''} variant="secondary">
                                        {TYPE_LABELS[selectedCatalogModel.model_type] || selectedCatalogModel.model_type}
                                    </Badge>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium">Target Edge Engine</label>
                                <Select value={selectedEngineId} onValueChange={setSelectedEngineId}>
                                    <SelectTrigger className="mt-1">
                                        <SelectValue placeholder="Select an edge engine..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {cfEngines.map((engine: any) => (
                                            <SelectItem key={engine.id} value={engine.id}>
                                                {engine.name} ({engine.url})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {cfEngines.length === 0 && (
                                    <p className="text-xs text-destructive mt-1">
                                        No Cloudflare engines found. Deploy an edge engine first.
                                    </p>
                                )}
                            </div>

                            {selectedCatalogModel.schema && (
                                <div>
                                    <label className="text-sm font-medium">I/O Schema</label>
                                    <pre className="text-xs mt-1 bg-muted p-2 rounded overflow-x-auto">
                                        {JSON.stringify(selectedCatalogModel.schema, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeployDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirmDeploy}
                            disabled={!selectedEngineId || deployMut.isPending}
                        >
                            {deployMut.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Zap className="h-4 w-4 mr-2" />
                            )}
                            Deploy Model
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );

    return content;
};
