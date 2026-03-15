/**
 * EdgeQueuesForm
 * 
 * CRUD management for named edge queue connections (QStash, RabbitMQ, etc.).
 * Mirrors the EdgeCachesForm pattern — Dialog modal for create/edit.
 */

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEdgeQueues, EdgeQueue } from '@/hooks/useEdgeInfrastructure';
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
    Plus, Trash2, Pencil, Loader2, Check,
    Star, Shield, Zap, AlertTriangle, Server, Lock,
} from 'lucide-react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { showTestToast, TestResult } from './edgeTestToast';
import { AccountResourcePicker, DiscoveredResource } from './AccountResourcePicker';
import { PROVIDER_ICONS, EDGE_QUEUE_PROVIDERS } from './edgeConstants';

const API_BASE = '';

interface EdgeQueuesFormProps {
    withCard?: boolean;
}

/** Centralized from EDGE_QUEUE_PROVIDERS in edgeConstants.tsx */
const QUEUE_PROVIDER_OPTIONS = EDGE_QUEUE_PROVIDERS;

// Queue-specific icon
const QueueIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M16 3h5v5" /><path d="M8 3H3v5" />
        <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
        <path d="m15 9 6-6" /><path d="M16 21h5v-5" /><path d="M8 21H3v-5" />
    </svg>
);

