/**
 * EdgeDatabasesForm
 * 
 * CRUD management for named edge database connections.
 * Uses Dialog modal for create/edit (same pattern as EdgeCachesForm/EdgeQueuesForm).
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
    Plus, Database, Loader2, Trash2,
    Pencil, AlertTriangle, Star, Shield, Zap, Check,
} from 'lucide-react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useEdgeDatabases } from '@/hooks/useEdgeInfrastructure';
import { useQueryClient } from '@tanstack/react-query';
import { showTestToast, TestResult } from './edgeTestToast';
import { AccountResourcePicker, DiscoveredResource } from './AccountResourcePicker';
import { PROVIDER_ICONS, EDGE_DATABASE_PROVIDERS } from './edgeConstants';

const API_BASE = '';

interface EdgeDatabase {
    id: string;
    name: string;
    provider: string;
    db_url: string;
    has_token: boolean;
    is_default: boolean;
    is_system?: boolean;
    provider_account_id?: string | null;
    account_name?: string | null;
    created_at: string;
    updated_at: string;
    target_count: number;
}

interface EdgeDatabasesFormProps {
    withCard?: boolean;
}

/** Providers derived from the centralized EDGE_DATABASE_PROVIDERS registry in edgeConstants.tsx */
const DB_PROVIDER_OPTIONS = EDGE_DATABASE_PROVIDERS;

