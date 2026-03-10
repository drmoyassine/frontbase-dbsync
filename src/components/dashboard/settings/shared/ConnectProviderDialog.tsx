/**
 * ConnectProviderDialog — Reusable stacked modal for connecting a provider account.
 *
 * Can be used as:
 * 1. Standalone (from Accounts tab) with provider dropdown
 * 2. Scoped to a single provider (from AccountResourcePicker / Edge forms)
 *
 * Props:
 *  - provider?: string — locks to a single provider (no dropdown)
 *  - open / onOpenChange — Dialog control
 *  - onConnected(accountId) — Called after successful save
 */

import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle, Shield, CheckCircle2, XCircle, Zap, Cloud } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { edgeInfrastructureApi, useEdgeProviders } from '@/hooks/useEdgeInfrastructure';

const API_BASE = '';

// ── Provider credential form configs (shared with EdgeProvidersSection) ───
export const PROVIDER_CONFIGS: Record<string, {
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
        defaultName: 'Supabase Account',
        fields: [
            { key: 'access_token', label: 'Access Token', placeholder: 'sbp_...', type: 'password', required: true },
        ],
        helpText: <><a href="https://supabase.com/dashboard/account/tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Generate access token →</a> One token discovers all your projects.</>,
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
        ],
        helpText: <><a href="https://vercel.com/account/tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Create token →</a> One token for all your projects.</>,
    },
    netlify: {
        label: 'Netlify Edge Functions',
        defaultName: 'Netlify Account',
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'nfp_...', type: 'password', required: true },
        ],
        helpText: <><a href="https://app.netlify.com/user/applications#personal-access-tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Create token →</a> A site will be created automatically on first deploy.</>,
    },
    deno: {
        label: 'Deno Deploy',
        defaultName: 'Deno Deploy Account',
        fields: [
            { key: 'access_token', label: 'Organization Token', placeholder: 'ddo_...', type: 'password', required: true },
        ],
        helpText: <>Create an org token at your <a href="https://dash.deno.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Deno Deploy dashboard</a> → Organization Settings.</>,
    },
    neon: {
        label: 'Neon Postgres',
        defaultName: 'Neon Account',
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'neon_api_...', type: 'password', required: true },
        ],
        helpText: <>Found in <a href="https://console.neon.tech/app/settings/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Neon console</a> → Account Settings → API Keys.</>,
    },
    postgres: {
        label: 'PostgreSQL',
        defaultName: 'PostgreSQL Server',
        fields: [
            { key: 'host', label: 'Host', placeholder: 'db.example.com', required: true },
            { key: 'port', label: 'Port', placeholder: '5432' },
            { key: 'database', label: 'Database', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', placeholder: 'postgres', required: true },
            { key: 'password', label: 'Password', placeholder: 'Password', type: 'password', required: true },
        ],
    },
    mysql: {
        label: 'MySQL',
        defaultName: 'MySQL Server',
        fields: [
            { key: 'host', label: 'Host', placeholder: 'db.example.com', required: true },
            { key: 'port', label: 'Port', placeholder: '3306' },
            { key: 'database', label: 'Database', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', placeholder: 'root', required: true },
            { key: 'password', label: 'Password', placeholder: 'Password', type: 'password', required: true },
        ],
    },
    wordpress_rest: {
        label: 'WordPress REST',
        defaultName: 'WordPress Site',
        fields: [
            { key: 'base_url', label: 'Site URL', placeholder: 'https://mysite.com', required: true },
            { key: 'username', label: 'Username', placeholder: 'admin', required: true },
            { key: 'app_password', label: 'Application Password', placeholder: 'xxxx xxxx xxxx xxxx', type: 'password', required: true },
        ],
        helpText: <>Generate an Application Password in WordPress → Users → Profile → Application Passwords.</>,
    },
    turso: {
        label: 'Turso (libSQL)',
        defaultName: 'Turso Databases',
        fields: [
            { key: 'db_url', label: 'Database URL', placeholder: 'libsql://your-db.turso.io', required: true },
            { key: 'db_token', label: 'Auth Token', placeholder: 'Database auth token', type: 'password', required: true },
        ],
        helpText: <>Get your URL and token from the Turso dashboard or CLI.</>,
    },
};

interface ConnectProviderDialogProps {
    /** If set, locks the dialog to a single provider (no dropdown). */
    provider?: string;
    /** Which providers to show in the dropdown. If omitted, all are shown. */
    allowedProviders?: string[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called after a successful connection. */
    onConnected?: (accountId: string) => void;
    /** Hide the Display Name field (e.g. Turso where account is just a container). */
    hideDisplayName?: boolean;
}

export const ConnectProviderDialog: React.FC<ConnectProviderDialogProps> = ({
    provider: lockedProvider,
    allowedProviders,
    open,
    onOpenChange,
    onConnected,
    hideDisplayName,
}) => {
    const { data: providers = [], refetch } = useEdgeProviders();

    // Form state
    const [providerType, setProviderType] = useState(lockedProvider || 'cloudflare');
    const [credFields, setCredFields] = useState<Record<string, string>>({});
    const [name, setName] = useState(PROVIDER_CONFIGS[lockedProvider || 'cloudflare']?.defaultName || '');
    const [isConnecting, setIsConnecting] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; detail: string; db_name?: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Supabase project picker
    const [discoveredProjects, setDiscoveredProjects] = useState<{ ref: string; name: string; region: string; status: string }[]>([]);
    const [selectedProjectRef, setSelectedProjectRef] = useState<string>('');

    // Neon org + project picker
    const [neonOrgs, setNeonOrgs] = useState<{ id: string; name: string }[]>([]);
    const [selectedNeonOrg, setSelectedNeonOrg] = useState<string>('');
    const [neonProjects, setNeonProjects] = useState<{ id: string; name: string; region: string }[]>([]);
    const [selectedNeonProject, setSelectedNeonProject] = useState<string>('');
    const [isFetchingProjects, setIsFetchingProjects] = useState(false);

    const effectiveProvider = lockedProvider || providerType;
    const currentConfig = PROVIDER_CONFIGS[effectiveProvider] || PROVIDER_CONFIGS.cloudflare;
    const requiredFieldsFilled = currentConfig.fields.filter(f => f.required).every(f => credFields[f.key]);

    // Reset form when the dialog opens or provider changes
    useEffect(() => {
        if (open) {
            setCredFields({});
            setTestResult(null);
            setError(null);
            setDiscoveredProjects([]);
            setSelectedProjectRef('');
            setNeonOrgs([]);
            setSelectedNeonOrg('');
            setNeonProjects([]);
            setSelectedNeonProject('');
            const cfg = PROVIDER_CONFIGS[lockedProvider || providerType];
            if (cfg) setName(cfg.defaultName);
            if (lockedProvider) setProviderType(lockedProvider);
        }
    }, [open, lockedProvider]);

    // Determine which providers to show in dropdown
    const visibleProviders = allowedProviders
        ? Object.entries(PROVIDER_CONFIGS).filter(([key]) => allowedProviders.includes(key))
        : Object.entries(PROVIDER_CONFIGS);

    const resetForm = () => {
        setCredFields({});
        setTestResult(null);
        setError(null);
        setDiscoveredProjects([]);
        setSelectedProjectRef('');
        setNeonOrgs([]);
        setSelectedNeonOrg('');
        setNeonProjects([]);
        setSelectedNeonProject('');
        setName(PROVIDER_CONFIGS[lockedProvider || 'cloudflare']?.defaultName || '');
        setProviderType(lockedProvider || 'cloudflare');
    };

    const handleProviderChange = (value: string) => {
        setProviderType(value);
        setCredFields({});
        setTestResult(null);
        setError(null);
        setDiscoveredProjects([]);
        setSelectedProjectRef('');
        setNeonOrgs([]);
        setSelectedNeonOrg('');
        setNeonProjects([]);
        setSelectedNeonProject('');
        const cfg = PROVIDER_CONFIGS[value];
        if (cfg) setName(cfg.defaultName);
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        setError(null);
        setDiscoveredProjects([]);
        setSelectedProjectRef('');
        try {
            const res = await fetch(`${API_BASE}/api/edge-providers/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: effectiveProvider, credentials: credFields }),
            });
            const data = await res.json();
            setTestResult(data);
            // Auto-name on success
            if (data.success && data.detail) {
                if (effectiveProvider === 'turso' && data.db_name) {
                    setName(`Turso: ${data.db_name}`);
                    setCredFields(prev => ({ ...prev, _db_name: data.db_name }));
                } else if (effectiveProvider !== 'neon') {
                    // Neon name is set when project is selected
                    const detailName = data.detail.replace(/^Connected (as |to (project: )?)?/, '').replace(/— .*/, '').trim();
                    if (detailName) setName(`${currentConfig.label}: ${detailName}`);
                }
            }
            // Supabase project picker
            if (data.success && data.projects && data.projects.length > 0) {
                setDiscoveredProjects(data.projects);
                setSelectedProjectRef(data.projects[0].ref);
                setName(`Supabase: ${data.projects[0].name}`);
            }
            // Neon org picker
            if (data.success && data.neon_orgs && data.neon_orgs.length > 0) {
                setNeonOrgs(data.neon_orgs);
                // Auto-select first org and fetch projects
                const firstOrg = data.neon_orgs[0];
                setSelectedNeonOrg(firstOrg.id);
                setName(`Neon: ${firstOrg.name}`);
                // Fetch projects for this org
                fetchNeonProjects(firstOrg.id);
            }
        } catch (e: any) {
            setTestResult({ success: false, detail: e.message || 'Connection failed' });
        } finally {
            setIsTesting(false);
        }
    };

    // Fetch Neon projects for a given org
    const fetchNeonProjects = async (orgId: string) => {
        setIsFetchingProjects(true);
        setNeonProjects([]);
        setSelectedNeonProject('');
        try {
            const res = await fetch(`${API_BASE}/api/edge-providers/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'neon', credentials: { ...credFields, org_id: orgId } }),
            });
            const data = await res.json();
            if (data.neon_projects && data.neon_projects.length > 0) {
                setNeonProjects(data.neon_projects);
                setSelectedNeonProject(data.neon_projects[0].id);
            }
        } catch { /* non-fatal */ }
        finally { setIsFetchingProjects(false); }
    };

    const handleSave = async () => {
        setIsConnecting(true);
        setError(null);
        try {
            let newAccountId: string;

            if (effectiveProvider === 'turso') {
                // Turso: find existing or create new, then add the DB entry
                const existingTurso = providers.find(p => p.provider === 'turso');
                newAccountId = existingTurso
                    ? existingTurso.id
                    : (await edgeInfrastructureApi.createProvider({
                        name,
                        provider: 'turso',
                        provider_credentials: { databases: [] },
                        is_active: true,
                    })).id;
                const dbName = credFields._db_name || credFields.db_url?.replace('libsql://', '').split('.')[0] || 'Database';
                const addRes = await fetch(`${API_BASE}/api/edge-providers/${newAccountId}/turso-databases`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: dbName,
                        url: credFields.db_url,
                        token: credFields.db_token,
                    }),
                });
                if (addRes.status === 409) {
                    const errData = await addRes.json();
                    setError(errData.detail || 'Database already exists');
                    setIsConnecting(false);
                    return;
                }
            } else {
                // Standard providers
                let finalCreds = credFields;
                if (effectiveProvider === 'supabase' && selectedProjectRef) {
                    finalCreds = { ...credFields, project_ref: selectedProjectRef };
                } else if (effectiveProvider === 'neon' && selectedNeonOrg) {
                    finalCreds = { ...credFields, org_id: selectedNeonOrg, project_id: selectedNeonProject };
                }

                const newProvider = await edgeInfrastructureApi.createProvider({
                    name,
                    provider: effectiveProvider,
                    provider_credentials: finalCreds,
                    is_active: true,
                });
                newAccountId = newProvider.id;

                // Cloudflare: auto-detect account_id
                if (effectiveProvider === 'cloudflare') {
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
                    } catch { /* non-fatal */ }
                }
            }

            await refetch();
            resetForm();
            onOpenChange(false);
            onConnected?.(newAccountId!);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsConnecting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {lockedProvider
                            ? `Connect ${currentConfig.label}`
                            : 'Connect Edge Provider'}
                    </DialogTitle>
                    <DialogDescription>
                        {lockedProvider
                            ? `Add your ${currentConfig.label} credentials.`
                            : 'Authorize Frontbase to deploy workers on your behalf.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Provider selector — hidden when locked */}
                    {!lockedProvider && (
                        <div className="space-y-2">
                            <Label>Provider</Label>
                            <Select value={providerType} onValueChange={handleProviderChange}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {visibleProviders.map(([key, cfg]) => (
                                        <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {!hideDisplayName && (
                        <div className="space-y-2">
                            <Label>Display Name</Label>
                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Prod Account" />
                        </div>
                    )}

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

                {/* Test result */}
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

                {/* Supabase project picker */}
                {discoveredProjects.length > 0 && (
                    <div className="space-y-2">
                        <Label>Select Project</Label>
                        <Select value={selectedProjectRef} onValueChange={(val) => {
                            setSelectedProjectRef(val);
                            const proj = discoveredProjects.find(p => p.ref === val);
                            if (proj) setName(`Supabase: ${proj.name}`);
                        }}>
                            <SelectTrigger>
                                <SelectValue placeholder="Pick a Supabase project" />
                            </SelectTrigger>
                            <SelectContent>
                                {discoveredProjects.map(p => (
                                    <SelectItem key={p.ref} value={p.ref}>
                                        {p.name} <span className="text-muted-foreground ml-1">({p.region})</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Neon org picker */}
                {neonOrgs.length > 0 && (
                    <div className="space-y-2">
                        <Label>Select Organization</Label>
                        <Select value={selectedNeonOrg} onValueChange={(val) => {
                            setSelectedNeonOrg(val);
                            const org = neonOrgs.find(o => o.id === val);
                            if (org) setName(`Neon: ${org.name}`);
                            fetchNeonProjects(val);
                        }}>
                            <SelectTrigger>
                                <SelectValue placeholder="Pick a Neon organization" />
                            </SelectTrigger>
                            <SelectContent>
                                {neonOrgs.map(o => (
                                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Neon project picker */}
                {neonProjects.length > 0 && (
                    <div className="space-y-2">
                        <Label>Select Project</Label>
                        <Select value={selectedNeonProject} onValueChange={(val) => {
                            setSelectedNeonProject(val);
                            const proj = neonProjects.find(p => p.id === val);
                            if (proj) setName(`Neon: ${proj.name}`);
                        }}>
                            <SelectTrigger>
                                <SelectValue placeholder="Pick a Neon project" />
                            </SelectTrigger>
                            <SelectContent>
                                {neonProjects.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name} <span className="text-muted-foreground ml-1">({p.region})</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Loading projects indicator */}
                {isFetchingProjects && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Fetching projects…
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
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
                        disabled={!testResult?.success || isConnecting || (effectiveProvider === 'neon' && !selectedNeonProject)}
                    >
                        {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
                        {effectiveProvider === 'turso' ? 'Add Database' : 'Save Connection'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
