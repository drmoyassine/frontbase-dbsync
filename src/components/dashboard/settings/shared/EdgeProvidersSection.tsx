import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cloud, Plus, Trash2, Loader2, AlertTriangle, Shield, Server, CheckCircle2, XCircle, Zap } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useEdgeProviders, edgeInfrastructureApi } from '@/hooks/useEdgeInfrastructure';
import { API_BASE, PROVIDER_ICONS } from './edgeConstants';
import { ImportCloudflareWorkers } from './ImportCloudflareWorkers';

// ── Provider credential form configs ─────────────────────────────────
const PROVIDER_CONFIGS: Record<string, {
    label: string;
    defaultName: string;
    fields: { key: string; label: string; placeholder: string; type?: string; required?: boolean }[];
    helpText?: React.ReactNode;
}> = {
    cloudflare: {
        label: 'Cloudflare Workers',
        defaultName: 'Cloudflare Account',
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'Cloudflare API Token', type: 'password', required: true },
        ],
        helpText: <>Requires "Workers Scripts: Edit" and "Account Settings: Read". <a href="https://dash.cloudflare.com/profile/api-tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Create token →</a></>,
    },
    supabase: {
        label: 'Supabase Edge Functions',
        defaultName: 'Supabase Project',
        fields: [
            { key: 'access_token', label: 'Access Token', placeholder: 'sbp_...', type: 'password', required: true },
            { key: 'project_ref', label: 'Project Ref', placeholder: 'abcdefghij', required: true },
        ],
        helpText: <><a href="https://supabase.com/dashboard/account/tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Generate access token →</a> Project ref is in Settings → General.</>,
    },
    upstash: {
        label: 'Upstash Workflows',
        defaultName: 'Upstash Account',
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'Upstash API Token', type: 'password', required: true },
            { key: 'email', label: 'Email', placeholder: 'you@example.com', required: true },
        ],
        helpText: <><a href="https://console.upstash.com/account/api?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Get API key →</a> Found in Console → Account → Management API.</>,
    },
    vercel: {
        label: 'Vercel Edge Functions',
        defaultName: 'Vercel Account',
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'Vercel API Token', type: 'password', required: true },
            { key: 'team_id', label: 'Team ID', placeholder: 'team_... (optional)' },
        ],
        helpText: <><a href="https://vercel.com/account/tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Create token →</a> Team ID is optional for personal accounts.</>,
    },
    netlify: {
        label: 'Netlify Edge Functions',
        defaultName: 'Netlify Account',
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'nfp_...', type: 'password', required: true },
            { key: 'site_id', label: 'Site ID', placeholder: 'Your Netlify site ID', required: true },
        ],
        helpText: <><a href="https://app.netlify.com/user/applications#personal-access-tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Create token →</a> Site ID is in Site Settings → General.</>,
    },
    deno: {
        label: 'Deno Deploy',
        defaultName: 'Deno Deploy Account',
        fields: [
            { key: 'access_token', label: 'Organization Token', placeholder: 'ddo_...', type: 'password', required: true },
        ],
        helpText: <>Create an org token at your <a href="https://dash.deno.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Deno Deploy dashboard</a> → Organization Settings.</>,
    },
};

