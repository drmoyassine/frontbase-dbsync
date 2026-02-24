/**
 * DeploymentTargetsForm
 * 
 * Unified deployment targets management.
 * When adding a target, the user selects a provider:
 * - Cloudflare: Shows API token + one-click deploy flow
 * - Docker/Manual: Shows simple URL input
 * - Vercel/Netlify/Fly.io: Simple URL input (future: API-based deploy)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Loader2, Plus, Trash2, Cloud, Server, Globe, Check, X,
    Rocket, Eye, EyeOff, ExternalLink, Info, AlertTriangle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const API_BASE = '';

interface DeploymentTarget {
    id: string;
    name: string;
    provider: string;
    adapter_type: string;
    url: string;
    edge_db_id: string | null;
    edge_db_name?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface EdgeDatabase {
    id: string;
    name: string;
    provider: string;
    db_url: string;
    has_token: boolean;
    is_default: boolean;
}

interface DeploymentTargetsFormProps {
    withCard?: boolean;
}

const PROVIDER_OPTIONS = [
    { value: 'cloudflare', label: 'Cloudflare Workers', icon: Cloud, needsDeploy: true },
    { value: 'docker', label: 'Docker / Self-Hosted', icon: Server, needsDeploy: false },
    { value: 'vercel', label: 'Vercel Edge', icon: Globe, needsDeploy: false },
    { value: 'netlify', label: 'Netlify Edge', icon: Globe, needsDeploy: false },
    { value: 'flyio', label: 'Fly.io', icon: Rocket, needsDeploy: false },
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

    // Add flow state
    const [showAddFlow, setShowAddFlow] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

    // Manual target fields
    const [newName, setNewName] = useState('');
    const [newScope, setNewScope] = useState('pages');
    const [newUrl, setNewUrl] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Cloudflare deploy fields
    const [cfToken, setCfToken] = useState('');
    const [cfWorkerName, setCfWorkerName] = useState('frontbase-edge');
    const [cfAccountId, setCfAccountId] = useState('');
    const [showCfToken, setShowCfToken] = useState(false);
    const [showCfSecrets, setShowCfSecrets] = useState(false);
    const [cfEdgeDbId, setCfEdgeDbId] = useState<string>('');
    const [cfUpstashUrl, setCfUpstashUrl] = useState('');
    const [cfUpstashToken, setCfUpstashToken] = useState('');
    const [isDeploying, setIsDeploying] = useState(false);
    const [edgeDatabases, setEdgeDatabases] = useState<EdgeDatabase[]>([]);

    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Fetch targets
    const fetchTargets = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/deployment-targets/`);
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

    useEffect(() => { fetchTargets(); }, [fetchTargets]);

    // Fetch edge databases for the dropdown
    const fetchEdgeDbs = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/edge-databases/`);
            if (!res.ok) return;
            const data = await res.json();
            setEdgeDatabases(data);
            // Auto-select default
            const defaultDb = data.find((d: EdgeDatabase) => d.is_default);
            if (defaultDb && !cfEdgeDbId) setCfEdgeDbId(defaultDb.id);
        } catch { }
    }, []);
    useEffect(() => { fetchEdgeDbs(); }, [fetchEdgeDbs]);

    const resetAddFlow = () => {
        setShowAddFlow(false);
        setSelectedProvider(null);
        setNewName('');
        setNewUrl('');
        setNewScope('pages');
        setCfToken('');
        setCfWorkerName('frontbase-edge');
        setCfAccountId('');
        setShowCfSecrets(false);
        setCfTursoUrl('');
        setCfTursoToken('');
        setCfUpstashUrl('');
        setCfUpstashToken('');
    };

    // Manual target creation
    const handleCreateManual = async () => {
        setIsCreating(true);
        try {
            const res = await fetch(`${API_BASE}/api/deployment-targets/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName,
                    provider: selectedProvider,
                    adapter_type: newScope,
                    url: newUrl,
                    is_active: true,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            resetAddFlow();
            await fetchTargets();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsCreating(false);
        }
    };

    // Cloudflare one-click deploy
    const handleCloudflareDeply = async () => {
        setIsDeploying(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/cloudflare/deploy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_token: cfToken,
                    account_id: cfAccountId || undefined,
                    worker_name: cfWorkerName,
                    edge_db_id: cfEdgeDbId || undefined,
                    upstash_url: cfUpstashUrl || undefined,
                    upstash_token: cfUpstashToken || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                const errMsg = typeof data.detail === 'string' ? data.detail
                    : data.detail?.msg || data.error || data.message || JSON.stringify(data.detail) || 'Connection failed';
                throw new Error(errMsg);
            }
            localStorage.setItem('cf_api_token', cfToken);
            localStorage.setItem('cf_worker_name', cfWorkerName);
            if (data.account_id) localStorage.setItem('cf_account_id', data.account_id);

            resetAddFlow();
            await fetchTargets();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsDeploying(false);
        }
    };

    // Toggle active
    const handleToggle = async (target: DeploymentTarget) => {
        try {
            await fetch(`${API_BASE}/api/deployment-targets/${target.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !target.is_active }),
            });
            await fetchTargets();
        } catch (e: any) { setError(e.message); }
    };

    // Delete target
    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            await fetch(`${API_BASE}/api/deployment-targets/${id}`, { method: 'DELETE' });
            await fetchTargets();
        } catch (e: any) { setError(e.message); }
        finally { setDeletingId(null); }
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

    // Provider selection step
    const providerSelectionStep = (
        <div className="p-4 rounded-lg border border-dashed space-y-4">
            <Label className="text-sm font-medium">Select a provider</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PROVIDER_OPTIONS.map(opt => {
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

            {/* Cloudflare deploy flow */}
            {selectedProvider === 'cloudflare' && (
                <div className="space-y-4 pt-2 border-t">
                    <div className="space-y-2">
                        <Label htmlFor="cf-token">Cloudflare API Token</Label>
                        <div className="flex gap-2">
                            <Input
                                id="cf-token"
                                type={showCfToken ? 'text' : 'password'}
                                placeholder="Your API token with Workers Scripts: Edit permission"
                                value={cfToken}
                                onChange={(e) => setCfToken(e.target.value)}
                                className="flex-1"
                            />
                            <Button variant="ghost" size="icon" onClick={() => setShowCfToken(!showCfToken)} type="button">
                                {showCfToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Create at{' '}
                            <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" className="underline">
                                dash.cloudflare.com/profile/api-tokens
                            </a>
                            {' '}→ Custom Token → Workers Scripts: Edit + Account Settings: Read
                        </p>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-sm">Worker Name</Label>
                        <Input value={cfWorkerName} onChange={(e) => setCfWorkerName(e.target.value)} />
                        <p className="text-xs text-muted-foreground">Your Worker will be available at {cfWorkerName}.your-subdomain.workers.dev</p>
                    </div>

                    {/* Expandable secrets */}
                    <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                        onClick={() => setShowCfSecrets(!showCfSecrets)}
                    >
                        <Info className="h-3 w-3" />
                        {showCfSecrets ? 'Hide' : 'Show'} Worker Secrets (optional — auto-populated from settings)
                    </button>

                    {showCfSecrets && (
                        <div className="space-y-3 p-3 rounded border border-dashed bg-muted/30">
                            {/* Edge Database selector */}
                            <div className="space-y-1">
                                <Label className="text-xs font-medium">Edge Database</Label>
                                {edgeDatabases.length > 0 ? (
                                    <Select value={cfEdgeDbId} onValueChange={setCfEdgeDbId}>
                                        <SelectTrigger className="text-sm">
                                            <SelectValue placeholder="Select edge database..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {edgeDatabases.map(db => (
                                                <SelectItem key={db.id} value={db.id}>
                                                    {db.name} ({db.provider}){db.is_default ? ' ★' : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <p className="text-xs text-muted-foreground italic">No edge databases configured. Add one in the Edge Databases section above.</p>
                                )}
                            </div>
                            {/* Upstash fields */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs">Upstash URL</Label>
                                    <Input type="password" placeholder="https://..." value={cfUpstashUrl} onChange={(e) => setCfUpstashUrl(e.target.value)} className="text-sm" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Upstash Token</Label>
                                    <Input type="password" placeholder="Token" value={cfUpstashToken} onChange={(e) => setCfUpstashToken(e.target.value)} className="text-sm" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button onClick={handleCloudflareDeply} disabled={!cfToken || isDeploying}>
                            {isDeploying ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...</>
                            ) : (
                                <><Cloud className="mr-2 h-4 w-4" /> Connect Cloudflare</>
                            )}
                        </Button>
                        <Button variant="ghost" onClick={resetAddFlow}>Cancel</Button>
                    </div>
                </div>
            )}

            {/* Manual URL flow (all other providers) */}
            {selectedProvider && selectedProvider !== 'cloudflare' && (
                <div className="space-y-4 pt-2 border-t">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Name</Label>
                            <Input placeholder="e.g. Production Docker" value={newName} onChange={(e) => setNewName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>URL</Label>
                            <Input placeholder="https://edge.mysite.com" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label>Scope</Label>
                        <Select value={newScope} onValueChange={setNewScope}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {SCOPE_OPTIONS.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleCreateManual} disabled={!newName || !newUrl || isCreating}>
                            {isCreating ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</>
                            ) : (
                                <><Check className="mr-2 h-4 w-4" /> Add Target</>
                            )}
                        </Button>
                        <Button variant="ghost" onClick={resetAddFlow}>Cancel</Button>
                    </div>
                </div>
            )}

            {/* Cancel if no provider selected yet */}
            {!selectedProvider && (
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

            {/* Existing targets */}
            {targets.length === 0 && !showAddFlow ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Cloud className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>No deployment targets configured</p>
                    <p className="text-sm mt-1">Add a target to deploy your Edge Engine to the cloud</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {targets.map((target) => (
                        <div key={target.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                            <div className="flex items-center gap-3">
                                {getProviderIcon(target.provider)}
                                <span className="font-medium">{target.name}</span>
                                <Badge variant="outline" className="text-xs">{target.provider}</Badge>
                                <Badge variant="secondary" className="text-xs">{target.adapter_type}</Badge>
                            </div>
                            <div className="flex items-center gap-3">
                                <a href={`${target.url}/api/health`} target="_blank" rel="noopener noreferrer"
                                    className="text-xs text-muted-foreground hover:underline truncate max-w-[200px]">
                                    {target.url}
                                </a>
                                <Switch checked={target.is_active} onCheckedChange={() => handleToggle(target)} />
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(target.id)} disabled={deletingId === target.id}>
                                    {deletingId === target.id
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Trash2 className="h-4 w-4 text-destructive" />}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add flow or button */}
            {showAddFlow ? providerSelectionStep : (
                <Button variant="outline" onClick={() => setShowAddFlow(true)} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Deployment Target
                </Button>
            )}
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
                        Deploy your Edge Engine and manage publishing targets
                    </CardDescription>
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
};
