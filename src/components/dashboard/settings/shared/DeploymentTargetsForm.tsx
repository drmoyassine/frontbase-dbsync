/**
 * DeploymentTargetsForm
 * 
 * Settings form for managing edge deployment targets.
 * Supports CRUD operations for registering edge providers
 * (Cloudflare, Vercel, Docker, etc.).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, Cloud, Server, Globe, Check, X, Rocket } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface DeploymentTarget {
    id: string;
    name: string;
    provider: string;
    adapter_type: string;
    url: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface DeploymentTargetsFormProps {
    withCard?: boolean;
}

const PROVIDER_OPTIONS = [
    { value: 'cloudflare', label: 'Cloudflare Workers', icon: Cloud },
    { value: 'vercel', label: 'Vercel Edge', icon: Globe },
    { value: 'netlify', label: 'Netlify Edge', icon: Globe },
    { value: 'docker', label: 'Docker / Self-Hosted', icon: Server },
    { value: 'flyio', label: 'Fly.io', icon: Rocket },
];

const SCOPE_OPTIONS = [
    { value: 'pages', label: 'Pages (SSR)' },
    { value: 'automations', label: 'Automations (Workflows)' },
    { value: 'full', label: 'Full (Pages + Automations)' },
];

export const DeploymentTargetsForm: React.FC<DeploymentTargetsFormProps> = ({ withCard = false }) => {
    const [targets, setTargets] = useState<DeploymentTarget[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // New target form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newProvider, setNewProvider] = useState('cloudflare');
    const [newScope, setNewScope] = useState('pages');
    const [newUrl, setNewUrl] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Fetch targets
    const fetchTargets = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/deployment-targets`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setTargets(data);
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTargets();
    }, [fetchTargets]);

    // Create target
    const handleCreate = async () => {
        setIsCreating(true);
        try {
            const res = await fetch(`${API_BASE}/api/deployment-targets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName,
                    provider: newProvider,
                    adapter_type: newScope,
                    url: newUrl,
                    is_active: true,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setShowAddForm(false);
            setNewName('');
            setNewUrl('');
            setNewProvider('cloudflare');
            setNewScope('pages');
            await fetchTargets();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsCreating(false);
        }
    };

    // Toggle active
    const handleToggle = async (target: DeploymentTarget) => {
        try {
            const res = await fetch(`${API_BASE}/api/deployment-targets/${target.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !target.is_active }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            await fetchTargets();
        } catch (e: any) {
            setError(e.message);
        }
    };

    // Delete target
    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/deployment-targets/${id}`, {
                method: 'DELETE',
            });
            if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
            await fetchTargets();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setDeletingId(null);
        }
    };

    const getProviderIcon = (provider: string) => {
        const opt = PROVIDER_OPTIONS.find(p => p.value === provider);
        const Icon = opt?.icon || Server;
        return <Icon className="h-4 w-4" />;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const formContent = (
        <div className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <X className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Existing targets */}
            {targets.length === 0 && !showAddForm ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Cloud className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>No deployment targets configured</p>
                    <p className="text-sm mt-1">Add a target to enable multi-provider publishing</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {targets.map((target) => (
                        <div
                            key={target.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    {getProviderIcon(target.provider)}
                                    <span className="font-medium">{target.name}</span>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                    {target.provider}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                    {target.adapter_type}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {target.url}
                                </span>
                                <Switch
                                    checked={target.is_active}
                                    onCheckedChange={() => handleToggle(target)}
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDelete(target.id)}
                                    disabled={deletingId === target.id}
                                >
                                    {deletingId === target.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add form */}
            {showAddForm && (
                <div className="p-4 rounded-lg border border-dashed space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="dt-name">Name</Label>
                            <Input
                                id="dt-name"
                                placeholder="e.g. Production Cloudflare"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dt-url">URL</Label>
                            <Input
                                id="dt-url"
                                placeholder="https://my-site.pages.dev"
                                value={newUrl}
                                onChange={(e) => setNewUrl(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Provider</Label>
                            <Select value={newProvider} onValueChange={setNewProvider}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PROVIDER_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Scope</Label>
                            <Select value={newScope} onValueChange={setNewScope}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SCOPE_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={handleCreate}
                            disabled={!newName || !newUrl || isCreating}
                        >
                            {isCreating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Check className="mr-2 h-4 w-4" />
                                    Add Target
                                </>
                            )}
                        </Button>
                        <Button variant="ghost" onClick={() => setShowAddForm(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {/* Add button */}
            {!showAddForm && (
                <Button variant="outline" onClick={() => setShowAddForm(true)} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Deployment Target
                </Button>
            )}

            <Alert>
                <Rocket className="h-4 w-4" />
                <AlertDescription>
                    When you publish a page, it will automatically be pushed to all active
                    deployment targets. The primary strategy (Turso/Local) runs first, then
                    the page is fanned out to each target via HTTP POST.
                </AlertDescription>
            </Alert>
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Cloud className="h-5 w-5" />
                        Deployment Targets
                    </CardTitle>
                    <CardDescription>
                        Register edge providers to publish pages to multiple platforms simultaneously
                    </CardDescription>
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
};