export const EdgeDatabasesForm: React.FC<EdgeDatabasesFormProps> = ({ withCard = false }) => {
    const queryClient = useQueryClient();
    const { data: databases = [], isLoading } = useEdgeDatabases();
    const [error, setError] = useState<string | null>(null);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form fields
    const [selectedProvider, setSelectedProvider] = useState<string>('turso');
    const [formName, setFormName] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formToken, setFormToken] = useState('');
    const [formIsDefault, setFormIsDefault] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Test connection
    const [testingId, setTestingId] = useState<string | null>(null);

    // Delete
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Account link
    const [formAccountId, setFormAccountId] = useState<string | null>(null);

    const refetchDatabases = () => queryClient.invalidateQueries({ queryKey: ['edge-databases'] });

    const resetForm = () => {
        setEditingId(null);
        setSelectedProvider('turso');
        setFormName('');
        setFormUrl('');
        setFormToken('');
        setFormIsDefault(false);
        setFormAccountId(null);
        setError(null);
    };

    const openCreate = () => {
        resetForm();
        setDialogOpen(true);
    };

    const openEdit = (db: EdgeDatabase) => {
        setEditingId(db.id);
        setSelectedProvider(db.provider);
        setFormName(db.name);
        setFormUrl(db.db_url);
        setFormToken('');
        setFormIsDefault(db.is_default);
        setFormAccountId(db.provider_account_id || null);
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
                db_url: formUrl,
                is_default: formIsDefault,
            };
            if (formToken) payload.db_token = formToken;
            if (formAccountId) payload.provider_account_id = formAccountId;

            const url = editingId
                ? `${API_BASE}/api/edge-databases/${editingId}`
                : `${API_BASE}/api/edge-databases/`;
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
            resetForm();
            setDialogOpen(false);
            refetchDatabases();
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
            const res = await fetch(`${API_BASE}/api/edge-databases/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            refetchDatabases();
        } catch (e: any) { setError(e.message); }
        finally { setDeletingId(null); }
    };

    // Test saved DB
    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/edge-databases/${id}/test`, { method: 'POST' });
            const data: TestResult = await res.json();
            const db = databases.find(d => d.id === id);
            const label = DB_PROVIDER_OPTIONS.find(p => p.value === db?.provider)?.label || 'Database';
            showTestToast(data, label);
        } catch (e: any) {
            showTestToast({ success: false, message: e.message }, 'Database');
        } finally { setTestingId(null); }
    };

    // Test inline (before saving)
    const handleTestInline = async () => {
        setTestingId('inline');
        try {
            const providerLabel = DB_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.label || 'Database';

            if (editingId && !formToken) {
                const res = await fetch(`${API_BASE}/api/edge-databases/${editingId}/test`, { method: 'POST' });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            } else {
                const res = await fetch(`${API_BASE}/api/edge-databases/test-connection`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formName || 'Test',
                        provider: selectedProvider,
                        db_url: formUrl,
                        db_token: formToken || null,
                    }),
                });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            }
        } catch (e: any) {
            showTestToast({ success: false, message: e.message }, 'Database');
        } finally { setTestingId(null); }
    };

    const getProviderIcon = (provider: string) => {
        const Icon = PROVIDER_ICONS[provider] || Database;
        return <Icon className="h-4 w-4" />;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // ─── Dialog modal for create / edit ───
    const dbDialog = (
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
            <DialogTrigger asChild>
                <Button size="sm" onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-2" /> Connect Database
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingId ? 'Edit Database' : 'Connect Edge Database'}</DialogTitle>
                    <DialogDescription>
                        {editingId
                            ? 'Update your database connection settings.'
                            : 'Add a database connection for your edge deployments.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Provider buttons — derived from PROVIDER_CONFIGS capabilities */}
                    {!editingId && (
                        <div className="space-y-2">
                            <Label>Provider</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {DB_PROVIDER_OPTIONS.map(opt => {
                                    const Icon = opt.icon;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            disabled={!opt.active}
                                            onClick={() => opt.active && setSelectedProvider(opt.value)}
                                            className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors text-left
                                                ${!opt.active
                                                    ? 'border-border opacity-50 cursor-not-allowed'
                                                    : selectedProvider === opt.value
                                                        ? 'border-primary bg-primary/5 text-primary'
                                                        : 'border-border hover:bg-accent'
                                                }`}
                                        >
                                            <Icon className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{opt.label}</span>
                                            {!opt.active && (
                                                <span className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Soon</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Account resource picker — shown for any provider with connected-account support */}
                    {DB_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.active && !editingId && (
                        <AccountResourcePicker
                            compatibleProviders={[selectedProvider]}
                            label={selectedProvider === 'turso'
                                ? 'From Connected Turso Account'
                                : `From Connected Neon Account`}
                            existingUrls={databases.map(d => d.db_url).filter(Boolean)}
                            // Turso-specific: auto-select the container account, label as "Select Database", hide Display Name in connect modal
                            autoSelectSingle={selectedProvider === 'turso'}
                            resourceLabel={selectedProvider === 'turso' ? 'Select Database' : undefined}
                            hideConnectDisplayName={selectedProvider === 'turso'}
                            createResourceType={selectedProvider === 'turso' ? 'turso_db' : undefined}
                            onResourceSelected={(resource: DiscoveredResource, accountId: string) => {
                                setFormAccountId(accountId);
                                if (selectedProvider === 'turso') {
                                    if (resource.db_url) setFormUrl(resource.db_url);
                                    else if (resource.hostname) setFormUrl(`libsql://${resource.hostname}`);
                                    if ((resource as any).token) setFormToken((resource as any).token);
                                    if (!formName) setFormName(resource.name || '');
                                } else if (selectedProvider === 'neon') {
                                    if (resource.connection_uri) setFormUrl(resource.connection_uri);
                                    else if (resource.db_url) setFormUrl(resource.db_url);
                                    if (!formName) setFormName(resource.name || '');
                                }
                            }}
                            onClear={() => {
                                setFormAccountId(null);
                                setFormUrl('');
                                setFormToken('');
                            }}
                        />
                    )}
                    {/* Auto-discovered summary — show when resource picked from account */}
                    {formAccountId && (
                        <div className="space-y-3">
                            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3">
                                <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                                    <Check className="h-4 w-4" />
                                    Credentials auto-filled from connected account
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">URL and auth token are configured automatically.</p>
                            </div>
                            <div className="space-y-1">
                                <Label>Connection Name</Label>
                                <Input
                                    placeholder={`e.g. Production ${selectedProvider?.charAt(0).toUpperCase()}${selectedProvider?.slice(1) || ''}`}
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Manual fields — only for inactive providers (no accounts) and edit mode */}
                    {(!DB_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.active || editingId) && !formAccountId && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label>Name</Label>
                                    <Input
                                        placeholder={`e.g. Production ${selectedProvider?.charAt(0).toUpperCase()}${selectedProvider?.slice(1) || ''}`}
                                        value={formName}
                                        onChange={e => setFormName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label>Database URL</Label>
                                    <Input
                                        placeholder={DB_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.placeholder}
                                        value={formUrl}
                                        onChange={e => setFormUrl(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label>Auth Token</Label>
                                <Input
                                    type="password"
                                    placeholder={editingId ? '(leave blank to keep existing)' : 'Database auth token'}
                                    value={formToken}
                                    onChange={e => setFormToken(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    <div className="flex items-center gap-2">
                        <Switch
                            id="edge-db-default"
                            checked={formIsDefault}
                            onCheckedChange={setFormIsDefault}
                        />
                        <Label htmlFor="edge-db-default" className="text-sm cursor-pointer">
                            Set as default database
                        </Label>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button
                        variant="outline"
                        onClick={handleTestInline}
                        disabled={(!formUrl && !formAccountId) || testingId === 'inline'}
                    >
                        {testingId === 'inline' ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing...</>
                        ) : (
                            <><Zap className="mr-2 h-4 w-4" /> Test Connection</>
                        )}
                    </Button>
                    <Button onClick={handleSave} disabled={!formName || (!formUrl && !formAccountId) || isSaving}>
                        {isSaving ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                        ) : (
                            <><Check className="mr-2 h-4 w-4" /> {editingId ? 'Update' : 'Add Database'}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );

    const formContent = (
        <div className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Existing databases list */}
            {databases.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>No edge databases configured</p>
                    <p className="text-sm mt-1">Add a database to store your published pages</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {databases.map((db) => (
                        <div key={db.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                            <div className="flex items-center gap-3">
                                {getProviderIcon(db.provider)}
                                <span className="font-medium">{db.name}</span>
                                <Badge variant="outline" className="text-xs">{db.provider}</Badge>
                                {db.is_default && !db.is_system && (
                                    <Badge variant="secondary" className="text-xs gap-1">
                                        <Star className="h-3 w-3" /> Default
                                    </Badge>
                                )}
                                {db.is_system && (
                                    <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                                        <Shield className="h-3 w-3" /> System
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                {db.target_count > 0 && (
                                    <Badge variant="secondary" className="text-xs">
                                        {db.target_count} target{db.target_count > 1 ? 's' : ''}
                                    </Badge>
                                )}
                                <Button
                                    variant="ghost" size="icon"
                                    onClick={() => handleTest(db.id)}
                                    disabled={testingId === db.id}
                                    title="Test connection"
                                >
                                    {testingId === db.id
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Zap className="h-4 w-4" />}
                                </Button>
                                {!db.is_system && (
                                    <>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(db)} title="Edit">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="ghost" size="icon"
                                                    disabled={deletingId === db.id}
                                                >
                                                    {deletingId === db.id
                                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                                        : <Trash2 className="h-4 w-4 text-destructive" />}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete "{db.name}"?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This removes the database connection from Frontbase. The actual database is not affected.
                                                        {db.target_count > 0 && (
                                                            <span className="block mt-2 font-medium text-destructive">
                                                                ⚠ {db.target_count} deployment target{db.target_count > 1 ? 's' : ''} use this database and will need to be reconfigured.
                                                            </span>
                                                        )}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDelete(db.id)}
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
                            <Database className="h-5 w-5" />
                            Edge Databases
                        </CardTitle>
                        <CardDescription>
                            Manage edge database connections for your deployment targets
                        </CardDescription>
                    </div>
                    {dbDialog}
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
};
