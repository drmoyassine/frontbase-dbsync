/**
 * EdgeCachesForm
 * 
 * CRUD management for named edge cache connections (Upstash, Redis, etc.).
 * Uses a Dialog modal for create/edit — mirrors the EdgeProvidersSection pattern.
 */

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEdgeCaches, EdgeCache } from '@/hooks/useEdgeInfrastructure';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
    Plus, Trash2, Pencil, Loader2, Check, X,
    Star, Shield, Zap, AlertTriangle, Cloud, Server,
} from 'lucide-react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const API_BASE = '';

interface TestResult {
    success: boolean;
    message: string;
    latency_ms?: number;
}

interface EdgeCachesFormProps {
    withCard?: boolean;
}

const CACHE_PROVIDER_OPTIONS = [
    { value: 'upstash', label: 'Upstash Redis', icon: Cloud, placeholder: 'https://xxx.upstash.io' },
    { value: 'redis', label: 'Self-Hosted Redis', icon: Server, placeholder: 'redis://host:6379' },
    { value: 'dragonfly', label: 'Dragonfly', icon: Server, placeholder: 'redis://host:6379' },
];

// Cache-specific icon
const CacheIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 2v4" /><path d="m16.24 7.76-2.12 2.12" /><path d="M20 12h-4" />
        <path d="m16.24 16.24-2.12-2.12" /><path d="M12 18v4" /><path d="m7.76 16.24 2.12-2.12" />
        <path d="M4 12h4" /><path d="m7.76 7.76 2.12 2.12" />
    </svg>
);