export function EdgeProvidersSection() {
    const { data: providers = [], isLoading, refetch } = useEdgeProviders();
    const [isConnecting, setIsConnecting] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; detail: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);

    // Form state
    const [providerType, setProviderType] = useState('cloudflare');
    const [credFields, setCredFields] = useState<Record<string, string>>({});
    const [name, setName] = useState('Cloudflare Account');

    const currentConfig = PROVIDER_CONFIGS[providerType] || PROVIDER_CONFIGS.cloudflare;

    // Re-test state for existing providers
    const [retestingId, setRetestingId] = useState<string | null>(null);
    const [retestResults, setRetestResults] = useState<Record<string, { success: boolean; detail: string }>>({});

    const handleRetest = async (providerId: string, providerType: string) => {
        setRetestingId(providerId);
        setRetestResults(prev => { const n = { ...prev }; delete n[providerId]; return n; });
        try {
            // Fetch provider details to get credentials for re-test
            const provRes = await fetch(`${API_BASE}/api/edge-providers/${providerId}`);
            const provData = await provRes.json();

            // Use the test-connection endpoint with stored credentials
            const res = await fetch(`${API_BASE}/api/edge-providers/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: providerType, credentials: provData.provider_metadata || {} }),
            });
            const data = await res.json();
            setRetestResults(prev => ({ ...prev, [providerId]: data }));
        } catch (e: any) {
            setRetestResults(prev => ({
                ...prev,
                [providerId]: { success: false, detail: e.message || 'Connection test failed' },
            }));
        } finally {
            setRetestingId(null);
        }
    };

    const handleProviderChange = (value: string) => {
        setProviderType(value);
        setCredFields({});
        setTestResult(null);
        setError(null);
        const cfg = PROVIDER_CONFIGS[value];
        if (cfg) setName(cfg.defaultName);
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/edge-providers/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: providerType, credentials: credFields }),
            });
            const data = await res.json();
            setTestResult(data);
            // Auto-name on success
            if (data.success && data.detail) {
                const detailName = data.detail.replace(/^Connected (as |to (project: )?)/, '');
                if (detailName) setName(`${currentConfig.label}: ${detailName}`);
            }
        } catch (e: any) {
            setTestResult({ success: false, detail: e.message || 'Connection failed' });
        } finally {
            setIsTesting(false);
        }
    };
    const handleSave = async () => {
        setIsConnecting(true);
        setError(null);
        try {
            const newProvider = await edgeInfrastructureApi.createProvider({
                name,
                provider: providerType,
                provider_credentials: credFields,
                is_active: true,
            });

            // For Cloudflare, also call /connect to auto-detect account_id
            if (providerType === 'cloudflare') {
                try {
                    const res = await fetch(`${API_BASE}/api/cloudflare/connect`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ provider_id: newProvider.id }),
                    });
                    const data = await res.json();
                    if (data.success && data.account_name) {
                        await edgeInfrastructureApi.updateProvider({
                            id: newProvider.id,
                            data: { name: `Cloudflare: ${data.account_name}` },
                        });
                    }
                } catch { /* non-fatal — creds already tested */ }
            }

            await refetch();
            setOpen(false);
            setCredFields({});
            setTestResult(null);
            setName(PROVIDER_CONFIGS.cloudflare.defaultName);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsConnecting(false);
        }
    };

    const requiredFieldsFilled = currentConfig.fields.filter(f => f.required).every(f => credFields[f.key]);

    const handleDelete = async (id: string) => {
        try {
            await edgeInfrastructureApi.deleteProvider(id);
            await refetch();
        } catch (e: any) {
            alert(e.message);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle>Edge Providers</CardTitle>
                    <CardDescription>Accounts connected to deploy edge infrastructure.</CardDescription>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Connect Provider</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Connect Edge Provider</DialogTitle>
                            <DialogDescription>Authorize Frontbase to deploy workers on your behalf.</DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                            <div className="space-y-2">
                                <Label>Provider</Label>
                                <Select value={providerType} onValueChange={handleProviderChange}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => (
                                            <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Display Name</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Prod Account" />
                            </div>

                            {currentConfig.fields.map(field => (
                                <div key={field.key} className="space-y-2">
                                    <Label>{field.label}{field.required && ' *'}</Label>
                                    <Input
                                        type={field.type || 'text'}
                                        value={credFields[field.key] || ''}
                                        onChange={e => setCredFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                                        placeholder={field.placeholder}
                                    />
                                </div>
                            ))}
                            {currentConfig.helpText && (
                                <p className="text-xs text-muted-foreground flex items-center mt-1">
                                    <Shield className="w-3 h-3 mr-1" />
                                    {currentConfig.helpText}
                                </p>
                            )}
                        </div>

                        {/* Test connection result */}
                        {testResult && (
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${testResult.success
                                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                : 'bg-red-500/10 text-red-600 dark:text-red-400'
                                }`}>
                                {testResult.success
                                    ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                    : <XCircle className="w-4 h-4 flex-shrink-0" />
                                }
                                <span>{testResult.detail}</span>
                            </div>
                        )}

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button
                                variant="outline"
                                onClick={handleTestConnection}
                                disabled={!requiredFieldsFilled || isTesting}
                            >
                                {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                                Test Connection
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={!testResult?.success || isConnecting}
                            >
                                {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
                                Save Connection
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : providers.length === 0 ? (
                    <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                        <Cloud className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                        <h3 className="text-sm font-medium">No Providers Connected</h3>
                        <p className="text-sm text-muted-foreground mt-1">Connect an account to start deploying.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {providers.map(p => {
                            const Icon = PROVIDER_ICONS[p.provider] || Server;
                            const testState = retestResults[p.id];
                            const metadata = (p as any).provider_metadata;
                            const hasCredentials = (p as any).has_credentials;
                            return (
                                <div key={p.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:border-primary/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-medium text-sm">{p.name}</h4>
                                                {p.is_active && <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Connected</Badge>}
                                                {hasCredentials && (
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                                                        <Shield className="w-2.5 h-2.5" /> Encrypted
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground capitalize mt-0.5">{p.provider}</p>
                                            {metadata && Object.keys(metadata).length > 0 && (
                                                <p className="text-[11px] text-muted-foreground/70 mt-0.5 font-mono">
                                                    {Object.entries(metadata).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                                                </p>
                                            )}
                                            {testState && (
                                                <div className={`flex items-center gap-1 mt-1 text-[11px] ${testState.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                                    }`}>
                                                    {testState.success
                                                        ? <CheckCircle2 className="w-3 h-3" />
                                                        : <XCircle className="w-3 h-3" />
                                                    }
                                                    <span>{testState.detail}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Re-test connection */}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-primary"
                                            disabled={retestingId === p.id}
                                            onClick={() => handleRetest(p.id, p.provider)}
                                            title="Test connection"
                                        >
                                            {retestingId === p.id
                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                : <Zap className="w-4 h-4" />
                                            }
                                        </Button>
                                        {p.provider === 'cloudflare' && p.is_active && (
                                            <ImportCloudflareWorkers providerId={p.id} />
                                        )}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Remove Provider?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will remove the credentials from Frontbase. Existing deployed Edge Engines will continue to run, but Frontbase won't be able to update them.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDelete(p.id)} className="bg-destructive hover:bg-destructive/90">
                                                        Remove
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
