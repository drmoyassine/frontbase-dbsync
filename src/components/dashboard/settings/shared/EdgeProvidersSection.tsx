import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cloud, Plus, Trash2, Loader2, AlertTriangle, Shield, Server } from 'lucide-react';
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

export function EdgeProvidersSection() {
    const { data: providers = [], isLoading, refetch } = useEdgeProviders();
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);

    // Form state
    const [providerType, setProviderType] = useState('cloudflare');
    const [apiToken, setApiToken] = useState('');
    const [name, setName] = useState('Cloudflare Account');

    const handleConnect = async () => {
        setIsConnecting(true);
        setError(null);
        try {
            // 1. Create the Provider in the DB
            const newProvider = await edgeInfrastructureApi.createProvider({
                name,
                provider: providerType,
                provider_credentials: {
                    api_token: apiToken,
                },
                is_active: true,
            });

            // 2. Call /api/cloudflare/connect to verify + list workers
            const res = await fetch(`${API_BASE}/api/cloudflare/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider_id: newProvider.id }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.detail || data.error || 'Connection failed');
            }

            // 3. Update the provider with account name from Cloudflare
            if (data.account_name) {
                await edgeInfrastructureApi.updateProvider({
                    id: newProvider.id,
                    data: { name: `Cloudflare: ${data.account_name}` },
                });
            }

            await refetch();
            setOpen(false);
            setApiToken('');
            setName('Cloudflare Account');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsConnecting(false);
        }
    };

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
                                <Select value={providerType} onValueChange={setProviderType}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cloudflare">Cloudflare Workers</SelectItem>
                                        <SelectItem value="vercel" disabled>Vercel Edge (Coming Soon)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Display Name</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Prod Account" />
                            </div>

                            <div className="space-y-2">
                                <Label>API Token</Label>
                                <div className="space-y-1">
                                    <Input
                                        type="password"
                                        value={apiToken}
                                        onChange={e => setApiToken(e.target.value)}
                                        placeholder="Cloudflare API Token"
                                    />
                                    <p className="text-xs text-muted-foreground flex items-center mt-1">
                                        <Shield className="w-3 h-3 mr-1" />
                                        Requires "Workers Scripts: Edit" and "Account Settings: Read"
                                    </p>
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button onClick={handleConnect} disabled={!apiToken || isConnecting}>
                                {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
                                Authenticate Token
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
                                            </div>
                                            <p className="text-xs text-muted-foreground capitalize mt-0.5">{p.provider}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
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