export const EdgeQueuesForm: React.FC<EdgeQueuesFormProps> = ({ withCard = false }) => {
    const queryClient = useQueryClient();
    const { data: queues = [], isLoading } = useEdgeQueues();
    const [error, setError] = useState<string | null>(null);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form fields
    const [selectedProvider, setSelectedProvider] = useState<string>('qstash');
    const [formName, setFormName] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formToken, setFormToken] = useState('');
    const [formSigningKey, setFormSigningKey] = useState('');
    const [formNextSigningKey, setFormNextSigningKey] = useState('');
    const [formIsDefault, setFormIsDefault] = useState(false);
    const [isSaving, setIsSaving] = useState(false);


    // Test connection
    const [testingId, setTestingId] = useState<string | null>(null);

    // Delete
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Account link
    const [formAccountId, setFormAccountId] = useState<string | null>(null);

    const refetchQueues = () => queryClient.invalidateQueries({ queryKey: ['edge-queues'] });

    const resetForm = () => {
        setEditingId(null);
        setSelectedProvider('qstash');
        setFormName('');
        setFormUrl('');
        setFormToken('');
        setFormSigningKey('');
        setFormNextSigningKey('');
        setFormIsDefault(false);
        setError(null);
        setFormAccountId(null);
    };

    const openCreate = () => {
        resetForm();
        setDialogOpen(true);
    };

    const openEdit = (queue: EdgeQueue) => {
        resetForm();
        setEditingId(queue.id);
        setSelectedProvider(queue.provider);
        setFormName(queue.name);
        setFormUrl(queue.queue_url);
        setFormIsDefault(queue.is_default);
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
                queue_url: formUrl,
                is_default: formIsDefault,
            };
            if (formToken) payload.queue_token = formToken;
            if (formSigningKey) payload.signing_key = formSigningKey;
            if (formNextSigningKey) payload.next_signing_key = formNextSigningKey;
            if (formAccountId) payload.provider_account_id = formAccountId;

            const url = editingId
                ? `${API_BASE}/api/edge-queues/${editingId}`
                : `${API_BASE}/api/edge-queues/`;
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
            refetchQueues();
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
            const res = await fetch(`${API_BASE}/api/edge-queues/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            refetchQueues();
        } catch (e: any) { setError(e.message); }
        finally { setDeletingId(null); }
    };



    // Test saved queue
    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/edge-queues/${id}/test`, { method: 'POST' });
            const data: TestResult = await res.json();
            const queue = queues.find(q => q.id === id);
            const label = QUEUE_PROVIDER_OPTIONS.find(p => p.value === queue?.provider)?.label || 'Queue';
            showTestToast(data, label);
        } catch (e: any) {
            toast.error('Test failed', { description: e.message });
        } finally { setTestingId(null); }
    };

    // Test inline (before saving, inside dialog)
    const handleTestInline = async () => {
        setTestingId('inline');
        try {
            const providerLabel = QUEUE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.label || 'Queue';

            if (editingId && !formToken) {
                // Token not re-entered — use saved test endpoint
                const res = await fetch(`${API_BASE}/api/edge-queues/${editingId}/test`, { method: 'POST' });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            } else {
                const res = await fetch(`${API_BASE}/api/edge-queues/test-connection`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: selectedProvider,
                        queue_url: formUrl,
                        queue_token: formToken || null,
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
        const Icon = PROVIDER_ICONS[provider] || QueueIcon;
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
    const queueDialog = (
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
            <DialogTrigger asChild>
                <Button size="sm" onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-2" /> Connect Queue
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingId ? 'Edit Queue' : 'Connect Edge Queue'}</DialogTitle>
                    <DialogDescription>
                        {editingId
                            ? 'Update your queue connection settings.'
                            : 'Add a message queue for durable workflow execution.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Provider selector — derived from EDGE_QUEUE_PROVIDERS registry */}
                    <div className="space-y-2">
                        <Label>Provider</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {QUEUE_PROVIDER_OPTIONS.map(opt => {
                                const Icon = opt.icon;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => { opt.active && setSelectedProvider(opt.value); setFormAccountId(null); setFormUrl(''); setFormToken(''); setFormSigningKey(''); setFormNextSigningKey(''); setFormName(''); }}
                                        disabled={!opt.active}
                                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors text-left relative
                                            ${selectedProvider === opt.value
                                                ? 'border-primary bg-primary/5 text-primary'
                                                : opt.active
                                                    ? 'border-border hover:bg-accent'
                                                    : 'border-border opacity-50 cursor-not-allowed'
                                            }`}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{opt.label}</span>
                                        {!opt.active && (
                                            <Badge variant="outline" className="text-[10px] ml-auto px-1.5 py-0">Soon</Badge>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Account resource picker — PRIMARY for active providers */}
                    {(() => {
                        const prov = QUEUE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider);
                        if (!prov?.active || !prov.accountProvider || editingId) return null;
                        return (
                            <AccountResourcePicker
                                compatibleProviders={[prov.accountProvider]}
                                resourceTypeFilter={prov.resourceTypeFilter}
                                label={`Select ${prov.label}`}
                                existingUrls={queues.map(q => q.queue_url).filter(Boolean)}
                                autoSelectSingle
                                hideConnectDisplayName
                                onResourceSelected={(resource: DiscoveredResource, accountId: string) => {
                                    setFormAccountId(accountId);
                                    const url = resource.endpoint || resource.rest_url || resource.db_url || '';
                                    if (url) setFormUrl(url);
                                    if ((resource as any).token) setFormToken((resource as any).token);
                                    if ((resource as any).signing_key) setFormSigningKey((resource as any).signing_key);
                                    if ((resource as any).next_signing_key) setFormNextSigningKey((resource as any).next_signing_key);
                                    if (!formName) setFormName(resource.name || prov.label);
                                }}
                                onClear={() => {
                                    setFormAccountId(null);
                                    setFormUrl('');
                                    setFormToken('');
                                    setFormSigningKey('');
                                    setFormNextSigningKey('');
                                }}
                            />
                        );
                    })()}

                    {/* Auto-discovered summary — show when account picked */}
                    {formAccountId && (
                        <div className="space-y-3">
                            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3">
                                <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                                    <Check className="h-4 w-4" />
                                    Credentials auto-filled from connected account
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">URL, token, and signing keys are configured automatically.</p>
                            </div>
                            <div className="space-y-1">
                                <Label>Connection Name</Label>
                                <Input
                                    placeholder="e.g. Production QStash"
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                    {/* Default toggle */}
                    <div className="flex items-center gap-2">
                        <Switch
                            id="edge-queue-default-modal"
                            checked={formIsDefault}
                            onCheckedChange={setFormIsDefault}
                        />
                        <Label htmlFor="edge-queue-default-modal" className="text-sm cursor-pointer">
                            Set as default queue
                        </Label>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={handleTestInline}
                        disabled={!(formUrl || (editingId && !formToken)) || testingId === 'inline'}
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
                            <><Check className="mr-2 h-4 w-4" /> {editingId ? 'Update' : 'Add Queue'}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog >
    );

    // ─── Queue list ───
    const queueList = (
        <div className="space-y-4">
            {queues.length === 0 ? (
                <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
                    <QueueIcon className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <h3 className="text-sm font-medium">No Queues Connected</h3>
                    <p className="text-sm text-muted-foreground mt-1">Add a message queue for durable workflow execution.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {queues.map((queue) => (
                        <div key={queue.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:border-primary/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                                    {getProviderIcon(queue.provider)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-sm">{queue.name}</h4>
                                        <Badge variant="outline" className="text-xs">{queue.provider}</Badge>
                                        {queue.is_default && !queue.is_system && (
                                            <Badge variant="secondary" className="text-xs gap-1">
                                                <Star className="h-3 w-3" /> Default
                                            </Badge>
                                        )}
                                        {queue.is_system && (
                                            <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                                                <Shield className="h-3 w-3" /> System
                                            </Badge>
                                        )}
                                        {queue.has_signing_key && (
                                            <Badge variant="outline" className="text-xs gap-1 border-green-300 text-green-600 dark:border-green-700 dark:text-green-400">
                                                <Lock className="h-3 w-3" /> Signed
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {queue.engine_count > 0 && (
                                    <Badge variant="secondary" className="text-xs">
                                        {queue.engine_count} engine{queue.engine_count > 1 ? 's' : ''}
                                    </Badge>
                                )}
                                <Button
                                    variant="ghost" size="icon"
                                    onClick={() => handleTest(queue.id)}
                                    disabled={testingId === queue.id}
                                    title="Test connection"
                                >
                                    {testingId === queue.id
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Zap className="h-4 w-4" />}
                                </Button>
                                {!queue.is_system && (
                                    <>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(queue)} title="Edit">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="ghost" size="icon"
                                                    disabled={deletingId === queue.id}
                                                >
                                                    {deletingId === queue.id
                                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                                        : <Trash2 className="h-4 w-4 text-destructive" />}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete "{queue.name}"?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This removes the queue connection from Frontbase. The actual queue service is not affected.
                                                        {queue.engine_count > 0 && (
                                                            <span className="block mt-2 font-medium text-destructive">
                                                                ⚠ {queue.engine_count} edge engine{queue.engine_count > 1 ? 's' : ''} use this queue and will need to be reconfigured.
                                                            </span>
                                                        )}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDelete(queue.id)}
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
                            <QueueIcon className="h-5 w-5" />
                            Edge Queues
                        </CardTitle>
                        <CardDescription>
                            Manage message queue connections for durable workflow execution
                        </CardDescription>
                    </div>
                    {queueDialog}
                </CardHeader>
                <CardContent>{queueList}</CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-medium flex items-center gap-2">
                        <QueueIcon className="h-5 w-5" /> Edge Queues
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Manage message queue connections for durable workflow execution
                    </p>
                </div>
                {queueDialog}
            </div>
            {queueList}
        </div>
    );
};