export const EdgeCachesForm: React.FC<EdgeCachesFormProps> = ({ withCard = false }) => {
    const queryClient = useQueryClient();
    const { data: caches = [], isLoading } = useEdgeCaches();
    const [error, setError] = useState<string | null>(null);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form fields
    const [selectedProvider, setSelectedProvider] = useState<string>('upstash');
    const [formName, setFormName] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formToken, setFormToken] = useState('');
    const [formIsDefault, setFormIsDefault] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Test connection
    const [testingId, setTestingId] = useState<string | null>(null);

    // Delete
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const refetchCaches = () => queryClient.invalidateQueries({ queryKey: ['edge-caches'] });

    const resetForm = () => {
        setEditingId(null);
        setSelectedProvider('upstash');
        setFormName('');
        setFormUrl('');
        setFormToken('');
        setFormIsDefault(false);
        setError(null);
    };

    const openCreate = () => {
        resetForm();
        setDialogOpen(true);
    };

    const openEdit = (cache: EdgeCache) => {
        resetForm();
        setEditingId(cache.id);
        setSelectedProvider(cache.provider);
        setFormName(cache.name);
        setFormUrl(cache.cache_url);
        setFormIsDefault(cache.is_default);
        setDialogOpen(true);
    };

    // Save (create or update)
    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const payload: any = {
                name: formName,
                provider: selectedProvider,
                cache_url: formUrl,
                is_default: formIsDefault,
            };
            if (formToken) payload.cache_token = formToken;

            const url = editingId
                ? `${API_BASE}/api/edge-caches/${editingId}`
                : `${API_BASE}/api/edge-caches/`;
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            setDialogOpen(false);
            resetForm();
            refetchCaches();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    // Delete
    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/edge-caches/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            refetchCaches();
        } catch (e: any) { setError(e.message); }
        finally { setDeletingId(null); }
    };

    // ─── Single toast ───
    const showTestToast = (result: TestResult, label: string) => {
        toast.custom((id) => (
            <div
                className="w-[356px] rounded-lg border bg-background shadow-lg p-3 space-y-2"
                style={{ pointerEvents: 'auto' }}
            >
                <div className="flex items-center gap-2.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${result.success ? 'bg-emerald-500' : 'bg-red-500'
                        }`}>
                        {result.success
                            ? <Check className="h-3 w-3 text-white" />
                            : <X className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{label}</span>
                        <span className="text-xs text-muted-foreground ml-2">{result.message}</span>
                    </div>
                </div>
            </div>
        ), { duration: result.success ? 4000 : 8000 });
    };

    // Test saved cache
    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/edge-caches/${id}/test`, { method: 'POST' });
            const data: TestResult = await res.json();
            const cache = caches.find(c => c.id === id);
            const label = CACHE_PROVIDER_OPTIONS.find(p => p.value === cache?.provider)?.label || 'Cache';
            showTestToast(data, label);
        } catch (e: any) {
            toast.error('Test failed', { description: e.message });
        } finally { setTestingId(null); }
    };

    // Test inline (before saving, inside dialog)
    const handleTestInline = async () => {
        setTestingId('inline');
        try {
            const providerLabel = CACHE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.label || 'Cache';

            if (editingId && !formToken) {
                const res = await fetch(`${API_BASE}/api/edge-caches/${editingId}/test`, { method: 'POST' });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            } else {
                const res = await fetch(`${API_BASE}/api/edge-caches/test-connection`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formName || 'Test',
                        provider: selectedProvider,
                        cache_url: formUrl,
                        cache_token: formToken || null,
                    }),
                });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            }
        } catch (e: any) {
            toast.error('Test failed', { description: e.message });
        } finally { setTestingId(null); }
    };

    const getProviderIcon = (provider: string) => {
        const opt = CACHE_PROVIDER_OPTIONS.find(p => p.value === provider);
        const Icon = opt?.icon || CacheIcon;
        return <Icon className="h-4 w-4" />;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // ─── Modal dialog for create / edit ───
    const cacheDialog = (
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
            <DialogTrigger asChild>
                <Button size="sm" onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-2" /> Connect Cache
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingId ? 'Edit Cache' : 'Connect Edge Cache'}</DialogTitle>
                    <DialogDescription>
                        {editingId
                            ? 'Update your cache connection settings.'
                            : 'Add a new cache connection for your edge deployments.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Provider selector */}
                    <div className="space-y-2">
                        <Label>Provider</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {CACHE_PROVIDER_OPTIONS.map(opt => {
                                const Icon = opt.icon;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setSelectedProvider(opt.value)}
                                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors text-left
                                            ${selectedProvider === opt.value
                                                ? 'border-primary bg-primary/5 text-primary'
                                                : 'border-border hover:bg-accent'
                                            }`}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Name + URL */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Name</Label>
                            <Input
                                placeholder={`e.g. Production ${selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)}`}
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>Cache URL</Label>
                            <Input
                                placeholder={CACHE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.placeholder}
                                value={formUrl}
                                onChange={e => setFormUrl(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Auth Token */}
                    <div className="space-y-1">
                        <Label>Auth Token</Label>
                        <Input
                            type="password"
                            placeholder={editingId ? '(leave blank to keep existing)' : 'Cache auth token'}
                            value={formToken}
                            onChange={e => setFormToken(e.target.value)}
                        />
                    </div>

                    {/* Default toggle */}
                    <div className="flex items-center gap-2">
                        <Switch
                            id="edge-cache-default-modal"
                            checked={formIsDefault}
                            onCheckedChange={setFormIsDefault}
                        />
                        <Label htmlFor="edge-cache-default-modal" className="text-sm cursor-pointer">
                            Set as default cache
                        </Label>
                    </div>

                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={handleTestInline}
                        disabled={!formUrl || testingId === 'inline'}
                    >
                        {testingId === 'inline' ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing...</>
                        ) : (
                            <><Zap className="mr-2 h-4 w-4" /> Test Connection</>
                        )}
                    </Button>
                    <Button onClick={handleSave} disabled={!formName || !formUrl || isSaving}>
                        {isSaving ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                        ) : (
                            <><Check className="mr-2 h-4 w-4" /> {editingId ? 'Update' : 'Add Cache'}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );

    // ─── Cache list ───
    const cacheList = (
        <div className="space-y-4">


            {caches.length === 0 ? (
                <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                    <CacheIcon className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <h3 className="text-sm font-medium">No Caches Connected</h3>
                    <p className="text-sm text-muted-foreground mt-1">Add a cache to speed up edge responses.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {caches.map((cache) => (
                        <div key={cache.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:border-primary/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                                    {getProviderIcon(cache.provider)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-sm">{cache.name}</h4>
                                        <Badge variant="outline" className="text-xs">{cache.provider}</Badge>
                                        {cache.is_default && (
                                            <Badge variant="secondary" className="text-xs gap-1">
                                                <Star className="h-3 w-3" /> Default
                                            </Badge>
                                        )}
                                        {cache.is_system && (
                                            <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                                                <Shield className="h-3 w-3" /> System
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[300px]">{cache.cache_url}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {cache.engine_count > 0 && (
                                    <Badge variant="secondary" className="text-xs">
                                        {cache.engine_count} engine{cache.engine_count > 1 ? 's' : ''}
                                    </Badge>
                                )}
                                <Button
                                    variant="ghost" size="icon"
                                    onClick={() => handleTest(cache.id)}
                                    disabled={testingId === cache.id}
                                    title="Test connection"
                                >
                                    {testingId === cache.id
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Zap className="h-4 w-4" />}
                                </Button>
                                {!cache.is_system && (
                                    <>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(cache)} title="Edit">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="ghost" size="icon"
                                                    disabled={deletingId === cache.id}
                                                >
                                                    {deletingId === cache.id
                                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                                        : <Trash2 className="h-4 w-4 text-destructive" />}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete "{cache.name}"?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This removes the cache connection from Frontbase. The actual cache is not affected.
                                                        {cache.engine_count > 0 && (
                                                            <span className="block mt-2 font-medium text-destructive">
                                                                ⚠ {cache.engine_count} edge engine{cache.engine_count > 1 ? 's' : ''} use this cache and will need to be reconfigured.
                                                            </span>
                                                        )}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDelete(cache.id)}
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                    >
                                                        Delete
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <CacheIcon className="h-5 w-5" />
                            Edge Caches
                        </CardTitle>
                        <CardDescription>
                            Manage edge cache connections for your deployment targets
                        </CardDescription>
                    </div>
                    {cacheDialog}
                </CardHeader>
                <CardContent>{cacheList}</CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-medium flex items-center gap-2">
                        <CacheIcon className="h-5 w-5" /> Edge Caches
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Manage edge cache connections for your deployment targets
                    </p>
                </div>
                {cacheDialog}
            </div>
            {cacheList}
        </div>
    );
};
