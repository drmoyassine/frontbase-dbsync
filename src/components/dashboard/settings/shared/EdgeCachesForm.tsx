/**
 * EdgeCachesForm
 * 
 * CRUD management for named edge cache connections (Upstash, Redis, etc.).
 * Mirrors the EdgeDatabasesForm pattern exactly.
 */

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEdgeCaches } from '@/hooks/useEdgeInfrastructure';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

interface EdgeCache {
    id: string;
    name: string;
    provider: string;
    cache_url: string;
    has_token: boolean;
    is_default: boolean;
    is_system: boolean;
    created_at: string;
    updated_at: string;
    engine_count: number;
}

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

    // Add flow state
    const [showAddFlow, setShowAddFlow] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

    // Form fields
    const [formName, setFormName] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formToken, setFormToken] = useState('');
    const [formIsDefault, setFormIsDefault] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Edit mode
    const [editingId, setEditingId] = useState<string | null>(null);

    // Test connection
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    // Delete
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const refetchCaches = () => queryClient.invalidateQueries({ queryKey: ['edge-caches'] });

    const resetAddFlow = () => {
        setShowAddFlow(false);
        setSelectedProvider(null);
        setEditingId(null);
        setFormName('');
        setFormUrl('');
        setFormToken('');
        setFormIsDefault(false);
        setTestResult(null);
    };

    const startEdit = (cache: EdgeCache) => {
        setEditingId(cache.id);
        setSelectedProvider(cache.provider);
        setFormName(cache.name);
        setFormUrl(cache.cache_url);
        setFormToken('');
        setFormIsDefault(cache.is_default);
        setShowAddFlow(true);
        setTestResult(null);
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
            resetAddFlow();
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

    // Test saved cache
    const handleTest = async (id: string) => {
        setTestingId(id);
        setTestResult(null);
        try {
            const res = await fetch(`${API_BASE}/api/edge-caches/${id}/test`, { method: 'POST' });
            const data = await res.json();
            setTestResult({ ...data, _cacheId: id } as any);
        } catch (e: any) {
            setTestResult({ success: false, message: e.message } as any);
        } finally { setTestingId(null); }
    };

    // Test inline (before saving)
    const handleTestInline = async () => {
        setTestingId('inline');
        setTestResult(null);
        try {
            const res = await fetch(`${API_BASE}/api/edge-caches/test-connection/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formName || 'Test',
                    provider: selectedProvider,
                    cache_url: formUrl,
                    cache_token: formToken || null,
                }),
            });
            const data = await res.json();
            setTestResult(data);
        } catch (e: any) {
            setTestResult({ success: false, message: e.message });
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

    // ─── Provider selection + connection form (shown when adding) ───
    const providerSelectionStep = (
        <div className="p-4 rounded-lg border border-dashed space-y-4">
            <Label className="text-sm font-medium">
                {editingId ? 'Edit Cache' : 'Select a provider'}
            </Label>

            {/* Provider buttons */}
            {!editingId && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {CACHE_PROVIDER_OPTIONS.map(opt => {
                        const Icon = opt.icon;
                        return (
                            <button
                                key={opt.value}
                                onClick={() => setSelectedProvider(opt.value)}
                                className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors text-left
                                    ${selectedProvider === opt.value
                                        ? 'border-primary bg-primary/5 text-primary'
                                        : 'border-border hover:bg-accent'
                                    }`}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Connection form (shows after provider selected) */}
            {selectedProvider && (
                <div className="space-y-4 pt-2 border-t">
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

                    <div className="space-y-1">
                        <Label>Auth Token</Label>
                        <Input
                            type="password"
                            placeholder={editingId ? '(leave blank to keep existing)' : 'Cache auth token'}
                            value={formToken}
                            onChange={e => setFormToken(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Switch
                            id="edge-cache-default"
                            checked={formIsDefault}
                            onCheckedChange={setFormIsDefault}
                        />
                        <Label htmlFor="edge-cache-default" className="text-sm cursor-pointer">
                            Set as default cache
                        </Label>
                    </div>

                    {/* Test result */}
                    {testResult && (
                        <Alert variant={testResult.success ? 'default' : 'destructive'}>
                            {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                            <AlertDescription>
                                {testResult.message}
                                {testResult.latency_ms != null && ` (${testResult.latency_ms}ms)`}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="flex gap-2">
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
                        <Button variant="ghost" onClick={resetAddFlow}>Cancel</Button>
                    </div>
                </div>
            )}

            {/* Cancel if no provider selected yet */}
            {!selectedProvider && !editingId && (
                <Button variant="ghost" onClick={resetAddFlow} className="w-full">Cancel</Button>
            )}
        </div>
    );

    const formContent = (
        <div className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Existing caches list */}
            {caches.length === 0 && !showAddFlow ? (
                <div className="text-center py-8 text-muted-foreground">
                    <CacheIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>No edge caches configured</p>
                    <p className="text-sm mt-1">Add a cache to speed up your edge responses</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {caches.map((cache) => (
                        <div key={cache.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                            <div className="flex items-center gap-3">
                                {getProviderIcon(cache.provider)}
                                <span className="font-medium">{cache.name}</span>
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
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {cache.cache_url}
                                </span>
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
                                        <Button variant="ghost" size="icon" onClick={() => startEdit(cache)} title="Edit">
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

            {/* Test result for list items */}
            {testResult && !showAddFlow && (
                <Alert variant={testResult.success ? 'default' : 'destructive'}>
                    {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    <AlertDescription>
                        {testResult.message}
                        {testResult.latency_ms != null && ` (${testResult.latency_ms}ms)`}
                    </AlertDescription>
                </Alert>
            )}

            {/* Add flow or button */}
            {showAddFlow ? providerSelectionStep : (
                <Button variant="outline" onClick={() => { setShowAddFlow(true); setError(null); setTestResult(null); }} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Cache
                </Button>
            )}
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CacheIcon className="h-5 w-5" />
                        Edge Caches
                    </CardTitle>
                    <CardDescription>
                        Manage edge cache connections for your deployment targets
                    </CardDescription>
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
};
